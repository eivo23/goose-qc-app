'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/client';
import { StatusBadge, Confidence } from '@/components/ui';
import { reasonText, STATUS_HE } from '@/lib/reasons';

const EX_ACTIONS = [
  { key: 'confirm_error', label: 'אשר טעות ליקוט', cls: 'bg-alert text-white' },
  { key: 'not_error', label: 'זו אינה טעות', cls: 'bg-white border border-line' },
  { key: 'need_reshoot', label: 'בקש צילום מחדש', cls: 'bg-white border border-line' },
  { key: 'in_progress', label: 'העבר לטיפול', cls: 'bg-white border border-line' },
  { key: 'close', label: 'סגור חריגה', cls: 'bg-slate-800 text-white' },
];

export default function ExceptionsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [items, setItems] = useState<any[]>([]);
  const [status, setStatus] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    const qs = status ? `?status=${status}` : '';
    api('/api/exceptions' + qs).then(setItems).catch(() => {});
  }, [status]);

  useEffect(() => {
    api('/api/auth/me').then((s: any) => { if (!s) router.replace('/'); else if (s.role !== 'manager') router.replace('/picker'); });
  }, [router]);
  useEffect(() => { load(); }, [load]);

  async function act(ex: any, action: string) {
    try {
      await api(`/api/exceptions/${ex.id}`, { method: 'PATCH', body: JSON.stringify({ action, note: notes[ex.id] || '' }) });
      load();
    } catch { /* ignore */ }
  }

  // מיון: חדשות ראשונות
  const sorted = [...items].sort((a, b) => (a.status === 'new' ? -1 : 1) - (b.status === 'new' ? -1 : 1));
  const focusCheck = params.get('check');

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24 pt-4">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">חריגות ואי-התאמות</h1>
        <Link href="/manager" className="text-muted underline text-sm">לאזור מנהל</Link>
      </header>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        {['', 'new', 'in_progress', 'confirmed_error', 'reshoot', 'closed'].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`pill whitespace-nowrap ${status === s ? 'bg-brand text-white' : 'bg-white border border-line'}`}>
            {s === '' ? 'הכול' : STATUS_HE[s]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {sorted.map((ex) => {
          const c = ex.check || {};
          const isNew = ex.status === 'new';
          return (
            <div key={ex.id}
              className={`card ${isNew ? 'border-alert border-2' : ''} ${focusCheck === ex.check_id ? 'ring-2 ring-brand' : ''}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-lg">{c.customer_name || 'לקוח לא זוהה'}</div>
                <div className="flex gap-2 items-center">
                  {isNew && <span className="badge-alert">חדשה</span>}
                  <Confidence value={c.confidence} />
                  <StatusBadge status={ex.status} />
                </div>
              </div>
              <div className="text-sm text-muted mb-2">
                {new Date(ex.opened_at).toLocaleString('he-IL')} · מלקט: {c.picker_name || '—'}
              </div>
              <div className="badge-alert w-full justify-start py-2 mb-2">סיבה: {reasonText(ex.reason_code)}</div>

              <div className="flex gap-2 mb-3">
                <Link href={`/manager/checks/${ex.check_id}`} className="btn-ghost py-2 flex-1 text-center">
                  פתח בדיקה מלאה (תמונות, OCR, תרגום, נרמול)
                </Link>
              </div>

              <input className="field mb-2" placeholder="הערת מנהל"
                value={notes[ex.id] || ''} onChange={(e) => setNotes({ ...notes, [ex.id]: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                {EX_ACTIONS.map((a) => (
                  <button key={a.key} onClick={() => act(ex, a.key)} className={`btn py-3 text-base ${a.cls}`}>{a.label}</button>
                ))}
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="text-center text-muted py-10">אין חריגות 🎉</div>}
      </div>
    </main>
  );
}
