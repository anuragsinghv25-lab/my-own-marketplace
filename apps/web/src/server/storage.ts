import 'server-only';
import { getDb } from '@orbita/db';
import { databaseStorage, type FileStorage } from '@orbita/sellers';
import { env } from './env';
import { adminSupabase } from './supabase';

const BUCKET = 'evidence';
let bucketReady = false;

/** Private Supabase Storage bucket (free plan: 1 GB). Created on first use. */
const supabaseStorage: FileStorage = {
  async put(path, bytes, contentType) {
    const s = adminSupabase().storage;
    if (!bucketReady) {
      const { error } = await s.createBucket(BUCKET, { public: false, fileSizeLimit: 4 * 1024 * 1024 });
      if (error && !/already exists/i.test(error.message)) throw new Error(`Storage: ${error.message}`);
      bucketReady = true;
    }
    const { error } = await s.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) throw new Error(`Storage: ${error.message}`);
  },
  async get(path) {
    const { data, error } = await adminSupabase().storage.from(BUCKET).download(path);
    if (error || !data) throw new Error(`Storage: ${error?.message ?? 'not found'}`);
    return new Uint8Array(await data.arrayBuffer());
  },
};

/**
 * Where evidence files live: Supabase Storage in deployments, the database when FILE_STORAGE=database
 * (local development without Supabase).
 */
export function fileStorage(): FileStorage {
  return env.fileStorage() === 'database' ? databaseStorage(getDb()) : supabaseStorage;
}
