-- 筋トレMEMO グループ機能（ログイン不要・招待コード制）: 表
-- 表は anon / authenticated から直接読めず、kintore_group_* の関数経由でだけ操作する。

create table public.kintore_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  invite_locked boolean not null default false,
  max_members integer not null default 12 check (max_members between 2 and 20),
  created_at timestamptz not null default now()
);

create table public.kintore_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.kintore_groups(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20),
  secret_hash text not null,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (group_id, display_name)
);

create table public.kintore_group_checkins (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.kintore_groups(id) on delete cascade,
  member_id uuid not null references public.kintore_group_members(id) on delete cascade,
  day date not null,
  summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(summary) = 'object' and pg_column_size(summary) <= 4096),
  note text not null default '' check (char_length(note) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, day)
);
create index kintore_group_checkins_group_day_idx on public.kintore_group_checkins (group_id, day);

create table public.kintore_group_reactions (
  checkin_id uuid not null references public.kintore_group_checkins(id) on delete cascade,
  member_id uuid not null references public.kintore_group_members(id) on delete cascade,
  emoji text not null check (emoji in ('👏', '🔥', '💪', '🎉')),
  created_at timestamptz not null default now(),
  primary key (checkin_id, member_id, emoji)
);
create index kintore_group_reactions_member_idx on public.kintore_group_reactions (member_id);

create table public.kintore_group_comments (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null references public.kintore_group_checkins(id) on delete cascade,
  member_id uuid not null references public.kintore_group_members(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100),
  created_at timestamptz not null default now()
);
create index kintore_group_comments_checkin_idx on public.kintore_group_comments (checkin_id);
create index kintore_group_comments_member_idx on public.kintore_group_comments (member_id);

alter table public.kintore_groups enable row level security;
alter table public.kintore_group_members enable row level security;
alter table public.kintore_group_checkins enable row level security;
alter table public.kintore_group_reactions enable row level security;
alter table public.kintore_group_comments enable row level security;

revoke all on table public.kintore_groups, public.kintore_group_members, public.kintore_group_checkins,
  public.kintore_group_reactions, public.kintore_group_comments
  from public, anon, authenticated;
