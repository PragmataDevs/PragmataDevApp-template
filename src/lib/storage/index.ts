// ─── Storage Module ──────────────────────────────────────────
// Centralized file upload, optimization, and URL resolution.
// Every feature that uploads files should use this module.

export { optimizeFile, type OptimizeOptions } from './optimizeFile';
export { resolveSignedUrl, resolveSignedUrls } from './resolveUrl';
export {
  uploadFile,
  deleteFile,
  AVATAR_PRESET,
  CHAT_IMAGE_PRESET,
  type UploadResult,
  type UploadOptions,
} from './uploadFile';
