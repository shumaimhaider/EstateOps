import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NotFoundError } from '@estateops/kernel';

/**
 * Stores uploaded contract PDFs on local disk, behind the FileStore port (put, get, remove by key).
 * An object-storage adapter (S3) replaces this without changing any use case. Keys are checked so a
 * crafted key can never leave the storage directory.
 */
export function createLocalFileStore(rootDir) {
  const root = path.resolve(rootDir);
  const resolve = (key) => {
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new Error('Invalid file key');
    return target;
  };
  return {
    async put(key, buffer) {
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, buffer);
    },
    async get(key) {
      try {
        return await readFile(resolve(key));
      } catch (error) {
        if (error.code === 'ENOENT') throw new NotFoundError('File not found');
        throw error;
      }
    },
    async remove(key) {
      await rm(resolve(key), { force: true });
    },
  };
}
