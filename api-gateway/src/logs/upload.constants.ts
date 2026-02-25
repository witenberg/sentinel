/**
 * Allowed log file extensions and MIME types for upload validation.
 * Restricts to typical log/text formats only.
 */
export const UPLOAD_ALLOWED_EXTENSIONS = ['.log', '.txt'] as const;
export const UPLOAD_ALLOWED_MIME_TYPES = [
  'text/plain',              // .txt, .log (most systems)
  'application/octet-stream', // .log when client doesn't set MIME
] as const;

export function isAllowedLogFile(originalname: string, mimetype: string): boolean {
  const ext = originalname.includes('.')
    ? originalname.slice(originalname.lastIndexOf('.')).toLowerCase()
    : '';
  const mimeOk = (UPLOAD_ALLOWED_MIME_TYPES as readonly string[]).includes(mimetype);
  const extOk = (UPLOAD_ALLOWED_EXTENSIONS as readonly string[]).includes(ext);
  return extOk && mimeOk;
}