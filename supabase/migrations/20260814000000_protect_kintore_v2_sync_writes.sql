do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.kintore_snapshots'::regclass
      and conname = 'kintore_snapshots_writer_v2_check'
  ) then
    alter table public.kintore_snapshots
      add constraint kintore_snapshots_writer_v2_check
      check (state_version is not null and state_version >= 2);
  end if;
end
$$;

revoke all privileges on table public.kintore_snapshots from anon, authenticated;
revoke all privileges on table public.kintore_profiles from anon, authenticated;
revoke all privileges on table public.kintore_advice_deliveries from anon, authenticated;

grant select, insert, update on table public.kintore_snapshots to authenticated;
grant select, insert, update on table public.kintore_profiles to authenticated;
grant select on table public.kintore_advice_deliveries to authenticated;
