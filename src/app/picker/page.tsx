'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, apiForm } from '@/lib/client';
import { enqueue, allPending, remove, PendingCheck } from '@/lib/idb';
import { ResultBadge, Spinner } from '@/components/ui';

type Shot = { id: string; file: File; url: string };
type Result = { message: string; overallResult: string; customerName: string | null } | null;

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function compressImage(file) { const url = URL.createObjectURL(file); const img = document.createElement('img'); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; }); const m = 1600; let w = img.naturalWidth, h = img.naturalHeight; if (Math.max(w, h) > m) { const s = m / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); } const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); const b = await new Promise((res) => c.toBlob((x) => res(x), 'image/jpeg', 0.72)); return new File([b], (file.name || 'img') + '.jpg', { type: 'image/jpeg' }); }

export default function PickerPage() {
  const router = useRouter();
  const [me, setMe] = useState<any>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<Result>(null);
  const [error, setError] = useState('');
  const [mine, setMine] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dedupeRef = useRef<string>(uid());

  const loadMine = useCallback(() => { api('/api/checks/mine').then(setMine).catch(() => {}); }, []);

  const flushPending = useCallback(async () => {
    const items = await allPending();
    setPendingCount(items.length);
    if (!navigator.onLine) return;
    for (const it of items) {
      try {
        const form = new FormData();
        it.blobs.forEach((b, i) => form.append('files', new File([b], it.names[i] || `img${i}.jpg`, { type: b.type })));
        form.append('dedupeKey', it.dedupeKey);
        await apiForm('/api/checks', form);
        await remove(it.id);
      } catch { /* יישאר בתור */ }
    }
    const rest = await allPending();
    setPendingCount(rest.length);
    loadMine();
  }, [loadMine]);

  useEffect(() => {
    api('/api/auth/me').then((s: any) => {
      if (!s) return router.replace('/');
      if (s.role === 'manager') return router.replace('/manager');
      setMe(s);
    });
    loadMine();
    flushPending();
    window.addEventListener('online', flushPending);
    return () => window.removeEventListener('online', flushPending);
  }, [router, loadMine, flushPending]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
Promise.all(files.map(async (f) => { const c = await compressImage(f); return { id: uid(), file: c, url: URL.createObjectURL(c) }; })).then((ns) => setShots((prev) => [...prev, ...ns]));    setResult(null); setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeShot(id: string) {
    setShots((prev) => prev.filter((s) => s.id !== id));
  }

  function startNew() {
    setShots([]); setResult(null); setError(''); setProgress(0);
    dedupeRef.current = uid();
  }

  async function submit() {
    if (!shots.length || busy) return;
    setBusy(true); setError(''); setProgress(0);
    const form = new FormData();
    shots.forEach((s, i) => form.append('files', s.file, s.file.name || `img${i}.jpg`));
    form.append('dedupeKey', dedupeRef.current);
    try {
      const r = await apiForm<Result>('/api/checks', form, setProgress);
      setResult(r); setShots([]); loadMine();
    } catch (e: any) {
      // אין חיבור -> שמירה מקומית והעלאה אוטומטית כשהחיבור חוזר
      try {
        const item: PendingCheck = {
          id: dedupeRef.current, dedupeKey: dedupeRef.current, createdAt: Date.now(),
          blobs: shots.map((s) => s.file), names: shots.map((s) => s.file.name || 'img.jpg'),
        };
        await enqueue(item);
        setResult({ message: 'אין חיבור כרגע - הבדיקה נשמרה ותישלח אוטומטית כשהאינטרנט יחזור', overallResult: 'pending', customerName: null });
        setShots([]); setPendingCount((c) => c + 1);
      } catch { setError(e.message); }
    } finally { setBusy(false); dedupeRef.current = uid(); }
  }

  async function logout() { await api('/api/auth/logout', { method: 'POST' }); router.replace('/'); }

  return (
    <main className="max-w-md mx-auto px-4 pb-24 pt-4">
      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="font-bold text-lg">שלום {me?.name}</div>
          <div className="text-muted text-sm">אזור מלקט</div>
        </div>
        <button onClick={logout} className="text-muted text-sm underline">יציאה</button>
      </header>

      {pendingCount > 0 && (
        <div className="badge-review w-full justify-center py-2 mb-3">
          {pendingCount} בדיקות ממתינות להעלאה (אין חיבור)
        </div>
      )}

      {/* תוצאה אחרונה */}
      {result && (
        <div className={`card mb-4 text-center ${result.overallResult === 'ok' ? 'bg-okbg' : result.overallResult === 'exception' ? 'bg-alertbg' : 'bg-reviewbg'}`}>
          <div className="text-xl font-bold mb-1">{result.message}</div>
          {result.customerName && <div className="text-muted">לקוח: {result.customerName}</div>}
          <button onClick={startNew} className="btn-primary w-full mt-4">התחל בדיקה חדשה</button>
        </div>
      )}

      {!result && (
        <>
          {shots.length === 0 ? (
            <button onClick={() => fileRef.current?.click()} className="btn-big btn-primary mb-4">
              📷 התחל בדיקה חדשה
            </button>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {shots.map((s) => (
                  <div key={s.id} className="relative">
                    <img src={s.url} alt="" className="w-full h-28 object-cover rounded-xl border border-line" />
                    <button onClick={() => removeShot(s.id)}
                      className="absolute top-1 left-1 bg-alert text-white rounded-full w-7 h-7 text-lg leading-none">×</button>
                  </div>
                ))}
                <button onClick={() => fileRef.current?.click()}
                  className="h-28 rounded-xl border-2 border-dashed border-line text-3xl text-muted">＋</button>
              </div>

              {busy && (
                <div className="mb-3">
                  <div className="h-3 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-brand transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="text-center text-sm text-muted mt-1">מעלה... {progress}%</div>
                </div>
              )}

              <button onClick={submit} disabled={busy} className="btn-big bg-ok text-white mb-2">
                {busy ? <Spinner /> : `✔ סיום ושליחה (${shots.length})`}
              </button>
              <button onClick={startNew} className="btn-ghost w-full">ביטול והתחלה מחדש</button>
            </>
          )}
          {error && <div className="badge-alert w-full justify-center py-2 mt-3">{error}</div>}

          <input ref={fileRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={onPick} />
        </>
      )}

      {/* הבדיקות שלי מהיום */}
      <section className="mt-8">
        <h2 className="font-bold mb-2">הבדיקות שלי היום</h2>
        {mine.length === 0 ? (
          <div className="text-muted text-sm">אין בדיקות היום</div>
        ) : (
          <div className="space-y-2">
            {mine.map((c) => (
              <div key={c.id} className="card flex items-center justify-between py-3">
                <div>
                  <div className="font-semibold">{c.customer_name || 'לקוח לא זוהה'}</div>
                  <div className="text-xs text-muted">{new Date(c.created_at).toLocaleTimeString('he-IL')} · {c.images_count} תמונות</div>
                </div>
                <ResultBadge result={c.overall_result} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
