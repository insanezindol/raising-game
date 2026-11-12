-- Supabase 대시보드 > SQL Editor 에 붙여 한 번 실행한다. 여러 번 실행해도 안전하다.

-- 계정 부가정보. 서버 함수(service-role)만 접근한다: RLS를 켜고 정책을 두지 않는다.
create table if not exists accounts (
  user_id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9_]{4,20}$'),
  key_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz
);
alter table accounts enable row level security;

create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  species text not null,
  name text not null check (char_length(name) between 1 and 12),
  born_at timestamptz not null default now(),
  died_at timestamptz,
  death_cause text,
  state jsonb not null,
  updated_at timestamptz not null default now()
);
-- 살아있는 펫은 한 사람당 한 마리
create unique index if not exists pets_one_alive on pets (user_id) where died_at is null;
alter table pets enable row level security;
drop policy if exists pets_own on pets;
create policy pets_own on pets for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists diary (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  pet_id uuid not null references pets on delete cascade,
  kind text not null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists diary_pet on diary (pet_id, created_at);
alter table diary enable row level security;
drop policy if exists diary_own on diary;
create policy diary_own on diary for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 기기 시계가 틀려도 게임 시간이 어긋나지 않도록 서버 시각을 준다
create or replace function server_now() returns timestamptz
  language sql stable as $$ select now() $$;
