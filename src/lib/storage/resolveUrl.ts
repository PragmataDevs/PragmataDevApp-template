import { supabase } from '@/lib/supabase';

// ─── Signed URL Resolution ──────────────────────────────────

/**
 * Resolves a storage path (or legacy full URL) to a Supabase signed URL.
 *
 * Handles three cases:
 * 1. Raw storage path  → "chat/uuid/file.png" → generates signed URL
 * 2. Legacy public URL → "https://.../object/public/attachments/chat/..." → extracts path, generates signed URL
 * 3. Already a valid signed URL → returns as-is (won't match pattern)
 *
 * @param bucket  Supabase Storage bucket name (e.g. "attachments")
 * @param pathOrUrl  Storage path or legacy full URL
 * @param expiresIn  Signed URL expiry in seconds (default: 3600 = 1 hour)
 */
export async function resolveSignedUrl(
  bucket: string,
  pathOrUrl: string,
  expiresIn = 3600
): Promise<string> {
  let storagePath = pathOrUrl;

  // If it's a full URL, try to extract the storage path
  if (storagePath.startsWith('http')) {
    const pattern = new RegExp(
      `\\/storage\\/v1\\/object\\/(?:public|sign)\\/${bucket}\\/(.+?)(?:\\?.*)?$`
    );
    const match = storagePath.match(pattern);
    if (match) {
      storagePath = match[1];
    } else {
      // Can't parse — return as-is (might already be a valid signed URL)
      return pathOrUrl;
    }
  }

  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(storagePath, expiresIn);

  return data?.signedUrl || pathOrUrl;
}

/**
 * Batch-resolve multiple paths to signed URLs.
 */
export async function resolveSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn = 3600
): Promise<string[]> {
  return Promise.all(
    paths.map((p) => resolveSignedUrl(bucket, p, expiresIn))
  );
}
