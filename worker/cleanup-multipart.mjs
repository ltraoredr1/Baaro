import { cleanupAbandonedMultipartUploads } from "./upload.mjs";

const olderThanHours =
  process.env.BAARO_MULTIPART_CLEANUP_HOURS || "24";

const result = await cleanupAbandonedMultipartUploads({
  olderThanHours,
});

console.log(JSON.stringify({ ok: true, ...result }));
