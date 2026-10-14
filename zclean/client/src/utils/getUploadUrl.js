/**
 * Returns the correct URL for a stored upload.
 * In development, Vite proxies /uploads to :5000 so relative URLs work.
 * This helper ensures we always get a usable URL.
 */
export const getUploadUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  // Use relative path — Vite proxy handles it
  return path;
};
