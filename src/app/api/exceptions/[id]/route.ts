import { NextRequest } from 'next/server';
import { requireManager, AuthError } from '@/lib/auth';
import { applyManagerAction } from '@/lib/db';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

// פעולת מנהל על חריגה
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = requireManager();
    const { action, note, correctValue } = await req.json();
    if (!action) return fail('חסרה פעולה');
    // מאתרים את הבדיקה המשויכת כדי לעדכן את שתיהן יחד
    const { data: ex } = await supabaseAdmin().from('exceptions').select('check_id').eq('id', params.id).single();
    await applyManagerAction(s, { exceptionId: params.id, checkId: ex?.check_id, action, note, correctValue });
    return ok({ updated: true });
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
