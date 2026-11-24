import { randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { env } from '../config/env.js';

/**
 * Where uploaded files live. Local disk in development; an S3-compatible implementation can
 * replace it later without changing callers.
 */
export interface FileStorage {
  save(key: string, data: Buffer): Promise<void>;
  read(key: string): Readable;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^[a-f0-9]{2}\/[a-f0-9]{48}\.(jpg|png|webp)$/;

/** Random storage key, e.g. "3f/3fa9…c1.jpg". User-supplied names are never part of it. */
export function newStorageKey(extension: 'jpg' | 'png' | 'webp'): string {
  const name = randomBytes(24).toString('hex');
  return `${name.slice(0, 2)}/${name}.${extension}`;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  /** Resolves a key to a path, refusing anything that is not a generated key inside the root. */
  private resolve(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key.');
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) throw new Error('Invalid storage key.');
    return target;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    // 'wx' fails instead of overwriting if a key ever collides.
    await writeFile(target, data, { flag: 'wx', mode: 0o640 });
  }

  read(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

export const fileStorage: FileStorage = new LocalFileStorage(env.UPLOAD_DIR);
