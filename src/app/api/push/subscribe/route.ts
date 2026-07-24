import { NextRequest } from 'next/server';
import { requireUser, AuthError } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

// שמירת מנוי Push (לאחר אישור המשתמש בדפדפן/PWA)
export async function POST(req: NextRequest) {
  try {
    const s = requireUser();
    const sub = await req.json();
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return fail('מנוי לא תקין');
    await supabaseAdmin().from('push_subscriptions').upsert({
      user_id: s.uid, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
    }, { onConflict: 'endpoint' });
    return ok({ subscribed: true });
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
