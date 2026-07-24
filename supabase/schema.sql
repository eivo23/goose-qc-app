-- =====================================================================
--  מערכת בקרת ליקוט אווז - סכימת בסיס נתונים (PostgreSQL / Supabase)
--  הרצה: Supabase Dashboard > SQL Editor > הדביקו והריצו.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ------------------------- משתמשים -----------------------------------
create table if not exists app_users (
  id            uuid primary key default gen_random_uuid(),
  auth_uid      uuid unique,                       -- מקושר ל- auth.users של Supabase
  name          text not null,
  username      text unique not null,
  phone         text,
  password_hash text not null,                     -- scrypt (ראו src/lib/auth.ts)
  role          text not null check (role in ('picker','manager')),
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ------------------------- בדיקות ------------------------------------
create table if not exists checks (
  id             uuid primary key default gen_random_uuid(),
  picker_id      uuid references app_users(id),
  picker_name    text,                             -- תמונת מצב לשם המלקט
  customer_name  text,                             -- זוהה אוטומטית מהמדבקה הכחולה
  images_count   int not null default 0,
  overall_result text not null default 'pending'   -- pending|ok|review|exception|unreadable
                 check (overall_result in ('pending','ok','review','exception','unreadable')),
  status         text not null default 'new'       -- new|seen|in_progress|confirmed_error|dismissed|reshoot|closed
                 check (status in ('new','seen','in_progress','confirmed_error','dismissed','reshoot','closed')),
  confidence     int,
  client_dedupe_key text,                          -- מניעת שליחה כפולה מצד הלקוח
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  closed_at      timestamptz,
  closed_by      uuid references app_users(id)
);
create unique index if not exists checks_dedupe on checks(client_dedupe_key) where client_dedupe_key is not null;

-- ------------------------- תמונות (מקור בלתי ניתן למחיקה) -------------
create table if not exists images (
  id           uuid primary key default gen_random_uuid(),
  check_id     uuid not null references checks(id) on delete cascade,
  storage_path text not null,                      -- נתיב ב-Storage (bucket פרטי)
  sha256_hash  text,                               -- לזיהוי כפילויות
  seq_index    int not null default 0,
  width        int,
  height       int,
  created_at   timestamptz not null default now()
);
create index if not exists images_check on images(check_id);

-- ------------------------- ניתוח קרטון (זוג תוויות) ------------------
create table if not exists carton_analyses (
  id                 uuid primary key default gen_random_uuid(),
  check_id           uuid not null references checks(id) on delete cascade,
  image_id           uuid references images(id),
  blue_ocr_raw       text,                          -- טקסט גולמי - מדבקה כחולה
  carton_ocr_raw     text,                          -- טקסט גולמי - תווית יצרן
  blue_translation   text,
  carton_translation text,
  blue_normalized    jsonb,                         -- {animal, part, state, weight, sku, barcode}
  carton_normalized  jsonb,
  detected_customer  text,
  package_seq        text,                          -- למשל 2/3
  match_result       text check (match_result in ('match','mismatch','uncertain')),
  confidence         int,
  mismatch_reason    text,
  ai_original_result jsonb,                         -- תוצאת המערכת המקורית - לעולם לא נדרסת
  created_at         timestamptz not null default now()
);
create index if not exists carton_check on carton_analyses(check_id);

-- ------------------------- חריגות ------------------------------------
create table if not exists exceptions (
  id                 uuid primary key default gen_random_uuid(),
  check_id           uuid not null references checks(id) on delete cascade,
  carton_analysis_id uuid references carton_analyses(id),
  reason_code        text not null,                 -- ראו lib/reasons.ts
  status             text not null default 'new'
                     check (status in ('new','seen','in_progress','confirmed_error','dismissed','reshoot','closed')),
  opened_at          timestamptz not null default now(),
  handled_at         timestamptz,
  closed_at          timestamptz,
  handled_by         uuid references app_users(id)
);
create index if not exists exceptions_status on exceptions(status);

-- ------------------------- מילון מוצרים (נבנה מאישורי מנהל) ----------
create table if not exists product_dictionary (
  id               uuid primary key default gen_random_uuid(),
  key              jsonb not null,                  -- {animal, part, state}
  canonical_name_he text not null,
  aliases          jsonb not null default '[]',
  sample_texts     jsonb not null default '[]',
  confirmed_by     uuid references app_users(id),
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists dict_key on product_dictionary((key->>'animal'),(key->>'part'),(key->>'state'));

-- ------------------------- פעולות מנהל -------------------------------
create table if not exists manager_actions (
  id                    uuid primary key default gen_random_uuid(),
  check_id              uuid references checks(id),
  exception_id          uuid references exceptions(id),
  user_id               uuid references app_users(id),
  action_type           text not null,
  manager_correct_value jsonb,
  note                  text,
  created_at            timestamptz not null default now()
);

-- ------------------------- יומן שינויים ------------------------------
create table if not exists audit_log (
  id         uuid primary key default gen_random_uuid(),
  entity     text not null,
  entity_id  uuid,
  action     text not null,
  old_value  jsonb,
  new_value  jsonb,
  user_id    uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ------------------------- הגדרות ------------------------------------
create table if not exists settings (
  id               int primary key default 1,
  threshold_ok     int not null default 90,
  threshold_review int not null default 75,
  notify_user_ids  jsonb not null default '[]',
  updated_at       timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into settings(id) values (1) on conflict do nothing;

-- ------------------------- מנויי Push --------------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references app_users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  unique(endpoint)
);

-- =====================================================================
--  Row Level Security
--  מלקט רואה רק את הבדיקות שלו. מנהל רואה הכול.
--  הערה: כל הכתיבה הרגישה עוברת דרך ה-API בשרת עם service role,
--  ולכן ה-RLS מגן בעיקר על קריאה ישירה מצד-לקוח.
-- =====================================================================
alter table app_users        enable row level security;
alter table checks           enable row level security;
alter table images           enable row level security;
alter table carton_analyses  enable row level security;
alter table exceptions       enable row level security;

create or replace function is_manager() returns boolean language sql stable as $$
  select exists(select 1 from app_users u where u.auth_uid = auth.uid() and u.role='manager' and u.active);
$$;

create or replace function my_app_user_id() returns uuid language sql stable as $$
  select id from app_users where auth_uid = auth.uid();
$$;

-- app_users: כל אחד רואה את עצמו; מנהל רואה הכול
drop policy if exists au_select on app_users;
create policy au_select on app_users for select using (auth_uid = auth.uid() or is_manager());

-- checks: מלקט רק את שלו, מנהל הכול
drop policy if exists ch_select on checks;
create policy ch_select on checks for select using (is_manager() or picker_id = my_app_user_id());

-- images / carton_analyses / exceptions: לפי הבדיקה שאליה הם שייכים
drop policy if exists im_select on images;
create policy im_select on images for select using (
  is_manager() or exists(select 1 from checks c where c.id = images.check_id and c.picker_id = my_app_user_id())
);
drop policy if exists ca_select on carton_analyses;
create policy ca_select on carton_analyses for select using (
  is_manager() or exists(select 1 from checks c where c.id = carton_analyses.check_id and c.picker_id = my_app_user_id())
);
drop policy if exists ex_select on exceptions;
create policy ex_select on exceptions for select using (is_manager());

-- טריגר לעדכון updated_at
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists checks_touch on checks;
create trigger checks_touch before update on checks for each row execute function touch_updated_at();
