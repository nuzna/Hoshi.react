-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT blocks_pkey PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES public.profiles(id),
  CONSTRAINT blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.deleted_post_history (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text,
  deleted_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT deleted_post_history_pkey PRIMARY KEY (id),
  CONSTRAINT deleted_post_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.follow_history (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['follow'::text, 'unfollow'::text])),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT follow_history_pkey PRIMARY KEY (id),
  CONSTRAINT follow_history_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id),
  CONSTRAINT follow_history_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.follows (
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT follows_pkey PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_follower_id_fkey FOREIGN KEY (follower_id) REFERENCES public.profiles(id),
  CONSTRAINT follows_following_id_fkey FOREIGN KEY (following_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  recipient_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  type text NOT NULL CHECK (type = ANY (ARRAY['like'::text, 'reaction'::text, 'follow'::text])),
  post_id uuid,
  reaction_emoji text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id),
  CONSTRAINT notifications_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id),
  CONSTRAINT notifications_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.post_hashtags (
  post_id uuid NOT NULL,
  tag text NOT NULL CHECK (char_length(tag) >= 1 AND char_length(tag) <= 64),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT post_hashtags_pkey PRIMARY KEY (post_id, tag),
  CONSTRAINT post_hashtags_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.post_likes (
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT post_likes_pkey PRIMARY KEY (post_id, user_id),
  CONSTRAINT post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.post_reactions (
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL CHECK (char_length(emoji) <= 32),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT post_reactions_pkey PRIMARY KEY (post_id, user_id, emoji),
  CONSTRAINT post_reactions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_reactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.post_reports (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  post_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL DEFAULT ''::text CHECK (char_length(reason) <= 500),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  reason_category text NOT NULL DEFAULT 'other'::text CHECK (reason_category = ANY (ARRAY['spam'::text, 'abuse'::text, 'misinfo'::text, 'nsfw'::text, 'other'::text])),
  CONSTRAINT post_reports_pkey PRIMARY KEY (id),
  CONSTRAINT post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.posts (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL,
  content text,
  repost_of_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  reply_to_id uuid,
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT posts_repost_of_id_fkey FOREIGN KEY (repost_of_id) REFERENCES public.posts(id),
  CONSTRAINT posts_reply_to_id_fkey FOREIGN KEY (reply_to_id) REFERENCES public.posts(id)
);
CREATE TABLE public.profile_achievements (
  id uuid NOT NULL DEFAULT extensions.gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) >= 1 AND char_length(title) <= 80),
  description text NOT NULL DEFAULT ''::text CHECK (char_length(description) <= 280),
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  achievement_id text,
  emoji text,
  rarity text NOT NULL DEFAULT 'silver'::text CHECK (rarity = ANY (ARRAY['diamond'::text, 'gold'::text, 'silver'::text, 'bronze'::text])),
  CONSTRAINT profile_achievements_pkey PRIMARY KEY (id),
  CONSTRAINT profile_achievements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  username USER-DEFINED NOT NULL UNIQUE CHECK (username ~ '^[a-zA-Z0-9_]{3,20}$'::citext),
  display_name text NOT NULL CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 50),
  bio text NOT NULL DEFAULT ''::text CHECK (char_length(bio) <= 280),
  avatar_url text,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  likes_visibility text NOT NULL DEFAULT 'public'::text CHECK (likes_visibility = ANY (ARRAY['public'::text, 'private'::text])),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);