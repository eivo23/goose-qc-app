-- =====================================================================
--  יצירת bucket פרטי לתמונות + מדיניות גישה.
--  הרצה ב- Supabase SQL Editor לאחר schema.sql.
--  הגישה לתמונות מתבצעת אך ורק דרך קישורים חתומים קצרי-תוקף מהשרת.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('carton-images', 'carton-images', false)
on conflict (id) do nothing;

-- אין מדיניות SELECT ציבורית. הקריאה נעשית ב-API עם service role
-- באמצעות createSignedUrl (ראו src/lib/storage.ts).
