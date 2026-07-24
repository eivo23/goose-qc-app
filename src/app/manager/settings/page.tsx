'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';
import { PushSetup } from '@/components/PushSetup';

export default function SettingsPage() {
  const router = useRouter();
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api('/api/auth/me').then((u: any) => { if (!u) router.replace('/'); else if (u.role !== 'manager') router.replace('/picker'); });
    api('/api/settings').then(setS).catch(() => {});
  }, [router]);

  async function save() {
    setMsg('');
    try {
      await api('/api/settings', { method: 'PATCH', body: JSON.stringify({
        threshold_ok: Number(s.threshold_ok), threshold_review: Number(s.threshold_review),
      }) });
      setMsg('נשמר');
    } catch (e: any) { setMsg(e.message); }
  }

  if (!s) return <main className="p-6 text-muted">טוען...</main>;

  return (
    <main className="max-w-md mx-auto px-4 pb-24 pt-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">הגדרות</h1>
        <Link href="/manager" className="text-muted underline text-sm">חזרה</Link>
      </header>

      <div className="card space-y-3">
        <div className="font-bold">ספי ביטחון</div>
        <div>
          <label className="label">התאמה ודאית (תקין) מעל</label>
          <input className="field" type="number" min={0} max={100} value={s.threshold_ok}
            onChange={(e) => setS({ ...s, threshold_ok: e.target.value })} />
        </div>
        <div>
          <label className="label">לבדיקת מנהל מעל (מתחת לזה = חריגה אוטומטית)</label>
          <input className="field" type="number" min={0} max={100} value={s.threshold_review}
            onChange={(e) => setS({ ...s, threshold_review: e.target.value })} />
        </div>
        <button onClick={save} className="btn-primary w-full">שמור</button>
        {msg && <div className="text-center text-sm text-muted">{msg}</div>}
      </div>

      <PushSetup />
    </main>
  );
}
