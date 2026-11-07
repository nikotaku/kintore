-- public スキーマの既定権限を明示的に上書きし、AIビューを読み取り専用に固定する。

revoke all on table public.kintore_ai_context from public, anon, authenticated, service_role;
grant select on table public.kintore_ai_context to authenticated, service_role;
