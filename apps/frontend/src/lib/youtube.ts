/** Chuyển URL YouTube (watch/youtu.be/shorts/embed) → URL nhúng iframe, hoặc null nếu không hợp lệ. */
export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i,
  );
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
