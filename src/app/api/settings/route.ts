import { NextRequest } from 'next/server';
import { requireManager, AuthError } from '@/lib/auth';
import { getSettings, updateSettings } from '@/lib/db';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    requireManager();
    return ok(await getSettings());
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const s = requireManager();
    const body = await req.json();
    const patch: any = {};
    if (typeof body.threshold_ok === 'number') patch.threshold_ok = body.threshold_ok;
    if (typeof body.threshold_review === 'number') patch.threshold_review = body.threshold_review;
    if (Array.isArray(body.notify_user_ids)) patch.notify_user_ids = body.notify_user_ids;
    await updateSettings(patch, s.uid);
    return ok({ updated: true });
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
