import test from 'node:test';
import assert from 'node:assert/strict';
import { detectStoryMediaType, isCompatibleStoryMime } from '../../api/_lib/story-media-signature.js';

test('server detects supported image/video container signatures', () => {
  assert.equal(detectStoryMediaType(Uint8Array.from([0xff, 0xd8, 0xff])), 'image/jpeg');
  assert.equal(detectStoryMediaType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectStoryMediaType(Buffer.from('GIF89a')), 'image/gif');
  assert.equal(detectStoryMediaType(Buffer.from('RIFF0000WEBP')), 'image/webp');
  assert.equal(detectStoryMediaType(Buffer.from('0000ftypisom')), 'video/mp4');
  assert.equal(detectStoryMediaType(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3])), 'video/webm');
  assert.equal(detectStoryMediaType(Buffer.from('0000ftypavif')), 'image/avif');
  assert.equal(detectStoryMediaType(Buffer.from('0000ftypheic')), null);
  assert.equal(detectStoryMediaType(Buffer.from('0000ftypzzzz')), null);
  assert.equal(detectStoryMediaType(Buffer.from('<svg/>')), null);
});

test('server requires MIME to match detected content, with documented aliases', () => {
  assert.equal(isCompatibleStoryMime('image/jpeg', 'image/jpg'), true);
  assert.equal(isCompatibleStoryMime('video/mp4', 'video/quicktime'), true);
  assert.equal(isCompatibleStoryMime('image/png', 'application/octet-stream'), true);
  assert.equal(isCompatibleStoryMime('video/webm', 'video/mp4'), false);
  assert.equal(isCompatibleStoryMime(null, 'image/png'), false);
});
