import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase/admin';
import { log } from './logger';

const BUCKET = 'carton-images';

export interface StoredImage {
  path: string;
  hash: string;
  size: number;
}

/** מעלה תמונה ל-bucket פרטי. מחזיר נתיב + hash לזיהוי כפילויות. */
export async function uploadCartonImage(
  checkId: string,
  index: number,
  bytes: Buffer,
  mime: string
): Promise<StoredImage> {
  const hash = createHash('sha256').update(bytes).digest('hex');
  const ext = mime.includes('png') ? 'png' : 'jpg';
  const path = `${checkId}/${index}-${hash.slice(0, 12)}.${ext}`;
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error && !`${error.message}`.includes('already exists')) {
    log.error('storage.upload failed', { error: error.message });
    throw error;
  }
  return { path, hash, size: bytes.length };
}

/** קישור חתום קצר-תוקף לצפייה בתמונה (ברירת מחדל 5 דקות). */
export async function signedUrl(path: string, expiresSec = 300): Promise<string | null> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrl(path, expiresSec);
  if (error) {
    log.warn('storage.signedUrl failed', { error: error.message });
    return null;
  }
  return data.signedUrl;
}
