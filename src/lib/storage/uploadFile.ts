import { supabase } from '@/lib/supabase';
import { optimizeFile, type OptimizeOptions } from './optimizeFile';
import { resolveSignedUrl } from './resolveUrl';

// ─── Upload Result ───────────────────────────────────────────

export interface UploadResult {
  /** Storage path to persist in the database (e.g. "avatars/uuid.webp") */
  storagePath: string;
  /** Ready-to-use signed URL for immediate display */
  signedUrl: string;
}

// ─── Upload Options ──────────────────────────────────────────

export interface UploadOptions {
  /** Image optimization settings. Pass `false` to skip optimization entirely. */
  optimize?: OptimizeOptions | false;
  /** Upsert mode — overwrite if the path already exists (default: false) */
  upsert?: boolean;
}

// ─── Presets ─────────────────────────────────────────────────

/** Preset for user avatars: 256px, high quality WebP */
export const AVATAR_PRESET: OptimizeOptions = {
  maxWidth: 256,
  maxHeight: 256,
  quality: 0.85,
  format: 'image/webp',
};

/** Preset for chat images: 1200px, good quality WebP */
export const CHAT_IMAGE_PRESET: OptimizeOptions = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.8,
  format: 'image/webp',
};

// ─── Core Upload Function ────────────────────────────────────

/**
 * Centralized file upload to Supabase Storage.
 *
 * 1. Optimizes images (resize + WebP conversion) if applicable
 * 2. Uploads to the specified bucket/path
 * 3. Returns the storage path (for DB) and a signed URL (for display)
 *
 * @param bucket  Supabase Storage bucket name (e.g. "attachments")
 * @param path    Destination path inside the bucket (e.g. "avatars/uuid.webp")
 * @param file    The File to upload
 * @param options Upload options (optimization settings, upsert mode)
 *
 * @example
 * // Avatar upload
 * const result = await uploadFile('attachments', `avatars/${userId}.webp`, file, {
 *   optimize: AVATAR_PRESET,
 *   upsert: true,
 * });
 * // result.storagePath → "avatars/uuid.webp"
 * // result.signedUrl   → "https://...signed..."
 *
 * @example
 * // Chat file upload (auto-optimizes images, passes through PDFs)
 * const result = await uploadFile('attachments', `chat/${convId}/${Date.now()}_${file.name}`, file, {
 *   optimize: CHAT_IMAGE_PRESET,
 * });
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File,
  options?: UploadOptions
): Promise<UploadResult> {
  // 1. Optimize if applicable
  let processedFile = file;
  if (options?.optimize !== false) {
    processedFile = await optimizeFile(file, options?.optimize || undefined);
  }

  // If optimization changed the extension, adjust the path
  if (processedFile !== file && processedFile.name !== file.name) {
    const ext = processedFile.name.match(/\.[^.]+$/)?.[0] || '';
    path = path.replace(/\.[^.]+$/, ext);
  }

  // 2. Upload
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, processedFile, {
      upsert: options?.upsert ?? false,
      contentType: processedFile.type,
    });

  if (error) throw error;

  // 3. Generate signed URL for immediate display
  const signedUrl = await resolveSignedUrl(bucket, path);

  return { storagePath: path, signedUrl };
}

// ─── Delete Helper ───────────────────────────────────────────

/**
 * Delete a file from Supabase Storage.
 *
 * @param bucket  Supabase Storage bucket name
 * @param path    Storage path to delete
 */
export async function deleteFile(bucket: string, path: string): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}
