// Lightweight, browser-safe subset of your mapper’s rules

export const EXCLUDED_FOLDERS = new Set([
  'node_modules','.git','__pycache__','.venv','.mypy_cache','dist','build','target','out','bin','obj','logs'
]);

// Obvious binary-ish extensions (lowercase)
export const FORCE_BINARY_EXTENSIONS = new Set([
  // archives
  '.zip','.rar','.7z','.gz','.bz2','.xz','.tar.gz','.tgz',
  // images
  '.png','.jpg','.jpeg','.gif','.bmp','.ico','.webp','.tif','.tiff',
  // audio/video
  '.mp3','.wav','.ogg','.flac','.aac','.m4a','.mp4','.mkv','.avi','.mov','.webm','.flv','.wmv',
  // docs
  '.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp',
  // compiled/artifacts
  '.exe','.dll','.so','.o','.a','.lib','.class','.jar','.wasm',
  // fonts
  '.ttf','.otf','.woff','.woff2',
]);

export function hasBinaryExt(path: string) {
  const lower = path.toLowerCase();
  // handle multi-suffix .tar.gz
  if (lower.endsWith('.tar.gz')) return true;
  const m = lower.match(/(\.[a-z0-9]+)$/);
  return m ? FORCE_BINARY_EXTENSIONS.has(m[1]) : false;
}

export function shouldExcludeByName(filename: string, dynamic: string[]) {
  // dynamic supports literal or glob-like "*.ext"
  for (const pat of dynamic) {
    if (!pat) continue;
    if (pat.startsWith('*.') && filename.endsWith(pat.slice(1))) return true;
    if (!pat.startsWith('*.') && filename.includes(pat)) return true;
  }
  return false;
}
