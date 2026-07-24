'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { Spinner } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/api/auth/me').then((s: any) => {
      if (s?.role === 'manager') router.replace('/manager');
      else if (s?.role === 'picker') router.replace('/picker');
    }).catch(() => {});
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api<{ role: string }>('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ identifier, password }),
      });
      router.replace(r.role === 'manager' ? '/manager' : '/picker');
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-6 max-w-md mx-auto">
      <div className="text-center mb-8">
        <div className="text-4xl mb-2">🪿</div>
        <h1 className="text-2xl font-bold">בקרת ליקוט אווז</h1>
        <p className="text-muted mt-1">זיהוי טעויות ליקוט מתוך תמונות</p>
      </div>
      <form onSubmit={submit} className="card space-y-4">
        <div>
          <label className="label">שם משתמש / טלפון / קוד אישי</label>
          <input className="field" value={identifier} onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username" inputMode="text" required />
        </div>
        <div>
          <label className="label">סיסמה</label>
          <input className="field" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password" required />
        </div>
        {err && <div className="badge-alert w-full justify-center py-2">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner /> : 'כניסה'}</button>
      </form>
      <p className="text-center text-xs text-muted mt-6">
        משתמשי בדיקה נוצרים דרך <code>npm run seed</code>
      </p>
    </main>
  );
}
