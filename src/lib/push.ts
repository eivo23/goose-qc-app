import webpush from 'web-push';
import { supabaseAdmin } from './supabase/admin';
import { log } from './logger';

let configured = false;
function ensure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;      // נפתח בלחיצה על ההתראה
  tag?: string;
}

/** שולח התראת Push לכל המנהלים שמוגדרים לקבל התראות. */
export async function notifyManagers(payload: PushPayload): Promise<{ sent: number; skipped: boolean }> {
  if (!ensure()) {
    log.warn('web-push not configured - falling back to in-app notification only');
    return { sent: 0, skipped: true };
  }
  const db = supabaseAdmin();
  const { data: settings } = await db.from('settings').select('notify_user_ids').eq('id', 1).single();
  const notifyIds: string[] = settings?.notify_user_ids ?? [];

  let q = db.from('push_subscriptions').select('*, app_users!inner(role,active)');
  const { data: subs } = await q;
  const targets = (subs ?? []).filter((s: any) => {
    if (!s.app_users?.active || s.app_users?.role !== 'manager') return false;
    if (notifyIds.length === 0) return true; // ברירת מחדל: כל המנהלים
    return notifyIds.includes(s.user_id);
  });

  let sent = 0;
  await Promise.all(
    targets.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
      } catch (err: any) {
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseAdmin().from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        } else {
          log.warn('push send failed', { error: err?.message });
        }
      }
    })
  );
  return { sent, skipped: false };
}
