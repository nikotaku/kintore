-- Append-only history. No automatic retention limit, no client write/delete access.
create table public.kintore_snapshot_history (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  state jsonb not null,
  state_version integer not null,
  synced_at timestamptz not null,
  archived_at timestamptz not null default now(),
  unique (user_id, synced_at)
);
create index kintore_snapshot_history_owner_time on public.kintore_snapshot_history(user_id, synced_at desc);
alter table public.kintore_snapshot_history enable row level security;
create policy kintore_history_owner_read on public.kintore_snapshot_history
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.kintore_snapshot_history from public, anon, authenticated;
grant select on public.kintore_snapshot_history to authenticated, service_role;

create function public.archive_kintore_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP <> 'INSERT' then
    insert into public.kintore_snapshot_history(user_id,state,state_version,synced_at)
    values (OLD.user_id,OLD.state,OLD.state_version,OLD.synced_at) on conflict do nothing;
  end if;
  if TG_OP <> 'DELETE' then
    insert into public.kintore_snapshot_history(user_id,state,state_version,synced_at)
    values (NEW.user_id,NEW.state,NEW.state_version,NEW.synced_at) on conflict do nothing;
    return NEW;
  end if;
  return OLD;
end;
$$;
revoke all on function public.archive_kintore_snapshot() from public, anon, authenticated;
create trigger kintore_preserve_snapshot_history
after insert or update or delete on public.kintore_snapshots
for each row execute function public.archive_kintore_snapshot();
insert into public.kintore_snapshot_history(user_id,state,state_version,synced_at)
select user_id,state,state_version,synced_at from public.kintore_snapshots on conflict do nothing;
