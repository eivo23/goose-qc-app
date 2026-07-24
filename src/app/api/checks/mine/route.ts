import { requireUser } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/http';
import { AuthError } from '@/lib/auth';

export const runtime = 'nodejs';

// הבדיקות של המלקט המחובר, מהיום בלבד
export async function GET() {
  try {
    const s = requireUser();
    const start = new Date().toISOString().slice(0, 10) + 'T00:00:00';
    const { data } = await supabaseAdmin()
      .from('checks')
      .select('id, customer_name, overall_result, status, images_count, created_at')
      .eq('picker_id', s.uid)
      .gte('created_at', start)
      .order('created_at', { ascending: false });
    return ok(data ?? []);
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
