import { requireManager, AuthError } from '@/lib/auth';
import { dashboardStats } from '@/lib/db';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    requireManager();
    return ok(await dashboardStats());
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
