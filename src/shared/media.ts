export const supportedImageExtensions = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.jp2',
  '.jpeg',
  '.jpg',
  '.jpe',
  '.insp',
  '.jxl',
  '.mpo',
  '.png',
  '.psd',
  '.raw',
  '.rw2',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
  '.dng',
  '.cr2',
  '.cr3',
  '.nef',
  '.arw',
  '.raf',
  '.orf',
  '.pef',
  '.sr2',
  '.x3f'
]);

export function isSupportedImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  for (const extension of supportedImageExtensions) {
    if (lower.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

