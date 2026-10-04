import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { config, assertR2 } from "./config.mjs";

assertR2();
const client = new S3Client({
  region: "auto",
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey }
});

export async function downloadToFile(key, destination) {
  const result = await client.send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  if (!result.Body) throw new Error(`R2 source vide: ${key}`);
  await pipeline(result.Body, createWriteStream(destination));
  return { size: Number(result.ContentLength || 0), contentType: result.ContentType || "application/octet-stream" };
}

export async function putFile(key, body, contentType) {
  const stream = (await import("node:fs")).createReadStream(body);
  await client.send(new PutObjectCommand({ Bucket: config.r2.bucket, Key: key, Body: stream, ContentType: contentType }));
  return publicUrl(key);
}

export async function head(key) {
  return client.send(new HeadObjectCommand({ Bucket: config.r2.bucket, Key: key }));
}

export function publicUrl(key) {
  if (!config.r2.publicBaseUrl) return key;
  return `${config.r2.publicBaseUrl}/${String(key).replace(/^\/+/, "")}`;
}
