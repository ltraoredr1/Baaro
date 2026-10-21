import crypto from 'node:crypto';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config, assertR2 } from './lib/config.mjs';
import { requireSupabaseUser } from './lib/auth.mjs';

const MAX_OBJECT_BYTES = 5 * 1024 * 1024 * 1024 * 1024; // plafond objet R2 : 5 To
const MAX_PARTS = 10000;
const MIB = 1024 * 1024;
const MIN_PART_SIZE = 64 * MIB; // parties raisonnables pour un telephone (memoire, reprise)

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Taille de partie : 64 Mio minimum, augmentee si besoin pour rester <= 10 000 parties
function partSizeFor(size) {
  const needed = Math.ceil(size / MAX_PARTS);
  return Math.max(MIN_PART_SIZE, Math.ceil(needed / MIB) * MIB);
}

function r2() {
  assertR2();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
    // Evite des URLs signees refusees par R2 avec les SDK recents (meme reglage que api/media.js)
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
}

function ext(name, mime) {
  const match = String(name || '').match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const map = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' };
  return map[mime] || 'bin';
}

// Une cle n'est utilisable que par son proprietaire : videos/<id utilisateur>/...
function assertOwnKey(user, key) {
  if (!key || key.includes('..') || !key.startsWith(`videos/${user.id}/`)) {
    throw httpError('Acces refuse a cet envoi', 403);
  }
}

export async function prepareLargeVideo(req, body) {
  const user = await requireSupabaseUser(req);
  const size = Number(body.size);
  const contentType = String(body.contentType || 'video/mp4');
  const fileName = String(body.fileName || 'video').slice(0, 255);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_OBJECT_BYTES) {
    throw httpError('Vidéo invalide ou au-delà de la limite du stockage R2 (5 To)');
  }
  if (!contentType.startsWith('video/')) {
    throw httpError('Seules les vidéos sont acceptées');
  }
  if (!config.r2.publicBaseUrl) {
    throw httpError('R2_PUBLIC_BASE_URL manquante sur le worker', 500);
  }

  // Calcul et verification AVANT de creer le multipart (sinon envoi orphelin)
  const partSize = partSizeFor(size);
  const partCount = Math.ceil(size / partSize);
  if (partCount > MAX_PARTS) throw httpError('Nombre de parties R2 dépassé');

  const client = r2();
  const bucket = config.r2.bucket;
  const key = `videos/${user.id}/${crypto.randomUUID()}.${ext(fileName, contentType)}`;
  const created = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Metadata: { 'baaro-user-id': user.id, 'baaro-original-name': encodeURIComponent(fileName) },
  }));
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error('Impossible de créer le multipart upload');
  return { uploadId, key, size, partSize, partCount, bucket, publicUrl: `${config.r2.publicBaseUrl}/${key}` };
}

export async function signLargeVideoParts(req, body) {
  const user = await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  const firstPart = Number(body.firstPart || 1);
  const count = Number(body.count || 1);
  if (!uploadId || !Number.isInteger(firstPart) || firstPart < 1 || !Number.isInteger(count) || count < 1 || count > 100) {
    throw httpError('Paramètres multipart invalides');
  }
  assertOwnKey(user, key);
  const client = r2();
  const urls = [];
  for (let i = 0; i < count; i += 1) {
    const partNumber = firstPart + i;
    if (partNumber > MAX_PARTS) break;
    const command = new UploadPartCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    urls.push({ partNumber, url: await getSignedUrl(client, command, { expiresIn: 3600 }) });
  }
  return { urls };
}

export async function completeLargeVideo(req, body) {
  const user = await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  const parts = Array.isArray(body.parts) ? body.parts : [];
  if (!uploadId || !parts.length || parts.length > MAX_PARTS) {
    throw httpError('Parties multipart invalides');
  }
  assertOwnKey(user, key);
  const normalized = parts
    .map((p) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag || '').replace(/^"|"$/g, '') }))
    .filter((p) => Number.isInteger(p.PartNumber) && p.PartNumber >= 1 && p.PartNumber <= MAX_PARTS && p.ETag);
  normalized.sort((a, b) => a.PartNumber - b.PartNumber);
  if (!normalized.length || normalized.length !== parts.length || normalized.some((p, i) => i && p.PartNumber === normalized[i - 1].PartNumber)) {
    throw httpError('Liste de parties invalide (ETag manquant : vérifie ExposeHeaders du CORS R2)');
  }
  const client = r2();
  await client.send(new CompleteMultipartUploadCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: normalized } }));
  return { url: `${config.r2.publicBaseUrl}/${key}`, key };
}

export async function abortLargeVideo(req, body) {
  const user = await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  if (!uploadId || !key.startsWith('videos/')) return { ok: true };
  assertOwnKey(user, key);
  await r2().send(new AbortMultipartUploadCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId }));
  return { ok: true };
}
