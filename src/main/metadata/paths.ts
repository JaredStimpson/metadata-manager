import path from 'node:path';

export function normalizeRelativePath(rootPath: string, absolutePath: string): string {
  return path.relative(rootPath, absolutePath).split(path.sep).join('/');
}

export function mirrorSidecarPath(sidecarRoot: string, sourceRootId: string, relativePath: string): string {
  const segments = relativePath.split('/').filter(Boolean);
  return path.join(sidecarRoot, sourceRootId, ...segments) + '.xmp';
}

export function preferredAdjacentSidecarPath(photoPath: string): string {
  return `${photoPath}.xmp`;
}

export function fallbackAdjacentSidecarPath(photoPath: string): string {
  const parsed = path.parse(photoPath);
  return path.join(parsed.dir, `${parsed.name}.xmp`);
}

export function stagingMediaPath(destination: string, sourceRootName: string, relativePath: string): string {
  const safeRoot = sourceRootName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'photos';
  return path.join(destination, safeRoot, ...relativePath.split('/').filter(Boolean));
}

