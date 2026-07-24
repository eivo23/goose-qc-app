import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { verifyPassword, signSession, setSessionCookie } from '@/lib/auth';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

// התחברות: שם משתמש / טלפון / קוד אישי + סיסמה
export async function POST(req: NextRequest) {
  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password) return fail('נא למלא מזהה וסיסמה');

    const db = supabaseAdmin();
    const id = String(identifier).trim();
    // שאילתות נפרדות (בטוח מהזרקה) - לפי שם משתמש ואז לפי טלפון
    let { data: user } = await db.from('app_users').select('*')
      .eq('username', id).eq('active', true).maybeSingle();
    if (!user) {
      ({ data: user } = await db.from('app_users').select('*')
        .eq('phone', id).eq('active', true).maybeSingle());
    }

    if (!user || !verifyPassword(password, user.password_hash)) {
      return fail('פרטי התחברות שגויים', 401);
    }

    const token = signSession({ uid: user.id, role: user.role, name: user.name, username: user.username });
    setSessionCookie(token);
    return ok({ role: user.role, name: user.name });
  } catch (e: any) {
    return fail('שגיאה בהתחברות: ' + e.message, 500);
  }
}
