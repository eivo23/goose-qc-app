import { NextRequest } from 'next/server';
import { requireUser, requireManager } from '@/lib/auth';
import { processCheck, listChecks, IncomingImage } from '@/lib/db';
import { ok, fail } from '@/lib/http';
import { AuthError } from '@/lib/auth';
import { log } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 60;

// יצירת בדיקה חדשה (מלקט): העלאת תמונות + ניתוח
export async function POST(req: NextRequest) {
  try {
    const session = requireUser();
    const form = await req.formData();
    const files = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!files.length) return fail('לא צורפו תמונות');
    if (files.length > 12) return fail('יותר מדי תמונות בבדיקה אחת (מקסימום 12)');

    const dedupeKey = (form.get('dedupeKey') as string) || undefined;

    const images: IncomingImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.size > 15 * 1024 * 1024) return fail(`תמונה ${i + 1} גדולה מדי (מעל 15MB)`);
      const buffer = Buffer.from(await f.arrayBuffer());
      images.push({ buffer, mime: f.type || 'image/jpeg' });
    }

    const result = await processCheck(session, images, dedupeKey);
    return ok(result);
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    log.error('POST /checks failed', { error: e?.message });
    return fail('שגיאה בעיבוד הבדיקה: ' + e.message, 500);
  }
}

// רשימת כל הבדיקות (מנהל בלבד) עם סינון
export async function GET(req: NextRequest) {
  try {
    requireManager();
    const p = req.nextUrl.searchParams;
    const data = await listChecks({
      customer: p.get('customer') || undefined,
      picker: p.get('picker') || undefined,
      product: p.get('product') || undefined,
      date: p.get('date') || undefined,
      result: p.get('result') || undefined,
      status: p.get('status') || undefined,
    });
    return ok(data);
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
