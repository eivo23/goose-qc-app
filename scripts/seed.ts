// יצירת משתמשי בדיקה התחלתיים. הרצה: npm run seed
// דורש NEXT_PUBLIC_SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY ב-.env.local
import { createClient } from '@supabase/supabase-js';
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

// טעינת .env.local ידנית (בלי תלות ב-dotenv)
try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ייתכן שהמשתנים כבר בסביבה */ }

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('חסרים משתני Supabase ב-.env.local'); process.exit(1); }

const db = createClient(url, key, { auth: { persistSession: false } });

const USERS = [
  { name: 'מנהל מפעל', username: 'manager', phone: '0500000001', role: 'manager', password: 'manager123' },
  { name: 'מלקט לדוגמה', username: 'picker', phone: '0500000002', role: 'picker', password: 'picker123' },
];

for (const u of USERS) {
  const { error } = await db.from('app_users').upsert({
    name: u.name, username: u.username, phone: u.phone, role: u.role,
    password_hash: hashPassword(u.password), active: true,
  }, { onConflict: 'username' });
  if (error) console.error('שגיאה ביצירת', u.username, error.message);
  else console.log(`✔ נוצר משתמש: ${u.username} / ${u.password}  (${u.role})`);
}
console.log('\nסיום. התחברו עם אחד המשתמשים לעיל.');
