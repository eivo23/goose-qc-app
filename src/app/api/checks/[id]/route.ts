import { NextRequest } from 'next/server';
import { getSession, requireManager, AuthError } from '@/lib/auth';
import { getCheckDetail, applyManagerAction } from '@/lib/db';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

// פרטי בדיקה מלאים. מלקט רשאי לראות רק את שלו.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = getSession();
    if (!s) return fail('נדרשת התחברות', 401);
    const detail = await getCheckDetail(params.id);
    if (!detail) return fail('בדיקה לא נמצאה', 404);
    if (s.role !== 'manager' && detail.check.picker_id !== s.uid) return fail('אין הרשאה', 403);
    return ok(detail);
  } catch (e: any) {
    return fail('שגיאה: ' + e.message, 500);
  }
}

// פעולת מנהל על בדיקה
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const s = requireManager();
    const { action, note, correctValue } = await req.json();
    if (!action) return fail('חסרה פעולה');
    await applyManagerAction(s, { checkId: params.id, action, note, correctValue });
    return ok({ updated: true });
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
