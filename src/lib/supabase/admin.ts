import { createClient, SupabaseClient } from '@supabase/supabase-js';

// לקוח Supabase עם service role - שרת בלבד! עוקף RLS.
// כל הפעולות הרגישות (כתיבה, קריאת תמונות) עוברות דרכו ב-API.
let admin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (admin) return admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ב-.env.local');
  }
  admin = createClient(url, key, { auth: { persistSession: false } });
  return admin;
}

export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
