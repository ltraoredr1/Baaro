import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectMediaCodeJs,
  validateStoryFiles,
  validateStoryMetadataJs,
} from '../../src/features/stories/lib/nativeValidation.js';
import { buildStoryPayloads } from '../../src/features/stories/lib/buildStoryPayloads.js';

const MiB = 1024 * 1024;

function fakeFile(name, type, bytes, size = bytes.length) {
  const content = Uint8Array.from(bytes);
  return {
    name, type, size,
    slice: () => ({ arrayBuffer: async () => content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength) }),
  };
}

test('metadata accepts text, single item and exact limits', () => {
  assert.equal(validateStoryMetadataJs({ fileCount: 0, maxFileBytes: 0, publishDelayMs: 0 }), 0);
  assert.equal(validateStoryMetadataJs({ fileCount: 10, maxFileBytes: 100 * MiB, publishDelayMs: 30 * 86_400_000 }), 0);
});

test('metadata rejects overflow count, size and scheduling', () => {
  assert.equal(validateStoryMetadataJs({ fileCount: 11, maxFileBytes: 0, publishDelayMs: 0 }), 1);
  assert.equal(validateStoryMetadataJs({ fileCount: 1, maxFileBytes: 100 * MiB + 1, publishDelayMs: 0 }), 2);
  assert.equal(validateStoryMetadataJs({ fileCount: 1, maxFileBytes: 0, publishDelayMs: 59_999 }), 3);
  assert.equal(validateStoryMetadataJs({ fileCount: 1, maxFileBytes: 0, publishDelayMs: 30 * 86_400_000 + 1 }), 3);
});

test('JS fallback detects known signatures and refuses unknown files', () => {
  assert.equal(detectMediaCodeJs(Uint8Array.from([0xff, 0xd8, 0xff])), 1);
  assert.equal(detectMediaCodeJs(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 2);
  assert.equal(detectMediaCodeJs(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), 6);
  assert.equal(detectMediaCodeJs(Buffer.from('0000ftypheic')), 0);
  assert.equal(detectMediaCodeJs(Buffer.from('0000ftypzzzz')), 0);
  assert.equal(detectMediaCodeJs(Uint8Array.from([1, 2, 3, 4])), 0);
});

test('file validation cross-checks declared MIME against file signature', async () => {
  const jpeg = fakeFile('ok.jpg', 'image/jpeg', [0xff, 0xd8, 0xff, 0x00]);
  assert.deepEqual(await validateStoryFiles([jpeg]), [{ mediaType: 'image', mime: 'image/jpeg' }]);
  const spoofed = fakeFile('spoof.jpg', 'image/jpeg', [0x1a, 0x45, 0xdf, 0xa3]);
  await assert.rejects(() => validateStoryFiles([spoofed]), /ne correspond pas/);
  await assert.rejects(() => validateStoryFiles([fakeFile('bad.bin', '', [1, 2, 3])]), /non pris en charge/);
});

test('composer payload builder preserves every selected media and explicit expiry', () => {
  const rows = buildStoryPayloads({
    userId: 'author', caption: '  catalogue  ', background: '#123', audio: null,
    hasPoll: false, pollData: null, product: null, stickers: [],
    mediaAssets: [{ url: 'https://media/1' }, { url: 'https://media/2' }],
    mediaKinds: [{ mediaType: 'image' }, { mediaType: 'video' }],
    publishAt: '2026-11-09T17:00:00.000Z', expiresAt: '2026-11-10T17:00:00.000Z',
  });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.media_url), ['https://media/1', 'https://media/2']);
  assert.deepEqual(rows.map((row) => row.media_type), ['image', 'video']);
  assert.ok(rows.every((row) => row.caption === 'catalogue' && row.publish_at && row.expires_at));

  const text = buildStoryPayloads({ userId: 'author', caption: 'Hello', background: '#123', stickers: [], publishAt: 'now', expiresAt: 'later' });
  assert.equal(text.length, 1);
  assert.equal(text[0].media_type, 'text');
  assert.equal(text[0].media_url, null);
});
