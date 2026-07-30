import { createClient } from '@supabase/supabase-js';

const DEFAULT_BUCKETS = [
  { id: 'documents', public: false },
] as const;

export async function ensureStorageBuckets(
  supabaseUrl: string,
  serviceRoleKey: string,
  bucketIds: string[] = DEFAULT_BUCKETS.map((b) => b.id),
): Promise<string[]> {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const created: string[] = [];

  for (const bucketId of bucketIds) {
    const meta = DEFAULT_BUCKETS.find((b) => b.id === bucketId);
    const { data: existing, error: getError } = await admin.storage.getBucket(bucketId);
    if (existing && !getError) continue;

    const { error } = await admin.storage.createBucket(bucketId, {
      public: meta?.public ?? false,
      fileSizeLimit: 52_428_800,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already exists')) continue;
      throw new Error(`No se pudo crear bucket "${bucketId}": ${error.message}`);
    }

    created.push(bucketId);
  }

  return created;
}
