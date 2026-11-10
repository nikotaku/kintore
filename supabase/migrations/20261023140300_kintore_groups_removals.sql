-- 筋トレMEMO グループ機能: 取り消し系の公開 API（投稿の取り消し・リアクション切替・コメント削除・退出・メンバーを外す）
-- いずれも kintore_group_* の行だけを、本人またはオーナーの権限で消す。

create function public.kintore_group_checkin_delete(p_member_id uuid, p_secret text, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
begin
  delete from public.kintore_group_checkins where member_id = v_me.id and day = p_day;
end
$$;

create function public.kintore_group_react(p_member_id uuid, p_secret text, p_checkin_id uuid, p_emoji text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
begin
  if not exists (
    select 1 from public.kintore_group_checkins where id = p_checkin_id and group_id = v_me.group_id
  ) then
    raise exception 'KINTORE_GROUP_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_emoji is null or p_emoji not in ('👏', '🔥', '💪', '🎉') then
    raise exception 'KINTORE_GROUP_EMOJI' using errcode = 'P0001';
  end if;

  delete from public.kintore_group_reactions
  where checkin_id = p_checkin_id and member_id = v_me.id and emoji = p_emoji;
  if found then
    return false;
  end if;
  insert into public.kintore_group_reactions (checkin_id, member_id, emoji)
  values (p_checkin_id, v_me.id, p_emoji);
  return true;
end
$$;

-- 自分のコメント、またはオーナーなら同じグループ内のコメントを削除できる
create function public.kintore_group_comment_delete(p_member_id uuid, p_secret text, p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
begin
  delete from public.kintore_group_comments k
  using public.kintore_group_checkins c
  where k.id = p_comment_id
    and c.id = k.checkin_id
    and c.group_id = v_me.group_id
    and (k.member_id = v_me.id or v_me.role = 'owner');
end
$$;

-- 退出したメンバーの投稿は消える。オーナーが抜けたら一番古いメンバーへ引き継ぎ、誰もいなければグループを削除
create function public.kintore_group_leave(p_member_id uuid, p_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_auth(p_member_id, p_secret);
  v_next uuid;
begin
  perform 1 from public.kintore_groups where id = v_me.group_id for update;
  delete from public.kintore_group_members where id = v_me.id;
  if v_me.role = 'owner' then
    select id into v_next
    from public.kintore_group_members
    where group_id = v_me.group_id
    order by joined_at
    limit 1;
    if v_next is null then
      delete from public.kintore_groups where id = v_me.group_id;
    else
      update public.kintore_group_members set role = 'owner' where id = v_next;
    end if;
  end if;
end
$$;

create function public.kintore_group_kick(p_member_id uuid, p_secret text, p_target_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me public.kintore_group_members := public.kintore_group_owner(p_member_id, p_secret);
begin
  delete from public.kintore_group_members
  where id = p_target_member_id and group_id = v_me.group_id and id <> v_me.id;
end
$$;

revoke all on function
  public.kintore_group_checkin_delete(uuid, text, date),
  public.kintore_group_react(uuid, text, uuid, text),
  public.kintore_group_comment_delete(uuid, text, uuid),
  public.kintore_group_leave(uuid, text),
  public.kintore_group_kick(uuid, text, uuid)
  from public;

grant execute on function
  public.kintore_group_checkin_delete(uuid, text, date),
  public.kintore_group_react(uuid, text, uuid, text),
  public.kintore_group_comment_delete(uuid, text, uuid),
  public.kintore_group_leave(uuid, text),
  public.kintore_group_kick(uuid, text, uuid)
  to anon, authenticated;
