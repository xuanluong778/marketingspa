/**
 * Mirror of API auto-post-media.util — worker không import apps/api.
 */
const IMAGE_PATH_RE = /\.(jpe?g|png|gif|webp|tiff?|heic|heif)(\?|#|$)/i;
const IMAGE_HOST_RE =
  /(fbcdn\.net|cdninstagram\.com|scontent\.|cloudinary\.com|imgur\.com|googleusercontent\.com|twimg\.com)/i;

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function looksLikeDirectImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (IMAGE_PATH_RE.test(u.pathname)) return true;
    if (IMAGE_HOST_RE.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

export function normalizePublishMedia(input: {
  imageUrl?: string | null;
  linkUrl?: string | null;
}): { imageUrl?: string; linkUrl?: string; note?: string } {
  let image = input.imageUrl?.trim() || undefined;
  let link = input.linkUrl?.trim() || undefined;
  let note: string | undefined;

  if (image) {
    if (!isHttpUrl(image)) {
      throw new Error('URL ảnh phải là đường dẫn http/https hợp lệ');
    }
    if (!looksLikeDirectImageUrl(image)) {
      if (!link) {
        link = image;
        image = undefined;
        note = 'URL không phải file ảnh — sẽ đăng dạng liên kết thay vì ảnh.';
      } else {
        image = undefined;
        note =
          'URL ảnh không phải file trực tiếp — đã bỏ ảnh, đăng kèm liên kết.';
      }
    }
  }

  if (link && !isHttpUrl(link)) {
    throw new Error('URL liên kết phải là đường dẫn http/https hợp lệ');
  }

  if (image && link) {
    link = undefined;
    note = note
      ? `${note} Ưu tiên đăng ảnh (bỏ link).`
      : 'Ưu tiên đăng ảnh — link kèm theo đã được bỏ qua.';
  }

  return { imageUrl: image, linkUrl: link, note };
}
