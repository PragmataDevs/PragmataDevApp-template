// ─── Image Optimization (Canvas-based, 0 dependencies) ─────

export interface OptimizeOptions {
  /** Max width in px (default: 1200) */
  maxWidth?: number;
  /** Max height in px (default: 1200) */
  maxHeight?: number;
  /** Output quality 0-1 (default: 0.8) */
  quality?: number;
  /** Output format (default: 'image/webp') */
  format?: 'image/webp' | 'image/jpeg' | 'image/png';
}

const DEFAULTS: Required<OptimizeOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.8,
  format: 'image/webp',
};

/**
 * Optimizes an image File using the browser's Canvas API.
 * - Resizes to fit within maxWidth × maxHeight (preserves aspect ratio)
 * - Converts to WebP (or specified format) at the given quality
 * - Returns the original file if it's not an image or if the result is bigger
 *
 * Non-image files pass through unchanged.
 */
export async function optimizeFile(
  file: File,
  options?: OptimizeOptions
): Promise<File> {
  // Non-images pass through
  if (!file.type.startsWith('image/')) return file;

  // SVGs can't be canvas-optimized meaningfully
  if (file.type === 'image/svg+xml') return file;

  const opts = { ...DEFAULTS, ...options };

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = calculateDimensions(
      bitmap.width,
      bitmap.height,
      opts.maxWidth,
      opts.maxHeight
    );

    // If no resize needed and already webp, skip
    if (
      width === bitmap.width &&
      height === bitmap.height &&
      file.type === opts.format
    ) {
      bitmap.close();
      return file;
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await canvas.convertToBlob({
      type: opts.format,
      quality: opts.quality,
    });

    // If optimized version is bigger, return original
    if (blob.size >= file.size) return file;

    // Build new filename with correct extension
    const ext = opts.format === 'image/webp' ? '.webp' : opts.format === 'image/jpeg' ? '.jpg' : '.png';
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const newName = `${baseName}${ext}`;

    return new File([blob], newName, { type: opts.format });
  } catch {
    // If anything fails (e.g. corrupt image), return original
    return file;
  }
}

/** Calculate dimensions that fit inside maxW × maxH keeping aspect ratio */
function calculateDimensions(
  origW: number,
  origH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (origW <= maxW && origH <= maxH) {
    return { width: origW, height: origH };
  }

  const ratio = Math.min(maxW / origW, maxH / origH);
  return {
    width: Math.round(origW * ratio),
    height: Math.round(origH * ratio),
  };
}
