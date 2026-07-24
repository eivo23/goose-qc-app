import { NextResponse } from 'next/server';
import { AuthError } from './auth';
import { log } from './logger';

export function ok(data: any, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}
export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** עוטף route handler עם טיפול אחיד בשגיאות */
export function handler(fn: () => Promise<Response>) {
  return async () => {
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof AuthError) return fail(err.message, 401);
      log.error('api error', { error: err?.message, stack: err?.stack });
      return fail('שגיאת שרת: ' + (err?.message ?? 'לא ידועה'), 500);
    }
  };
}
