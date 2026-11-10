-- 筋トレMEMO グループ機能: 内部ヘルパーと公開 API（作成・参加・閲覧・投稿・コメント・オーナー設定）
-- 友だちはアカウントを作らず、端末ごとに作る合言葉（secret）で参加する。secret はハッシュだけを保存する。

---------- 内部ヘルパー（API からだけ使う） ---------- */
create function public.kintore_group_hash(p_secret text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(p_secret, 'sha256'), 'hex')
$$;

create function public.kintore_group_clean_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(btrim(regexp_replace(coalesce(p_value, ''), '[[:cntrl:]]+', ' ', 'g')), p_max)
$$;

-- 紛らわしい I / O / 0 / 1 を除いた32文字から8桁（256は32で割り切れるので偏りなし）
create function public.kintore_group_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end
$$;

create function public.kintore_group_unique_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := public.kintore_group_new_code();
    exit when not exists (select 1 from public.kintore_groups where invite_code = v_code);
  end loop;
  return v_code;
end
$$;

create function public.kintore_group_require_secret(p_secret text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_secret is null or char_length(p_secret) not between 32 and 200 then
    raise exception 'KINTORE_GROUP_AUTH' using errcode = 'P0001';
  end if;
end
$$;

create function public.kintore_group_auth(p_member_id uuid, p_secret text)
returns public.kintore_group_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.kintore_group_members;
begin
  perform public.kintore_group_require_secret(p_secret);
  select * into v_member
  from public.kintore_group_members
  where id = p_member_id and secret_hash = public.kintore_group_hash(p_secret);
  if not found then
    raise exception 'KINTORE_GROUP_AUTH' using errcode = 'P0001';
  end if;
  update public.kintore_group_members
  set last_seen_at = now()
  where id = v_member.id and last_seen_at < now() - interval '5 minutes';
  return v_member;
end
$$;

create function public.kintore_group_owner(p_member_id uuid, p_secret text)
returns public.kintore_group_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
begin
  if v_member.role <> 'owner' then
    raise exception 'KINTORE_GROUP_NOT_OWNER' using errcode = 'P0001';
  end if;
  return v_member;
end
$$;

create function public.kintore_group_membership(p_group public.kintore_groups, p_member public.kintore_group_members)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'group_id', p_group.id,
    'group_name', p_group.name,
    'invite_code', p_group.invite_code,
    'member_id', p_member.id,
    'display_name', p_member.display_name,
    'role', p_member.role
  )
$$;

---------- 公開 API ---------- */
create function public.kintore_group_create(p_name text, p_display_name text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.kintore_group_clean_text(p_name, 30);
  v_display text := public.kintore_group_clean_text(p_display_name, 20);
  v_group public.kintore_groups;
  v_member public.kintore_group_members;
begin
  if v_name = '' or v_display = '' then
    raise exception 'KINTORE_GROUP_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  perform public.kintore_group_require_secret(p_secret);
  -- ログイン不要のため、作成数の上限で荒らしによる大量作成を抑える
  if (select count(*) from public.kintore_groups where created_at > now() - interval '1 day') >= 200 then
    raise exception 'KINTORE_GROUP_RATE_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.kintore_groups (name, invite_code)
  values (v_name, public.kintore_group_unique_code())
  returning * into v_group;

  insert into public.kintore_group_members (group_id, display_name, secret_hash, role)
  values (v_group.id, v_display, public.kintore_group_hash(p_secret), 'owner')
  returning * into v_member;

  return public.kintore_group_membership(v_group, v_member);
end
$$;

create function public.kintore_group_preview(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.kintore_groups;
begin
  select * into v_group from public.kintore_groups where invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'KINTORE_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'group_id', v_group.id,
    'group_name', v_group.name,
    'member_count', (select count(*) from public.kintore_group_members where group_id = v_group.id),
    'max_members', v_group.max_members,
    'locked', v_group.invite_locked
  );
end
$$;

create function public.kintore_group_join(p_code text, p_display_name text, p_secret text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_display text := public.kintore_group_clean_text(p_display_name, 20);
  v_group public.kintore_groups;
  v_member public.kintore_group_members;
begin
  if v_display = '' then
    raise exception 'KINTORE_GROUP_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  perform public.kintore_group_require_secret(p_secret);

  -- 同時参加でも人数上限を超えないよう、グループ行をロックしてから数える
  select * into v_group
  from public.kintore_groups
  where invite_code = upper(btrim(coalesce(p_code, '')))
  for update;
  if not found then
    raise exception 'KINTORE_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_group.invite_locked then
    raise exception 'KINTORE_GROUP_LOCKED' using errcode = 'P0001';
  end if;
  if (select count(*) from public.kintore_group_members where group_id = v_group.id) >= v_group.max_members then
    raise exception 'KINTORE_GROUP_FULL' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.kintore_group_members where group_id = v_group.id and display_name = v_display) then
    raise exception 'KINTORE_GROUP_NAME_TAKEN' using errcode = 'P0001';
  end if;

  insert into public.kintore_group_members (group_id, display_name, secret_hash, role)
  values (v_group.id, v_display, public.kintore_group_hash(p_secret), 'member')
  returning * into v_member;

  return public.kintore_group_membership(v_group, v_member);
end
$$;

create function public.kintore_group_feed(p_member_id uuid, p_secret text, p_from date, p_to date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
  v_group public.kintore_groups;
begin
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 62 then
    raise exception 'KINTORE_GROUP_RANGE' using errcode = 'P0001';
  end if;
  select * into v_group from public.kintore_groups where id = v_me.group_id;

  return jsonb_build_object(
    'group', jsonb_build_object(
      'id', v_group.id,
      'name', v_group.name,
      'invite_code', v_group.invite_code,
      'invite_locked', v_group.invite_locked,
      'max_members', v_group.max_members
    ),
    'me', jsonb_build_object('member_id', v_me.id, 'display_name', v_me.display_name, 'role', v_me.role),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'display_name', m.display_name, 'role', m.role, 'joined_at', m.joined_at
      ) order by m.joined_at), '[]'::jsonb)
      from public.kintore_group_members m
      where m.group_id = v_group.id
    ),
    'checkins', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', c.id,
        'member_id', c.member_id,
        'day', c.day,
        'summary', c.summary,
        'note', c.note,
        'updated_at', c.updated_at,
        'reactions', (
          select coalesce(jsonb_agg(jsonb_build_object('member_id', r.member_id, 'emoji', r.emoji) order by r.created_at), '[]'::jsonb)
          from public.kintore_group_reactions r
          where r.checkin_id = c.id
        ),
        'comments', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', k.id, 'member_id', k.member_id, 'body', k.body, 'created_at', k.created_at
          ) order by k.created_at), '[]'::jsonb)
          from public.kintore_group_comments k
          where k.checkin_id = c.id
        )
      ) order by c.day desc, c.updated_at desc), '[]'::jsonb)
      from public.kintore_group_checkins c
      where c.group_id = v_group.id and c.day between p_from and p_to
    )
  );
end
$$;

create function public.kintore_group_checkin(p_member_id uuid, p_secret text, p_day date, p_summary jsonb, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
  v_note text := public.kintore_group_clean_text(p_note, 100);
  v_id uuid;
begin
  -- 日本時間とのずれを見込んで「UTCの今日+1日」まで、さかのぼりは7日まで
  if p_day is null or p_day < current_date - 7 or p_day > current_date + 1 then
    raise exception 'KINTORE_GROUP_DAY' using errcode = 'P0001';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' or pg_column_size(p_summary) > 4096 then
    raise exception 'KINTORE_GROUP_SUMMARY' using errcode = 'P0001';
  end if;

  insert into public.kintore_group_checkins (group_id, member_id, day, summary, note)
  values (v_me.group_id, v_me.id, p_day, p_summary, v_note)
  on conflict (member_id, day)
  do update set summary = excluded.summary, note = excluded.note, updated_at = now()
  returning id into v_id;
  return v_id;
end
$$;

create function public.kintore_group_comment(p_member_id uuid, p_secret text, p_checkin_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
  v_body text := public.kintore_group_clean_text(p_body, 100);
  v_id uuid;
begin
  if v_body = '' then
    raise exception 'KINTORE_GROUP_COMMENT_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.kintore_group_checkins where id = p_checkin_id and group_id = v_me.group_id
  ) then
    raise exception 'KINTORE_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if (select count(*) from public.kintore_group_comments where checkin_id = p_checkin_id) >= 100 then
    raise exception 'KINTORE_GROUP_COMMENT_LIMIT' using errcode = 'P0001';
  end if;

  insert into public.kintore_group_comments (checkin_id, member_id, body)
  values (p_checkin_id, v_me.id, v_body)
  returning id into v_id;
  return v_id;
end
$$;

create function public.kintore_group_set_lock(p_member_id uuid, p_secret text, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_owner(p_member_id, p_secret);
begin
  update public.kintore_groups set invite_locked = coalesce(p_locked, false) where id = v_me.group_id;
end
$$;

create function public.kintore_group_rotate_code(p_member_id uuid, p_secret text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_owner(p_member_id, p_secret);
  v_code text := public.kintore_group_unique_code();
begin
  update public.kintore_groups set invite_code = v_code where id = v_me.group_id;
  return v_code;
end
$$;

-- ヘルパーは非公開、API だけ anon / authenticated に公開
revoke all on function
  public.kintore_group_hash(text),
  public.kintore_group_clean_text(text, integer),
  public.kintore_group_new_code(),
  public.kintore_group_unique_code(),
  public.kintore_group_require_secret(text),
  public.kintore_group_auth(uuid, text),
  public.kintore_group_owner(uuid, text),
  public.kintore_group_membership(public.kintore_groups, public.kintore_group_members)
  from public, anon, authenticated;

revoke all on function
  public.kintore_group_create(text, text, text),
  public.kintore_group_preview(text),
  public.kintore_group_join(text, text, text),
  public.kintore_group_feed(uuid, text, date, date),
  public.kintore_group_checkin(uuid, text, date, jsonb, text),
  public.kintore_group_comment(uuid, text, uuid, text),
  public.kintore_group_set_lock(uuid, text, boolean),
  public.kintore_group_rotate_code(uuid, text)
  from public;

grant execute on function
  public.kintore_group_create(text, text, text),
  public.kintore_group_preview(text),
  public.kintore_group_join(text, text, text),
  public.kintore_group_feed(uuid, text, date, date),
  public.kintore_group_checkin(uuid, text, date, jsonb, text),
  public.kintore_group_comment(uuid, text, uuid, text),
  public.kintore_group_set_lock(uuid, text, boolean),
  public.kintore_group_rotate_code(uuid, text)
  to anon, authenticated;
