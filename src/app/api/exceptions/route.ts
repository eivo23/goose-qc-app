import { NextRequest } from 'next/server';
import { requireManager, AuthError } from '@/lib/auth';
import { listExceptions } from '@/lib/db';
import { ok, fail } from '@/lib/http';

export const runtime = 'nodejs';

// רשימת החריגות (מנהל בלבד)
export async function GET(req: NextRequest) {
  try {
    requireManager();
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const data = await listExceptions({ status });
    return ok(data);
  } catch (e: any) {
    if (e instanceof AuthError) return fail(e.message, 401);
    return fail('שגיאה: ' + e.message, 500);
  }
}
