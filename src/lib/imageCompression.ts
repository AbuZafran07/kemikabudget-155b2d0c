/**
 * Compress an image file to target quality using Canvas API.
 * Returns original file if not an image or compression fails.
 */
export async function compressImage(
  file: File,
  quality: number = 0.7,
  maxSizeBytes: number = 1 * 1024 * 1024
): Promise<File> {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp'];
  
  // Skip non-image files
  if (!imageTypes.includes(file.type)) {
    return file;
  }

  // If already under limit, return as-is
  if (file.size <= maxSizeBytes) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    
    // Calculate dimensions - scale down if very large
    let { width, height } = bitmap;
    const maxDimension = 2048;
    if (width > maxDimension || height > maxDimension) {
      const ratio = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Always output as JPEG for best compression
    const outputType = 'image/jpeg';
    let currentQuality = quality;
    let blob = await canvas.convertToBlob({ type: outputType, quality: currentQuality });

    // If still too large, reduce quality progressively
    while (blob.size > maxSizeBytes && currentQuality > 0.2) {
      currentQuality -= 0.1;
      blob = await canvas.convertToBlob({ type: outputType, quality: currentQuality });
    }

    // Change extension to .jpg if we converted
    const baseName = file.name.replace(/\.[^.]+$/, '');
    const newName = `${baseName}.jpg`;

    return new File([blob], newName, { type: outputType });
  } catch (error) {
    console.warn('[imageCompression] Failed to compress, returning original:', error);
    return file;
  }
}

export const MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1MB
export const MAX_FILE_SIZE_LABEL = '1MB';
