-- Incremental migration script (non-destructive).
-- Fix self-relation on posts for reply/repost embeds.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists discord_id text,
  add column if not exists discord_username text,
  add column if not exists discord_avatar_url text;

create unique index if not exists profiles_discord_id_key
on public.profiles (discord_id)
where discord_id is not null;

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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  81920,
  array['image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read"
on storage.objects
for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Post image support via Backblaze B2.
alter table public.posts
  add column if not exists has_media boolean not null default false;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'posts_has_content_or_repost'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts drop constraint posts_has_content_or_repost;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_has_content_repost_or_media'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_has_content_repost_or_media check (
        (content is not null and char_length(trim(content)) between 1 and 500)
        or repost_of_id is not null
        or has_media = true
      );
  end if;
end
$$;

create table if not exists public.post_images (
  id uuid primary key default extensions.gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  url text not null,
  storage_key text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists post_images_post_id_sort_order_idx
on public.post_images (post_id, sort_order, created_at);

alter table public.post_images enable row level security;

drop policy if exists "post_images_select_public" on public.post_images;
create policy "post_images_select_public"
on public.post_images
for select
using (true);

drop policy if exists "post_images_insert_own_post" on public.post_images;
create policy "post_images_insert_own_post"
on public.post_images
for insert
to authenticated
with check (
  exists (
    select 1
    from public.posts
    where posts.id = post_images.post_id
      and posts.user_id = auth.uid()
  )
);

drop policy if exists "post_images_update_own_post" on public.post_images;
create policy "post_images_update_own_post"
on public.post_images
for update
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_images.post_id
      and posts.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.posts
    where posts.id = post_images.post_id
      and posts.user_id = auth.uid()
  )
);

drop policy if exists "post_images_delete_own_post" on public.post_images;
create policy "post_images_delete_own_post"
on public.post_images
for delete
to authenticated
using (
  exists (
    select 1
    from public.posts
    where posts.id = post_images.post_id
      and posts.user_id = auth.uid()
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'post_images'
  ) then
    alter publication supabase_realtime add table public.post_images;
  end if;
end
$$;

notify pgrst, 'reload schema';

