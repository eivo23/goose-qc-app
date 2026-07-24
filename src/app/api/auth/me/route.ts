import { getSession } from '@/lib/auth';
import { ok } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  const s = getSession();
  return ok(s ? { uid: s.uid, role: s.role, name: s.name, username: s.username } : null);
}
