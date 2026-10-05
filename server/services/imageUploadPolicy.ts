export const ARTICLE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const ARTICLE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

export interface ArticleImageMetadata {
  url: string;
  alt?: string;
  caption?: string;
  credit?: string;
  uploadedBy: string;
  articleId?: string;
}

export function validateArticleImageUpload(file: { mimetype?: string; size?: number; originalname?: string }): void {
  if (!file.mimetype || !ARTICLE_IMAGE_MIME_TYPES.has(file.mimetype)) throw new Error('Unsupported image type');
  if (!Number.isFinite(file.size) || (file.size ?? 0) < 1 || (file.size ?? 0) > ARTICLE_IMAGE_MAX_BYTES) throw new Error('Image exceeds upload size policy');
  if (!file.originalname || file.originalname.length > 255) throw new Error('Invalid image filename');
}
