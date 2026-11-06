-- Apply once through Supabase SQL Editor or `supabase db push`.
begin;

create table public.study_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint plan_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['courses', 'terms', 'categories', 'target']
    and jsonb_typeof(data->'courses') = 'array'
    and jsonb_typeof(data->'terms') = 'array'
    and jsonb_typeof(data->'categories') = 'array'
    and jsonb_typeof(data->'target') = 'number'
    and octet_length(data::text) <= 1000000
  )
);

alter table public.study_plans enable row level security;
alter table public.study_plans force row level security;
revoke all on public.study_plans from public, anon, authenticated;
grant select, insert, update on public.study_plans to authenticated;

create policy read_own_plan on public.study_plans
  for select to authenticated using ((select auth.uid()) = user_id);
create policy insert_own_plan on public.study_plans
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy update_own_plan on public.study_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Invoker rights: RLS remains in force. No user ID is accepted from the browser.
-- Revision checks make concurrent saves atomic; stale tabs must reload explicitly.
create function public.save_study_plan(plan_data jsonb, expected_revision bigint)
returns table(revision bigint, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  saved_revision bigint;
  saved_at timestamptz;
begin
  if owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if expected_revision is null then
    insert into public.study_plans as p (user_id, data)
    values (owner_id, plan_data)
    on conflict (user_id) do nothing
    returning p.revision, p.updated_at into saved_revision, saved_at;
  else
    update public.study_plans as p
    set data = plan_data, revision = p.revision + 1, updated_at = now()
    where p.user_id = owner_id and p.revision = expected_revision
    returning p.revision, p.updated_at into saved_revision, saved_at;
  end if;

  if saved_revision is null then
    raise exception 'Plan changed on another device' using errcode = 'P0001';
  end if;
  return query select saved_revision, saved_at;
end;
$$;
revoke all on function public.save_study_plan(jsonb, bigint) from public, anon;
grant execute on function public.save_study_plan(jsonb, bigint) to authenticated;

commit;
