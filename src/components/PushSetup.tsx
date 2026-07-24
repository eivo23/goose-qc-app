'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// תהליך פשוט להפעלת התראות Push (דורש התקנת ה-PWA למסך הבית באייפון)
export function PushSetup() {
  const [state, setState] = useState<'idle' | 'ok' | 'unsupported' | 'denied' | 'nokey'>('idle');
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) setState('unsupported');
    else if (!vapid) setState('nokey');
  }, [vapid]);

  async function enable() {
    try {
      if (!vapid) return setState('nokey');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setState('denied');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
      setState('ok');
    } catch { setState('denied'); }
  }

  return (
    <div className="card">
      <div className="font-bold mb-1">התראות Push</div>
      {state === 'ok' && <div className="badge-ok w-full justify-center py-2">התראות מופעלות במכשיר זה ✔</div>}
      {state === 'unsupported' && <p className="text-sm text-muted">הדפדפן אינו תומך בהתראות. באייפון יש להוסיף את האפליקציה למסך הבית (שיתוף ← הוסף למסך הבית) ואז לפתוח אותה משם.</p>}
      {state === 'nokey' && <p className="text-sm text-review">חסר מפתח VAPID. הריצו <code>npm run generate:vapid</code> והגדירו את המפתחות ב-.env.local.</p>}
      {state === 'denied' && <p className="text-sm text-alert">ההרשאה נדחתה. יש לאשר התראות בהגדרות המכשיר.</p>}
      {(state === 'idle') && (
        <>
          <p className="text-sm text-muted mb-3">
            כדי לקבל התראה מיידית על חריגת ליקוט: 1) הוסיפו את האפליקציה למסך הבית (כפתור שיתוף באייפון ← "הוסף למסך הבית"). 2) פתחו את האפליקציה מסמל מסך הבית. 3) לחצו כאן לאישור.
          </p>
          <button onClick={enable} className="btn-primary w-full">הפעל התראות במכשיר זה</button>
        </>
      )}
    </div>
  );
}
