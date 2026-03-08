-- Incremental migration script (non-destructive).
-- Fix self-relation on posts for reply/repost embeds.

create extension if not exists pgcrypto with schema extensions;

alter table if exists public.posts
  add column if not exists repost_of_id uuid,
  add column if not exists reply_to_id uuid;

do $$
begin
  if exists (
    select 1 from pg_class where relname = 'posts' and relnamespace = 'public'::regnamespace
  ) then
    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_repost_of_id_fkey'
        and conrelid = 'public.posts'::regclass
    ) then
      alter table public.posts
        add constraint posts_repost_of_id_fkey
        foreign key (repost_of_id) references public.posts (id) on delete cascade;
    end if;

    if not exists (
      select 1
      from pg_constraint
      where conname = 'posts_reply_to_id_fkey'
        and conrelid = 'public.posts'::regclass
    ) then
      alter table public.posts
        add constraint posts_reply_to_id_fkey
        foreign key (reply_to_id) references public.posts (id) on delete cascade;
    end if;
  end if;
end
$$;

create index if not exists posts_repost_of_idx
on public.posts (repost_of_id, created_at desc);

create index if not exists posts_reply_to_idx
on public.posts (reply_to_id, created_at desc);

alter table if exists public.posts enable row level security;

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'posts'
  loop
    execute format('drop policy if exists %I on public.posts', pol.policyname);
  end loop;
end
$$;

create policy "posts_select_public"
on public.posts
for select
using (
  auth.uid() is null
  or not exists (
    select 1
    from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = posts.user_id)
       or (b.blocker_id = posts.user_id and b.blocked_id = auth.uid())
  )
);

create policy "posts_insert_authenticated"
on public.posts
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "posts_update_own"
on public.posts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "posts_delete_own"
on public.posts
for delete
to authenticated
using (auth.uid() = user_id);

-- Force PostgREST schema cache refresh after DDL/policy changes.
notify pgrst, 'reload schema';
