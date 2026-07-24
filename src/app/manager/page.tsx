'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';
import { ResultBadge, StatusBadge, Confidence } from '@/components/ui';
import { RESULT_HE, STATUS_HE } from '@/lib/reasons';

export default function ManagerHome() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [checks, setChecks] = useState<any[]>([]);
  const [f, setF] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    api('/api/dashboard').then(setStats).catch(() => {});
    const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
    api('/api/checks' + (qs ? `?${qs}` : '')).then(setChecks).catch(() => {});
  }, [f]);

  useEffect(() => {
    api('/api/auth/me').then((s: any) => {
      if (!s) return router.replace('/');
      if (s.role !== 'manager') return router.replace('/picker');
      setMe(s);
    });
  }, [router]);
  useEffect(() => { if (me) load(); }, [me, load]);

  async function logout() { await api('/api/auth/logout', { method: 'POST' }); router.replace('/'); }

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24 pt-4">
      <header className="flex items-center justify-between mb-4">
        <div><div className="font-bold text-lg">שלום {me?.name}</div><div className="text-muted text-sm">אזור מנהל</div></div>
        <div className="flex items-center gap-3">
          <Link href="/exceptions" className="relative btn-ghost py-2 px-3">
            חריגות
            {stats?.newExceptions > 0 && (
              <span className="absolute -top-2 -left-2 bg-alert text-white rounded-full min-w-6 h-6 px-1 text-sm flex items-center justify-center">{stats.newExceptions}</span>
            )}
          </Link>
          <button onClick={logout} className="text-muted text-sm underline">יציאה</button>
        </div>
      </header>

      {/* דשבורד */}
      {stats && (
        <section className="grid grid-cols-3 gap-2 mb-6">
          <Tile label="בדיקות היום" value={stats.checksToday} />
          <Tile label="לקוחות היום" value={stats.customersToday} />
          <Tile label="תמונות היום" value={stats.imagesToday} />
          <Tile label="תקינות" value={stats.okToday} tone="ok" />
          <Tile label="חריגות חדשות" value={stats.newExceptions} tone="alert" />
          <Tile label="אושרו כטעות" value={stats.confirmedErrors} tone="review" />
        </section>
      )}

      {/* טעויות לפי מלקט / מוצר */}
      {stats && (stats.byPicker?.length > 0 || stats.byProduct?.length > 0) && (
        <section className="grid grid-cols-2 gap-3 mb-6">
          <RateCard title="שיעור טעויות לפי מלקט" rows={stats.byPicker} />
          <RateCard title="שיעור טעויות לפי מוצר" rows={stats.byProduct} />
        </section>
      )}

      {/* סינון */}
      <section className="card mb-4 grid grid-cols-2 gap-2">
        <input className="field" placeholder="לקוח" value={f.customer || ''} onChange={(e) => setF({ ...f, customer: e.target.value })} />
        <input className="field" placeholder="מלקט" value={f.picker || ''} onChange={(e) => setF({ ...f, picker: e.target.value })} />
        <input className="field" type="date" value={f.date || ''} onChange={(e) => setF({ ...f, date: e.target.value })} />
        <select className="field" value={f.result || ''} onChange={(e) => setF({ ...f, result: e.target.value })}>
          <option value="">כל התוצאות</option>
          {['ok', 'exception', 'review', 'unreadable', 'pending'].map((r) => <option key={r} value={r}>{RESULT_HE[r]}</option>)}
        </select>
        <select className="field" value={f.status || ''} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">כל הסטטוסים</option>
          {['new', 'seen', 'in_progress', 'confirmed_error', 'dismissed', 'reshoot', 'closed'].map((s) => <option key={s} value={s}>{STATUS_HE[s]}</option>)}
        </select>
        <a href="/api/export" className="btn-ghost">⬇ ייצוא Excel</a>
      </section>

      {/* רשימת בדיקות */}
      <section className="space-y-2">
        {checks.map((c) => (
          <Link key={c.id} href={`/manager/checks/${c.id}`} className="card flex items-center justify-between hover:border-brand">
            <div>
              <div className="font-semibold">{c.customer_name || 'לקוח לא זוהה'}</div>
              <div className="text-xs text-muted">
                {new Date(c.created_at).toLocaleString('he-IL')} · {c.picker_name} · {c.images_count} תמונות
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Confidence value={c.confidence} />
              <ResultBadge result={c.overall_result} />
              <StatusBadge status={c.status} />
            </div>
          </Link>
        ))}
        {checks.length === 0 && <div className="text-muted text-center py-8">אין בדיקות להצגה</div>}
      </section>
    </main>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'alert' ? 'text-alert' : tone === 'review' ? 'text-review' : 'text-ink';
  return (
    <div className="card text-center py-3">
      <div className={`text-3xl font-bold ${c}`}>{value ?? 0}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function RateCard({ title, rows }: { title: string; rows: any[] }) {
  return (
    <div className="card">
      <div className="font-semibold text-sm mb-2">{title}</div>
      <div className="space-y-1">
        {(rows || []).slice(0, 5).map((r) => (
          <div key={r.key} className="flex justify-between text-sm">
            <span className="truncate">{r.key}</span>
            <span className={r.rate > 0 ? 'text-alert font-bold' : 'text-muted'}>{r.rate}% ({r.err}/{r.total})</span>
          </div>
        ))}
        {(!rows || rows.length === 0) && <div className="text-muted text-sm">אין נתונים</div>}
      </div>
    </div>
  );
}
