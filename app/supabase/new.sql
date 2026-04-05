-- Incremental migration script (non-destructive).
-- Fix self-relation on posts for reply/repost embeds.

create extension if not exists pgcrypto with schema extensions;

alter table public.profiles
  add column if not exists discord_id text,
  add column if not exists discord_username text,
  add column if not exists discord_avatar_url text,
  add column if not exists display_font text not null default 'geist';

update public.profiles
set display_font = 'dotgothic16'
where display_font = 'pixelify_sans';

create unique index if not exists profiles_discord_id_key
on public.profiles (discord_id)
where discord_id is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_display_font_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      drop constraint profiles_display_font_check;
  end if;

  alter table public.profiles
    add constraint profiles_display_font_check
    check (display_font in ('geist', 'geist_mono', 'dotgothic16', 'cherry_bomb'));
end
$$;

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


-- Admin moderation and announcement support.
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_moderation (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  post_restricted_until timestamptz,
  frozen_until timestamptz,
  reason text not null default '' check (char_length(reason) <= 1000),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.admin_action_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  moderator_id uuid not null references public.profiles (id) on delete restrict,
  target_user_id uuid references public.profiles (id) on delete set null,
  report_id uuid references public.post_reports (id) on delete set null,
  action text not null,
  reason text not null default '' check (char_length(reason) <= 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.announcements (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  content_md text not null check (char_length(content_md) between 1 and 10000),
  published_at timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.post_reports
  add column if not exists status text not null default 'open',
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists resolution_note text not null default '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'post_reports_status_check'
      and conrelid = 'public.post_reports'::regclass
  ) then
    alter table public.post_reports
      add constraint post_reports_status_check
      check (status in ('open', 'dismissed', 'actioned'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_action_logs_action_check'
      and conrelid = 'public.admin_action_logs'::regclass
  ) then
    alter table public.admin_action_logs
      add constraint admin_action_logs_action_check
      check (
        action in (
          'freeze',
          'unfreeze',
          'restrict_posts',
          'lift_post_restriction',
          'dismiss_report',
          'create_announcement'
        )
      );
  end if;
end
$$;

create index if not exists user_moderation_frozen_until_idx
on public.user_moderation (frozen_until desc);

create index if not exists user_moderation_post_restricted_until_idx
on public.user_moderation (post_restricted_until desc);

create index if not exists admin_action_logs_created_at_idx
on public.admin_action_logs (created_at desc);

create index if not exists admin_action_logs_target_created_at_idx
on public.admin_action_logs (target_user_id, created_at desc);

create index if not exists post_reports_status_created_at_idx
on public.post_reports (status, created_at desc);

create index if not exists announcements_published_at_idx
on public.announcements (published_at desc, created_at desc);

drop trigger if exists trg_user_moderation_set_updated_at on public.user_moderation;
create trigger trg_user_moderation_set_updated_at
before update on public.user_moderation
for each row execute function public.set_updated_at();

drop trigger if exists trg_announcements_set_updated_at on public.announcements;
create trigger trg_announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

alter table public.admin_users enable row level security;
alter table public.user_moderation enable row level security;
alter table public.admin_action_logs enable row level security;
alter table public.announcements enable row level security;

drop policy if exists "admin_users_select_public" on public.admin_users;
create policy "admin_users_select_public"
on public.admin_users
for select
using (true);

drop policy if exists "announcements_select_public" on public.announcements;
create policy "announcements_select_public"
on public.announcements
for select
using (published_at <= timezone('utc', now()));

create or replace function public.is_admin_user(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.admin_users where user_id = p_user_id),
    false
  );
$$;

create or replace function public.is_current_user_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.is_admin_user(auth.uid());
$$;

create or replace function public.require_current_admin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_current_user_admin() then
    raise exception '管理者権限が必要です';
  end if;
end;
$$;

create or replace function public.can_user_post(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    p_user_id is not null
    and not exists (
      select 1
      from public.user_moderation moderation
      where moderation.user_id = p_user_id
        and (
          (moderation.frozen_until is not null and moderation.frozen_until > timezone('utc', now()))
          or (
            moderation.post_restricted_until is not null
            and moderation.post_restricted_until > timezone('utc', now())
          )
        )
    )
  );
$$;

create or replace function public.can_user_interact(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select (
    p_user_id is not null
    and not exists (
      select 1
      from public.user_moderation moderation
      where moderation.user_id = p_user_id
        and moderation.frozen_until is not null
        and moderation.frozen_until > timezone('utc', now())
    )
  );
$$;

create or replace function public.get_public_user_moderation_status(p_user_id uuid)
returns table (
  frozen_until timestamptz,
  post_restricted_until timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    moderation.frozen_until,
    moderation.post_restricted_until
  from public.user_moderation moderation
  where moderation.user_id = p_user_id;
$$;

create or replace function public.admin_list_reports()
returns table (
  report_id uuid,
  status text,
  reported_at timestamptz,
  reason_category text,
  reason text,
  resolution_note text,
  reporter_id uuid,
  reporter_username text,
  reporter_display_name text,
  post_id uuid,
  post_content text,
  post_created_at timestamptz,
  reported_user_id uuid,
  reported_username text,
  reported_display_name text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  reviewed_by_username text,
  reviewed_by_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_current_admin();

  return query
  select
    reports.id,
    reports.status,
    reports.created_at,
    reports.reason_category,
    reports.reason,
    reports.resolution_note,
    reporter.id,
    reporter.username::text,
    reporter.display_name,
    posts.id,
    posts.content,
    posts.created_at,
    target.id,
    target.username::text,
    target.display_name,
    reports.reviewed_at,
    reviewer.id,
    reviewer.username::text,
    reviewer.display_name
  from public.post_reports reports
  join public.posts posts on posts.id = reports.post_id
  join public.profiles reporter on reporter.id = reports.reporter_id
  join public.profiles target on target.id = posts.user_id
  left join public.profiles reviewer on reviewer.id = reports.reviewed_by
  order by
    case reports.status
      when 'open' then 0
      when 'actioned' then 1
      else 2
    end,
    reports.created_at desc;
end;
$$;

create or replace function public.admin_search_users(search_query text default null)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  bio text,
  is_admin boolean,
  post_restricted_until timestamptz,
  frozen_until timestamptz,
  moderation_reason text,
  moderation_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_query text;
begin
  perform public.require_current_admin();

  normalized_query := nullif(trim(coalesce(search_query, '')), '');

  return query
  select
    profiles.id,
    profiles.username::text,
    profiles.display_name,
    profiles.avatar_url,
    profiles.bio,
    public.is_admin_user(profiles.id),
    moderation.post_restricted_until,
    moderation.frozen_until,
    moderation.reason,
    moderation.updated_at
  from public.profiles profiles
  left join public.user_moderation moderation on moderation.user_id = profiles.id
  where normalized_query is null
     or profiles.username::text ilike '%' || normalized_query || '%'
     or profiles.display_name ilike '%' || normalized_query || '%'
  order by profiles.created_at desc
  limit 40;
end;
$$;

create or replace function public.admin_list_logs(limit_count integer default 100)
returns table (
  id uuid,
  action text,
  reason text,
  details jsonb,
  created_at timestamptz,
  moderator_id uuid,
  moderator_username text,
  moderator_display_name text,
  target_user_id uuid,
  target_username text,
  target_display_name text,
  report_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_current_admin();

  return query
  select
    logs.id,
    logs.action,
    logs.reason,
    logs.details,
    logs.created_at,
    moderator.id,
    moderator.username::text,
    moderator.display_name,
    target.id,
    target.username::text,
    target.display_name,
    logs.report_id
  from public.admin_action_logs logs
  join public.profiles moderator on moderator.id = logs.moderator_id
  left join public.profiles target on target.id = logs.target_user_id
  order by logs.created_at desc
  limit greatest(coalesce(limit_count, 100), 1);
end;
$$;

create or replace function public.admin_list_announcements()
returns table (
  id uuid,
  title text,
  content_md text,
  published_at timestamptz,
  created_at timestamptz,
  created_by uuid,
  created_by_username text,
  created_by_display_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.require_current_admin();

  return query
  select
    announcements.id,
    announcements.title,
    announcements.content_md,
    announcements.published_at,
    announcements.created_at,
    creator.id,
    creator.username::text,
    creator.display_name
  from public.announcements announcements
  left join public.profiles creator on creator.id = announcements.created_by
  order by announcements.published_at desc, announcements.created_at desc;
end;
$$;

create or replace function public.admin_dismiss_report(p_report_id uuid, p_note text default '')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  perform public.require_current_admin();

  if p_report_id is null then
    raise exception '対象の通報が見つかりません';
  end if;

  update public.post_reports
  set
    status = 'dismissed',
    reviewed_by = current_user_id,
    reviewed_at = timezone('utc', now()),
    resolution_note = coalesce(p_note, '')
  where id = p_report_id;

  if not found then
    raise exception '対象の通報が見つかりません';
  end if;

  insert into public.admin_action_logs (moderator_id, report_id, action, reason, details)
  values (
    current_user_id,
    p_report_id,
    'dismiss_report',
    coalesce(p_note, ''),
    jsonb_build_object('status', 'dismissed')
  );

  return true;
end;
$$;

drop function if exists public.admin_apply_user_action(uuid, text, integer, text, uuid);

create function public.admin_apply_user_action(
  p_target_user_id uuid,
  p_action text,
  p_duration_hours integer default null,
  p_reason text default '',
  p_report_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_until timestamptz;
  normalized_action text := trim(coalesce(p_action, ''));
begin
  perform public.require_current_admin();

  if p_target_user_id is null then
    raise exception '対象ユーザーが見つかりません';
  end if;

  if current_user_id is null then
    raise exception 'ログインが必要です';
  end if;

  if p_target_user_id = current_user_id then
    raise exception '自分自身には適用できません';
  end if;

  if public.is_admin_user(p_target_user_id) then
    raise exception '管理者アカウントはこのパネルから操作できません';
  end if;

  insert into public.user_moderation (user_id, updated_by, reason)
  values (p_target_user_id, current_user_id, coalesce(p_reason, ''))
  on conflict (user_id) do nothing;

  if normalized_action in ('freeze', 'restrict_posts') then
    if coalesce(p_duration_hours, 0) <= 0 then
      raise exception '期間を選択してください';
    end if;
    next_until := timezone('utc', now()) + make_interval(hours => p_duration_hours);
  end if;

  case normalized_action
    when 'freeze' then
      update public.user_moderation
      set
        frozen_until = next_until,
        updated_by = current_user_id,
        updated_at = timezone('utc', now()),
        reason = coalesce(p_reason, '')
      where public.user_moderation.user_id = p_target_user_id;
    when 'unfreeze' then
      update public.user_moderation
      set
        frozen_until = null,
        updated_by = current_user_id,
        updated_at = timezone('utc', now()),
        reason = coalesce(p_reason, reason)
      where public.user_moderation.user_id = p_target_user_id;
    when 'restrict_posts' then
      update public.user_moderation
      set
        post_restricted_until = next_until,
        updated_by = current_user_id,
        updated_at = timezone('utc', now()),
        reason = coalesce(p_reason, '')
      where public.user_moderation.user_id = p_target_user_id;
    when 'lift_post_restriction' then
      update public.user_moderation
      set
        post_restricted_until = null,
        updated_by = current_user_id,
        updated_at = timezone('utc', now()),
        reason = coalesce(p_reason, reason)
      where public.user_moderation.user_id = p_target_user_id;
    else
      raise exception '不明な管理アクションです';
  end case;

  if p_report_id is not null then
    update public.post_reports
    set
      status = 'actioned',
      reviewed_by = current_user_id,
      reviewed_at = timezone('utc', now()),
      resolution_note = coalesce(p_reason, '')
    where id = p_report_id;
  end if;

  insert into public.admin_action_logs (moderator_id, target_user_id, report_id, action, reason, details)
  values (
    current_user_id,
    p_target_user_id,
    p_report_id,
    normalized_action,
    coalesce(p_reason, ''),
    jsonb_build_object(
      'duration_hours', p_duration_hours,
      'at', timezone('utc', now())
    )
  );

  return true;
end;
$$;

create or replace function public.admin_create_announcement(
  p_title text,
  p_content_md text,
  p_published_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  created_id uuid;
  publish_at timestamptz := coalesce(p_published_at, timezone('utc', now()));
begin
  perform public.require_current_admin();

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'タイトルを入力してください';
  end if;

  if nullif(trim(coalesce(p_content_md, '')), '') is null then
    raise exception '本文を入力してください';
  end if;

  insert into public.announcements (title, content_md, published_at, created_by)
  values (trim(p_title), p_content_md, publish_at, current_user_id)
  returning id into created_id;

  insert into public.admin_action_logs (moderator_id, action, reason, details)
  values (
    current_user_id,
    'create_announcement',
    trim(p_title),
    jsonb_build_object('announcement_id', created_id, 'published_at', publish_at)
  );

  return created_id;
end;
$$;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id and public.can_user_interact(auth.uid()))
with check (auth.uid() = id and public.can_user_interact(auth.uid()));

drop policy if exists "posts_insert_authenticated" on public.posts;
create policy "posts_insert_authenticated"
on public.posts
for insert
to authenticated
with check (auth.uid() = user_id and public.can_user_post(auth.uid()));

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
on public.posts
for update
to authenticated
using (auth.uid() = user_id and public.can_user_post(auth.uid()))
with check (auth.uid() = user_id and public.can_user_post(auth.uid()));

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
on public.posts
for delete
to authenticated
using (auth.uid() = user_id and public.can_user_post(auth.uid()));

drop policy if exists "likes_insert_own" on public.post_likes;
create policy "likes_insert_own"
on public.post_likes
for insert
to authenticated
with check (auth.uid() = user_id and public.can_user_interact(auth.uid()));

drop policy if exists "likes_delete_own" on public.post_likes;
create policy "likes_delete_own"
on public.post_likes
for delete
to authenticated
using (auth.uid() = user_id and public.can_user_interact(auth.uid()));

drop policy if exists "reactions_insert_own" on public.post_reactions;
create policy "reactions_insert_own"
on public.post_reactions
for insert
to authenticated
with check (auth.uid() = user_id and public.can_user_interact(auth.uid()));

drop policy if exists "reactions_delete_own" on public.post_reactions;
create policy "reactions_delete_own"
on public.post_reactions
for delete
to authenticated
using (auth.uid() = user_id and public.can_user_interact(auth.uid()));

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
on public.follows
for insert
to authenticated
with check (auth.uid() = follower_id and public.can_user_interact(auth.uid()));

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
on public.follows
for delete
to authenticated
using (auth.uid() = follower_id and public.can_user_interact(auth.uid()));

-- Spotify connection support.
create table if not exists public.spotify_connections (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  spotify_user_id text not null,
  spotify_display_name text,
  spotify_avatar_url text,
  access_token text not null,
  refresh_token text not null,
  scopes text not null default '',
  access_token_expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.spotify_presence_cache (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  spotify_display_name text,
  spotify_avatar_url text,
  is_connected boolean not null default false,
  is_playing boolean not null default false,
  track_name text,
  artist_name text,
  album_name text,
  album_image_url text,
  track_url text,
  played_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists spotify_connections_spotify_user_id_key
on public.spotify_connections (spotify_user_id);

drop trigger if exists trg_spotify_connections_set_updated_at on public.spotify_connections;
create trigger trg_spotify_connections_set_updated_at
before update on public.spotify_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_spotify_presence_cache_set_updated_at on public.spotify_presence_cache;
create trigger trg_spotify_presence_cache_set_updated_at
before update on public.spotify_presence_cache
for each row execute function public.set_updated_at();

alter table public.spotify_connections enable row level security;
alter table public.spotify_presence_cache enable row level security;

drop policy if exists "spotify_connections_select_own" on public.spotify_connections;
create policy "spotify_connections_select_own"
on public.spotify_connections
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "spotify_presence_cache_select_public" on public.spotify_presence_cache;
create policy "spotify_presence_cache_select_public"
on public.spotify_presence_cache
for select
using (is_connected = true);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table public.announcements;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'spotify_presence_cache'
  ) then
    alter publication supabase_realtime add table public.spotify_presence_cache;
  end if;
end
$$;

notify pgrst, 'reload schema';

