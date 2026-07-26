/**
 * Media worker: virus-scan + thumbnail jobs land here once object storage is wired.
 * Stage 1 keeps a pure classifier so the package is testable without S3.
 */
export type MediaJobKind = 'scan' | 'thumbnail' | 'transcribe';

export function classifyMediaJob(contentType: string): MediaJobKind {
  if (contentType.startsWith('image/')) return 'thumbnail';
  if (contentType.startsWith('audio/')) return 'transcribe';
  return 'scan';
}
