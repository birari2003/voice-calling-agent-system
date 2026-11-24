import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { LocalFileStorage, newStorageKey } from '../src/storage/fileStorage.js';
import {
  detectImageType,
  safeDisplayName,
  validateImage,
  UploadValidationError,
} from '../src/storage/imageValidation.js';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

describe('image validation', () => {
  it('detects JPEG, PNG and WebP by signature', () => {
    assert.equal(detectImageType(JPEG), 'image/jpeg');
    assert.equal(detectImageType(PNG), 'image/png');
    assert.equal(detectImageType(WEBP), 'image/webp');
    assert.equal(detectImageType(HTML), null);
    assert.equal(detectImageType(Buffer.alloc(0)), null);
  });

  it('accepts a file only when type, extension and contents agree', () => {
    assert.equal(validateImage(JPEG, 'image/jpeg', 'pothole.JPEG'), 'image/jpeg');
    assert.equal(validateImage(PNG, 'image/png; charset=binary', 'drain.png'), 'image/png');
  });

  it('rejects disguised and mismatched files', () => {
    // HTML renamed to .jpg with an image MIME type
    assert.throws(() => validateImage(HTML, 'image/jpeg', 'photo.jpg'), UploadValidationError);
    // real PNG claiming to be JPEG
    assert.throws(() => validateImage(PNG, 'image/jpeg', 'photo.jpg'), UploadValidationError);
    // real JPEG with a dangerous extension
    assert.throws(() => validateImage(JPEG, 'image/jpeg', 'photo.svg'), UploadValidationError);
    assert.throws(() => validateImage(JPEG, 'image/jpeg', 'photo.jpg.html'), UploadValidationError);
  });

  it('makes display names safe', () => {
    assert.equal(safeDisplayName('../../etc/passwd'), 'passwd');
    assert.equal(safeDisplayName('C:\\Users\\a\\IMG_1.jpg'), 'IMG_1.jpg');
    assert.equal(safeDisplayName('a"b<c>.jpg'), 'abc.jpg');
    assert.equal(safeDisplayName(''), 'photo');
  });
});

describe('local file storage', () => {
  it('generates random keys that never include user input', () => {
    const key = newStorageKey('jpg');
    assert.match(key, /^[a-f0-9]{2}\/[a-f0-9]{48}\.jpg$/);
    assert.notEqual(newStorageKey('jpg'), key);
  });

  it('stores and reads files, and refuses keys outside its root', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'nagarseva-storage-'));
    try {
      const storage = new LocalFileStorage(root);
      const key = newStorageKey('png');
      await storage.save(key, PNG);
      assert.deepEqual(await readFile(path.join(root, key)), PNG);
      const chunks: Buffer[] = [];
      for await (const chunk of storage.read(key)) chunks.push(chunk as Buffer);
      assert.deepEqual(Buffer.concat(chunks), PNG);
      await assert.rejects(storage.save(key, PNG), 'never overwrites an existing key');
      for (const bad of ['../secret.png', 'ab/../../x.png', '/etc/passwd', 'ab/name.html'])
        assert.throws(() => storage.read(bad), /Invalid storage key/, bad);
      await storage.remove(key);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
