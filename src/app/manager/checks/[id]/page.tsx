'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/client';
import { ResultBadge, StatusBadge, Confidence } from '@/components/ui';
import { reasonText } from '@/lib/reasons';
import { identityToHe } from '@/lib/compare';

const ACTIONS = [
  { key: 'verified_ok', label: 'בדקתי – תקין', cls: 'bg-ok text-white' },
  { key: 'confirm_error', label: 'טעות ליקוט מאומתת', cls: 'bg-alert text-white' },
  { key: 'system_wrong', label: 'זיהוי שגוי של המערכת', cls: 'bg-white border border-line' },
  { key: 'need_reshoot', label: 'נדרשת תמונה חדשה', cls: 'bg-white border border-line' },
  { key: 'in_progress', label: 'העבר לטיפול', cls: 'bg-white border border-line' },
  { key: 'close', label: 'סגור בדיקה', cls: 'bg-slate-800 text-white' },
];

export default function CheckDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [d, setD] = useState<any>(null);
  const [note, setNote] = useState('');
  const [zoom, setZoom] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => { api(`/api/checks/${id}`).then(setD).catch((e) => setMsg(e.message)); }, [id]);
  useEffect(() => { load(); }, [load]);

  async function act(action: string, correctValue?: any) {
    setMsg('');
    try {
      await api(`/api/checks/${id}`, { method: 'PATCH', body: JSON.stringify({ action, note, correctValue }) });
      setNote(''); load(); setMsg('הפעולה נשמרה');
    } catch (e: any) { setMsg(e.message); }
  }

  if (!d) return <main className="p-6 text-center text-muted">{msg || 'טוען...'}</main>;
  const { check, images, cartons, exceptions, actions } = d;

  return (
    <main className="max-w-3xl mx-auto px-4 pb-24 pt-4">
      <button onClick={() => router.back()} className="text-muted underline mb-3">→ חזרה</button>

      <div className="card mb-4">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl font-bold">{check.customer_name || 'לקוח לא זוהה'}</h1>
          <div className="flex gap-2 items-center">
            <Confidence value={check.confidence} />
            <ResultBadge result={check.overall_result} />
            <StatusBadge status={check.status} />
          </div>
        </div>
        <div className="text-sm text-muted">
          {new Date(check.created_at).toLocaleString('he-IL')} · מלקט: {check.picker_name} · {check.images_count} תמונות
        </div>
      </div>

      {/* חריגות */}
      {exceptions.length > 0 && (
        <div className="card mb-4 bg-alertbg border-alert">
          <div className="font-bold text-alert mb-1">חריגות בבדיקה זו</div>
          {exceptions.map((ex: any) => (
            <div key={ex.id} className="text-sm">• {reasonText(ex.reason_code)} <StatusBadge status={ex.status} /></div>
          ))}
        </div>
      )}

      {/* תמונות */}
      <section className="mb-4">
        <h2 className="font-bold mb-2">תמונות ({images.length})</h2>
        <div className="grid grid-cols-3 gap-2">
          {images.map((im: any) => (
            im.url ? (
              <img key={im.id} src={im.url} alt="" onClick={() => { setZoom(im.url); setZoomLevel(1); }}
                className="w-full h-28 object-cover rounded-xl border border-line cursor-zoom-in" />
            ) : <div key={im.id} className="h-28 bg-slate-100 rounded-xl flex items-center justify-center text-muted text-xs">אין תצוגה</div>
          ))}
        </div>
      </section>

      {/* ניתוח קרטונים */}
      <section className="space-y-3 mb-4">
        <h2 className="font-bold">ניתוח מוצרים</h2>
        {cartons.map((c: any, i: number) => (
          <div key={i} className={`card ${c.match_result === 'mismatch' ? 'border-alert' : c.match_result === 'uncertain' ? 'border-review' : ''}`}>
            <div className="flex justify-between mb-2">
              <div className="font-semibold">קרטון {i + 1} {c.package_seq ? `(${c.package_seq})` : ''}</div>
              <div className="flex gap-2 items-center">
                <Confidence value={c.confidence} />
                <span className={c.match_result === 'match' ? 'badge-ok' : c.match_result === 'mismatch' ? 'badge-alert' : 'badge-review'}>
                  {c.match_result === 'match' ? 'התאמה' : c.match_result === 'mismatch' ? 'אי-התאמה' : 'לא ודאי'}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Panel title="הוזמן (מדבקה כחולה)" id={c.blue_normalized} raw={c.blue_ocr_raw} tr={c.blue_translation} />
              <Panel title="נמצא (תווית קרטון)" id={c.carton_normalized} raw={c.carton_ocr_raw} tr={c.carton_translation} />
            </div>
            {c.mismatch_reason && <div className="mt-2 text-sm text-alert">סיבה: {reasonText(c.mismatch_reason)}</div>}
          </div>
        ))}
      </section>

      {/* פעולות מנהל */}
      <section className="card mb-4">
        <h2 className="font-bold mb-2">פעולות מנהל</h2>
        <textarea className="field mb-3" rows={2} placeholder="הערת מנהל" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button key={a.key} onClick={() => act(a.key)} className={`btn py-3 text-base ${a.cls}`}>{a.label}</button>
          ))}
        </div>
        {msg && <div className="text-center text-sm mt-2 text-muted">{msg}</div>}
      </section>

      {/* היסטוריה */}
      {actions.length > 0 && (
        <section className="card">
          <h2 className="font-bold mb-2">היסטוריית טיפול</h2>
          {actions.map((a: any) => (
            <div key={a.id} className="text-sm border-b border-line py-1">
              {new Date(a.created_at).toLocaleString('he-IL')} · {a.action_type} {a.note ? `· ${a.note}` : ''}
            </div>
          ))}
        </section>
      )}

      {zoom && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
          <div className="flex justify-between items-center p-3 text-white">
            <div className="flex gap-2 items-center">
              <button onClick={() => setZoomLevel((z) => Math.max(1, +(z - 0.5).toFixed(1)))}
                className="w-11 h-11 rounded-full bg-white/20 text-2xl leading-none">−</button>
              <button onClick={() => setZoomLevel((z) => Math.min(6, +(z + 0.5).toFixed(1)))}
                className="w-11 h-11 rounded-full bg-white/20 text-2xl leading-none">+</button>
              <span className="text-sm mr-1">{Math.round(zoomLevel * 100)}%</span>
            </div>
            <button onClick={() => { setZoom(null); setZoomLevel(1); }}
              className="w-11 h-11 rounded-full bg-white/20 text-2xl leading-none">✕</button>
          </div>
          <div className="flex-1 overflow-auto p-2 text-center" style={{ WebkitOverflowScrolling: 'touch' }}>
            <img src={zoom} alt="" onClick={() => setZoomLevel((z) => (z >= 3 ? 1 : +(z + 1).toFixed(1)))}
              style={{ width: `${zoomLevel * 100}%`, maxWidth: 'none' }}
              className="inline-block rounded-lg align-top cursor-zoom-in select-none" />
          </div>
          <div className="text-center text-white/60 text-xs pb-2">הקש על התמונה להגדלה · גרור לתזוזה · ✕ לסגירה</div>
        </div>
      )}
    </main>
  );
}

function Panel({ title, id, raw, tr }: { title: string; id: any; raw: string | null; tr: string | null }) {
  return (
    <div className="bg-slate-50 rounded-xl p-2">
      <div className="text-muted text-xs mb-1">{title}</div>
      <div className="font-bold">{id ? identityToHe(id) : 'לא זוהה'}</div>
      {tr && <div className="text-xs text-muted mt-1">תרגום: {tr}</div>}
      {raw && <details className="text-xs mt-1"><summary className="cursor-pointer text-muted">טקסט OCR מקורי</summary><div className="mt-1 whitespace-pre-wrap">{raw}</div></details>}
    </div>
  );
}
