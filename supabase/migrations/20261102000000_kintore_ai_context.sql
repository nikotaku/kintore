-- AIが筋トレ記録を安全に読み取るための本人専用ビュー。
-- security_invoker により、元の kintore_snapshots の RLS をそのまま適用する。

create or replace view public.kintore_ai_context
with (security_invoker = true)
as
select
  user_id,
  synced_at,
  state_version,
  jsonb_build_object(
    'format', 'kintore-ai-context-v1',
    'synced_at', synced_at,
    'profile', jsonb_build_object(
      'targets', coalesce(state -> 'targets', '{}'::jsonb),
      'weaknesses', coalesce(state #>> '{advice,weaknesses}', '')
    ),
    'exercises', coalesce(state -> 'exercises', '[]'::jsonb),
    'workouts', coalesce(state -> 'workouts', '{}'::jsonb),
    'runs', coalesce(state -> 'runs', '{}'::jsonb),
    'meals', coalesce(state -> 'meals', '{}'::jsonb),
    'body', coalesce(state -> 'body', '{}'::jsonb)
  ) as context
from public.kintore_snapshots;

revoke all on table public.kintore_ai_context from public, anon;
grant select on table public.kintore_ai_context to authenticated;

comment on view public.kintore_ai_context is
  'RLS付き筋トレ記録をAI分析向けJSONに整形する本人専用ビュー';
