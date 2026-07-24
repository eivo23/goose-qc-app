-- =====================================================================
--  יצירת משתמשי בדיקה ראשוניים - הרצה ב-Supabase SQL Editor.
--  חלופה ל-`npm run seed` (לא דורש הרצה מקומית של Node).
--  התחברות:  מנהל: manager / manager123   |   מלקט: picker / picker123
--  מומלץ לשנות סיסמאות לאחר הכניסה הראשונה.
-- =====================================================================

insert into app_users (name, username, phone, password_hash, role, active) values
  ('מנהל מפעל', 'manager', '0500000001',
   'scrypt$c7a3d75419b434e93211a978ea3e0d1a$49675178fd95f2ebc362672031229c627c20d4f0166d514908b3fcbdce08e1c5c4fecd381b9a11d702666cc06aae12333db896e45499327c3b65cfbfd4e312cf',
   'manager', true),
  ('מלקט לדוגמה', 'picker', '0500000002',
   'scrypt$d7f0f1bccf3a2c9a53e0e2922097a866$1594d22686c1b75e82d1f77123abc4913e503c662842f550bb764078f0b94edb368be4f8c0ec34cf856966eafb51f38c407051280feb1d3edaa02549630ec688',
   'picker', true)
on conflict (username) do nothing;
