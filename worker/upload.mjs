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

const MAX_OBJECT_BYTES = 5 * 1024 * 1024 * 1024 * 1024; // R2 object ceiling: 5 TB
const PART_SIZE = 512 * 1024 * 1024; // 512 MiB; keeps part count <= 10,000 up to 5 TB

function r2() {
  assertR2();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
}

function ext(name, mime) {
  const match = String(name || '').match(/\.([a-z0-9]{1,10})$/i);
  if (match) return match[1].toLowerCase();
  const map = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' };
  return map[mime] || 'bin';
}

export async function prepareLargeVideo(req, body) {
  const user = await requireSupabaseUser(req);
  const size = Number(body.size);
  const contentType = String(body.contentType || 'video/mp4');
  const fileName = String(body.fileName || 'video').slice(0, 255);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_OBJECT_BYTES) {
    const error = new Error('Vidéo invalide ou au-delà de la limite du stockage R2 (5 To)');
    error.status = 400;
    throw error;
  }
  if (!contentType.startsWith('video/')) {
    const error = new Error('Seules les vidéos sont acceptées');
    error.status = 400;
    throw error;
  }
  const client = r2();
  const bucket = config.r2.bucket;
  const key = `videos/${user.id}/${crypto.randomUUID()}.${ext(fileName, contentType)}`;
  const created = await client.send(new CreateMultipartUploadCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    Metadata: { 'baaro-user-id': user.id, 'baaro-original-name': fileName },
  }));
  const uploadId = created.UploadId;
  if (!uploadId) throw new Error('Impossible de créer le multipart upload');
  const partCount = Math.ceil(size / PART_SIZE);
  if (partCount > 10000) throw new Error('Nombre de parties R2 dépassé');
  return { uploadId, key, size, partSize: PART_SIZE, partCount, bucket, publicUrl: `${config.r2.publicBaseUrl}/${key}` };
}

export async function signLargeVideoParts(req, body) {
  await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  const firstPart = Number(body.firstPart || 1);
  const count = Number(body.count || 1);
  if (!uploadId || !key.startsWith('videos/') || !Number.isInteger(firstPart) || !Number.isInteger(count) || count < 1 || count > 100) {
    const error = new Error('Paramètres multipart invalides'); error.status = 400; throw error;
  }
  const client = r2();
  const urls = [];
  for (let i = 0; i < count; i += 1) {
    const partNumber = firstPart + i;
    if (partNumber > 10000) break;
    const command = new UploadPartCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId, PartNumber: partNumber });
    urls.push({ partNumber, url: await getSignedUrl(client, command, { expiresIn: 3600 }) });
  }
  return { urls };
}

export async function completeLargeVideo(req, body) {
  await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  const parts = Array.isArray(body.parts) ? body.parts : [];
  if (!uploadId || !key.startsWith('videos/') || !parts.length || parts.length > 10000) {
    const error = new Error('Parties multipart invalides'); error.status = 400; throw error;
  }
  const normalized = parts.map((p) => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag || '').replace(/^"|"$/g, '') }))
    .filter((p) => Number.isInteger(p.PartNumber) && p.PartNumber >= 1 && p.PartNumber <= 10000 && p.ETag);
  normalized.sort((a, b) => a.PartNumber - b.PartNumber);
  if (!normalized.length || normalized.some((p, i) => i && p.PartNumber === normalized[i - 1].PartNumber)) {
    const error = new Error('Liste de parties invalide'); error.status = 400; throw error;
  }
  const client = r2();
  await client.send(new CompleteMultipartUploadCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: normalized } }));
  return { url: `${config.r2.publicBaseUrl}/${key}`, key };
}

export async function abortLargeVideo(req, body) {
  await requireSupabaseUser(req);
  const uploadId = String(body.uploadId || '');
  const key = String(body.key || '');
  if (!uploadId || !key.startsWith('videos/')) return { ok: true };
  await r2().send(new AbortMultipartUploadCommand({ Bucket: config.r2.bucket, Key: key, UploadId: uploadId }));
  return { ok: true };
}
