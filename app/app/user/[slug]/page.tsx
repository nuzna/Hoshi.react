"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  type FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  Ban,
  LogOut,
  Send,
  UserPlus,
  UserRoundCheck,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { ModeToggle } from "@/components/mode-toggle";
import { NotificationBell } from "@/components/notification-bell";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TwemojiText } from "@/components/twemoji-text";
import {
  fetchAchievementStats,
  persistUnlockedAchievements,
  resolveAchievements,
  type ResolvedAchievement,
} from "@/lib/achievements";
import { hydratePostsRelations, pickSingleRelation, POST_SELECT_QUERY, type TimelinePost } from "@/lib/post-types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { FollowDialog } from "@/components/follow-dialog";
import { FollowersList, type FollowUser } from "@/components/followers-list";

type ProfileDetail = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "bio" | "avatar_url" | "created_at" | "likes_visibility"
>;

function UserPageContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [posts, setPosts] = useState<TimelinePost[]>([]);
  const [likedPosts, setLikedPosts] = useState<TimelinePost[]>([]);
  const [activeFeed, setActiveFeed] = useState<"posts" | "likes">("posts");
  const [achievements, setAchievements] = useState<ResolvedAchievement[]>([]);
  const [repostCountMap, setRepostCountMap] = useState<Map<string, number>>(
    new Map(),
  );
  const [searchQuery, setSearchQuery] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLikesVisibility, setEditLikesVisibility] = useState<"public" | "private">("public");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  const [composerText, setComposerText] = useState("");
  const [quoteTarget, setQuoteTarget] = useState<TimelinePost | null>(null);
  const [replyTarget, setReplyTarget] = useState<TimelinePost | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [isBlockPending, setIsBlockPending] = useState(false);
  const [isFollowPending, setIsFollowPending] = useState(false);
  const [pendingLikePostId, setPendingLikePostId] = useState<string | null>(
    null,
  );
  const [pendingRepostPostId, setPendingRepostPostId] = useState<string | null>(
    null,
  );
  const [pendingReactionKey, setPendingReactionKey] = useState<string | null>(
    null,
  );
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [followingUsers, setFollowingUsers] = useState<FollowUser[]>([]);
  const [isFollowListLoading, setIsFollowListLoading] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const visiblePostIdsRef = useRef<Set<string>>(new Set());
  const isOwnProfile = profile !== null && user?.id === profile.id;

  const fetchProfileAndPosts = useCallback(
    async (withLoading: boolean, viewerUserId?: string | null) => {
      if (!slug) return;
      if (withLoading) setIsLoading(true);

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at, likes_visibility")
        .eq("username", slug)
        .maybeSingle();

      if (error) {
        setMessage(error.message);
        setProfile(null);
        setPosts([]);
        setLikedPosts([]);
        setAchievements([]);
        setIsLoading(false);
        return;
      }

      if (!data) {
        setProfile(null);
        setPosts([]);
        setLikedPosts([]);
        setAchievements([]);
        setIsLoading(false);
        return;
      }

      const typedProfile = data as ProfileDetail;
      setProfile(typedProfile);
      setDisplayName(typedProfile.display_name);
      setBio(typedProfile.bio);
      if (!isEditProfileOpen) {
        setEditDisplayName(typedProfile.display_name);
        setEditBio(typedProfile.bio);
        setEditLikesVisibility((typedProfile.likes_visibility as "public" | "private") ?? "public");
      }

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(POST_SELECT_QUERY)
        .eq("user_id", typedProfile.id)
        .order("created_at", { ascending: false })
        .limit(120);

      if (postsError) {
        setMessage(postsError.message);
        setPosts([]);
        setIsLoading(false);
        return;
      }

      const typedPosts = (postsData ?? []) as TimelinePost[];
      const hydratedPosts = await hydratePostsRelations(supabase, typedPosts);
      setPosts(hydratedPosts);
      visiblePostIdsRef.current = new Set(hydratedPosts.map((post) => post.id));

      if (typedProfile.likes_visibility === "public" || viewerUserId === typedProfile.id) {
        const { data: likedRows, error: likedError } = await supabase
          .from("post_likes")
          .select(`post_id, created_at, posts!inner(${POST_SELECT_QUERY})`)
          .eq("user_id", typedProfile.id)
          .order("created_at", { ascending: false })
          .limit(120);

        if (likedError) {
          setLikedPosts([]);
        } else {
          const liked = ((likedRows ?? []).map((row) => row.posts).filter(Boolean) as unknown) as TimelinePost[];
          const hydratedLiked = await hydratePostsRelations(supabase, liked);
          setLikedPosts(hydratedLiked);
        }
      } else {
        setLikedPosts([]);
      }

      try {
        const stats = await fetchAchievementStats(supabase, typedProfile.id);
        const resolved = resolveAchievements(stats);
        setAchievements(resolved);

        if (viewerUserId && viewerUserId === typedProfile.id) {
          await persistUnlockedAchievements(supabase, typedProfile.id, resolved);
        }
      } catch (achievementError) {
        setAchievements([]);
        if (achievementError instanceof Error) {
          setMessage(achievementError.message);
        }
      }

      const ids = hydratedPosts.map((post) => post.id);
      if (ids.length === 0) {
        setRepostCountMap(new Map());
        setIsLoading(false);
        return;
      }

      const { data: repostRows, error: repostError } = await supabase
        .from("posts")
        .select("repost_of_id")
        .in("repost_of_id", ids);

      if (repostError) {
        setMessage(repostError.message);
        setIsLoading(false);
        return;
      }

      const map = new Map<string, number>();
      for (const row of repostRows ?? []) {
        if (!row.repost_of_id) continue;
        map.set(row.repost_of_id, (map.get(row.repost_of_id) ?? 0) + 1);
      }
      setRepostCountMap(map);
      if (withLoading) setIsLoading(false);
    },
    [isEditProfileOpen, slug],
  );

  const fetchFollowState = useCallback(async () => {
    if (!user || !profile || user.id === profile.id) {
      setIsFollowing(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("follows")
      .select("follower_id")
      .eq("follower_id", user.id)
      .eq("following_id", profile.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }
    setIsFollowing(Boolean(data));
  }, [profile, user]);

  const fetchBlockState = useCallback(async () => {
    if (!user || !profile || user.id === profile.id) {
      setIsBlocked(false);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("blocks")
      .select("blocker_id")
      .eq("blocker_id", user.id)
      .eq("blocked_id", profile.id)
      .maybeSingle();

    if (error) {
      setMessage(error.message);
      return;
    }
    setIsBlocked(Boolean(data));
  }, [profile, user]);

  const fetchFollowLists = useCallback(async () => {
    if (!profile) {
      setFollowers([]);
      setFollowingUsers([]);
      return;
    }

    setIsFollowListLoading(true);
    const supabase = getSupabaseBrowserClient();

    const followersQuery = supabase
      .from("follows")
      .select("follower:profiles!follows_follower_id_fkey(id, username, display_name, avatar_url)")
      .eq("following_id", profile.id);

    const followingQuery = supabase
      .from("follows")
      .select("following:profiles!follows_following_id_fkey(id, username, display_name, avatar_url)")
      .eq("follower_id", profile.id);

    const [followersResult, followingResult] = await Promise.all([followersQuery, followingQuery]);
    setIsFollowListLoading(false);

    if (followersResult.error || followingResult.error) {
      setMessage(followersResult.error?.message ?? followingResult.error?.message ?? "Follow list load failed.");
      return;
    }

    const followerUsers = (followersResult.data ?? [])
      .map((row) => row.follower)
      .filter((target): target is FollowUser => Boolean(target));

    const followingTargets = (followingResult.data ?? [])
      .map((row) => row.following)
      .filter((target): target is FollowUser => Boolean(target));

    setFollowers(followerUsers);
    setFollowingUsers(followingTargets);
  }, [profile]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    queueMicrotask(() => {
      void fetchProfileAndPosts(true);
    });

    void supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      void fetchProfileAndPosts(true, data.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [fetchProfileAndPosts]);

  useEffect(() => {
    if (!profile) return;

    const supabase = getSupabaseBrowserClient();
    const profileId = profile.id;
    const viewerId = user?.id ?? null;

    const channel = supabase
      .channel(`user-page-${slug}-${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "posts",
          filter: `user_id=eq.${profileId}`,
        },
        () => void fetchProfileAndPosts(false, user?.id ?? null),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${profileId}`,
        },
        () => void fetchProfileAndPosts(false, user?.id ?? null),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `following_id=eq.${profileId}`,
        },
        () => {
          void fetchProfileAndPosts(false, user?.id ?? null);
          void fetchFollowState();
          void fetchFollowLists();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${profileId}`,
        },
        () => void fetchFollowLists(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_likes" },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            post_id?: string;
          } | null;
          if (!row?.post_id) return;
          if (!visiblePostIdsRef.current.has(row.post_id)) return;
          void fetchProfileAndPosts(false, user?.id ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "post_reactions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            post_id?: string;
          } | null;
          if (!row?.post_id) return;
          if (!visiblePostIdsRef.current.has(row.post_id)) return;
          void fetchProfileAndPosts(false, user?.id ?? null);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blocks" },
        () => {
          void fetchBlockState();
          void fetchProfileAndPosts(false, user?.id ?? null);
        },
      )
      ;

    if (viewerId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "follows",
          filter: `follower_id=eq.${viewerId}`,
        },
        () => void fetchFollowState(),
      );
    }

    channel.subscribe();
    queueMicrotask(() => {
      void fetchFollowState();
      void fetchFollowLists();
      void fetchBlockState();
    });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchBlockState, fetchFollowLists, fetchFollowState, fetchProfileAndPosts, profile, slug, user?.id]);

  const requireLogin = () => {
    router.push("/login");
  };

  const handleToggleFollow = async () => {
    if (!user || !profile || user.id === profile.id) return;
    if (isBlocked) {
      setMessage("ブロック中のユーザーはフォローできません。");
      return;
    }
    setIsFollowPending(true);

    const supabase = getSupabaseBrowserClient();
    if (isFollowing) {
      const { error } = await supabase
        .from("follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("following_id", profile.id);

      if (error) {
        setMessage(error.message);
        setIsFollowPending(false);
        return;
      }

      setIsFollowing(false);
      setIsFollowPending(false);
      return;
    }

    const { error } = await supabase.from("follows").insert({
      follower_id: user.id,
      following_id: profile.id,
    });

    if (error) {
      setMessage(error.message);
      setIsFollowPending(false);
      return;
    }

    setIsFollowing(true);
    setIsFollowPending(false);
  };

  const handleToggleBlock = async () => {
    if (!user || !profile || user.id === profile.id) return;
    setIsBlockPending(true);

    const supabase = getSupabaseBrowserClient();
    if (isBlocked) {
      const { error } = await supabase
        .from("blocks")
        .delete()
        .eq("blocker_id", user.id)
        .eq("blocked_id", profile.id);
      setIsBlockPending(false);

      if (error) {
        setMessage(error.message);
        return;
      }
      setIsBlocked(false);
      setMessage("ブロックを解除しました。");
      return;
    }

    const { error } = await supabase.from("blocks").insert({
      blocker_id: user.id,
      blocked_id: profile.id,
    });
    setIsBlockPending(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    // Safety cleanup: remove follow relation both ways when blocking.
    await supabase
      .from("follows")
      .delete()
      .or(`and(follower_id.eq.${user.id},following_id.eq.${profile.id}),and(follower_id.eq.${profile.id},following_id.eq.${user.id})`);

    setIsBlocked(true);
    setIsFollowing(false);
    setMessage("ブロックしました。");
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwnProfile || !profile) return;

    const nextDisplayName = editDisplayName.trim();
    const nextBio = editBio.trim();
    if (!nextDisplayName) {
      setMessage("Display name is required.");
      return;
    }

    setIsSavingProfile(true);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: nextDisplayName, bio: nextBio, likes_visibility: editLikesVisibility })
      .eq("id", profile.id);

    setIsSavingProfile(false);
    if (error) {
      setMessage(error.message);
      return;
    }

    setDisplayName(nextDisplayName);
    setBio(nextBio);
    setIsEditProfileOpen(false);
    setMessage("プロフィールを更新しました。");
    void fetchProfileAndPosts(false, user?.id ?? null);
  };

  const handleCreatePost = async () => {
    if (!user || !isOwnProfile) return;

    const content = composerText.trim();
    if (!quoteTarget && !replyTarget && !content) return;
    if ((quoteTarget || replyTarget) && !content) {
      setMessage("引用・返信には本文の入力が必要です。");
      return;
    }

    setIsPosting(true);
    setMessage(null);

    const payload = quoteTarget
      ? { user_id: user.id, content, repost_of_id: quoteTarget.id }
      : replyTarget
        ? { user_id: user.id, content, reply_to_id: replyTarget.id }
        : { user_id: user.id, content };

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("posts").insert(payload);
    setIsPosting(false);

    if (error) {
      setMessage(error.message);
      return;
    }
    setComposerText("");
    setQuoteTarget(null);
    setReplyTarget(null);
  };

  const handleToggleLike = async (post: TimelinePost) => {
    if (!user) return requireLogin();
    setPendingLikePostId(post.id);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    const liked = (post.post_likes ?? []).some(
      (like) => like.user_id === user.id,
    );
    const request = liked
      ? supabase
          .from("post_likes")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
      : supabase
          .from("post_likes")
          .insert({ post_id: post.id, user_id: user.id });

    const { error } = await request;

    setPendingLikePostId(null);
    if (error) setMessage(error.message);
  };

  const handleToggleRepost = async (post: TimelinePost) => {
    if (!user) return requireLogin();
    setPendingRepostPostId(post.id);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    const { data: rows, error: findError } = await supabase
      .from("posts")
      .select("id")
      .eq("user_id", user.id)
      .eq("repost_of_id", post.id)
      .is("content", null)
      .limit(1);

    if (findError) {
      setPendingRepostPostId(null);
      setMessage(findError.message);
      return;
    }

    const existing = rows?.[0];
    const request = existing
      ? supabase
          .from("posts")
          .delete()
          .eq("id", existing.id)
          .eq("user_id", user.id)
      : supabase
          .from("posts")
          .insert({ user_id: user.id, repost_of_id: post.id, content: null });

    const { error } = await request;
    setPendingRepostPostId(null);
    if (error) setMessage(error.message);
  };

  const handleToggleReaction = async (post: TimelinePost, emoji: string) => {
    if (!user) return requireLogin();

    const key = `${post.id}:${emoji}`;
    setPendingReactionKey(key);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    const hasReaction = (post.post_reactions ?? []).some(
      (reaction) => reaction.user_id === user.id && reaction.emoji === emoji,
    );

    const request = hasReaction
      ? supabase
          .from("post_reactions")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", user.id)
          .eq("emoji", emoji)
      : supabase
          .from("post_reactions")
          .insert({ post_id: post.id, user_id: user.id, emoji });

    const { error } = await request;

    setPendingReactionKey(null);
    if (error) setMessage(error.message);
  };

  const handleDeletePost = async (post: TimelinePost) => {
    if (!user || post.user_id !== user.id) return;
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase
      .from("posts")
      .delete()
      .eq("id", post.id)
      .eq("user_id", user.id);
    if (error) setMessage(error.message);
  };

  const handleReportPost = async (
    post: TimelinePost,
    category: string,
    reason: string,
  ) => {
    if (!user) return requireLogin();
    if (post.user_id === user.id) return;

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("post_reports").upsert({
      post_id: post.id,
      reporter_id: user.id,
      reason_category: category,
      reason,
    });

    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage("通報しました");
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(error.message);
  };

  const joinedDate = useMemo(() => {
    if (!profile) return "";
    return new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(
      new Date(profile.created_at),
    );
  }, [profile]);

  const searchKeyword = searchQuery.trim().toLowerCase();
  const filteredAchievements = useMemo(() => {
    if (!searchKeyword) return achievements;
    return achievements.filter((achievement) => {
      const haystack =
        `${achievement.name} ${achievement.description} ${achievement.rarity}`.toLowerCase();
      return haystack.includes(searchKeyword);
    });
  }, [achievements, searchKeyword]);
  const unlockedAchievements = useMemo(
    () => filteredAchievements.filter((achievement) => achievement.isUnlocked),
    [filteredAchievements],
  );

  const baseFeedPosts = activeFeed === "posts" ? posts : likedPosts;
  const filteredPosts = useMemo(() => {
    if (!searchKeyword) return baseFeedPosts;
    return baseFeedPosts.filter((post) => {
      const repost = pickSingleRelation(post.repost_of);
      const haystack =
        `${post.content ?? ""} ${repost?.content ?? ""}`.toLowerCase();
      return haystack.includes(searchKeyword);
    });
  }, [baseFeedPosts, searchKeyword]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_0%,rgba(31,41,55,0.14),transparent_36%),radial-gradient(circle_at_90%_100%,rgba(15,23,42,0.14),transparent_42%)]" />

      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" />
                タイムライン
              </Link>
            </Button>
            <h1 className="text-lg font-semibold">ユーザー</h1>
          </div>

          <div className="flex items-center gap-2">
            {user ? <NotificationBell userId={user.id} /> : null}
            <ModeToggle />
            {user ? (
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                <LogOut className="size-4" />
                ログアウト
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href="/login">ログイン</Link>
              </Button>
            )}
          </div>
        </header>

        {message ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {message}
          </p>
        ) : null}

        {isLoading ? (
          <div className="rounded-2xl border border-border/80 bg-card/80 p-5">
            <Skeleton className="mb-2 h-5 w-48" />
            <Skeleton className="mb-2 h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : !profile ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            ユーザーは見つかりませんでした。
          </div>
        ) : (
          <>
            <section className="rounded-2xl border border-border/80 bg-card/90 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-12 place-items-center rounded-full border border-border bg-muted/40 text-lg font-semibold">
                    {profile.display_name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-base font-semibold">
                      {profile.display_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      @{profile.username}
                    </p>
                  </div>
                </div>

                {!isOwnProfile && user ? (
                  <div className="flex items-center gap-2">
                    <Button
                      variant={isFollowing ? "outline" : "default"}
                      size="sm"
                      onClick={handleToggleFollow}
                      disabled={isFollowPending || isBlocked}
                    >
                      {isFollowing ? (
                        <UserRoundCheck className="size-4" />
                      ) : (
                        <UserPlus className="size-4" />
                      )}
                      {isFollowPending
                        ? "..."
                        : isFollowing
                          ? "フォロー中"
                          : "フォローする"}
                    </Button>
                    <Button
                      variant={isBlocked ? "destructive" : "outline"}
                      size="sm"
                      onClick={handleToggleBlock}
                      disabled={isBlockPending}
                    >
                      <Ban className="size-4" />
                      {isBlocked ? "ブロック解除" : "ブロック"}
                    </Button>
                  </div>
                ) : null}
              </div>

              <TwemojiText
                text={profile.bio || "まだ自己紹介がないみたい。"}
                className="text-sm text-muted-foreground"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {joinedDate}に参加
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <FollowDialog
                  title="フォロワー"
                  description={`${profile.display_name}をフォローしているユーザー`}
                  list={
                    <FollowersList
                      users={followers}
                      emptyText={isFollowListLoading ? "読み込み中..." : "フォロワーはまだいません。"}
                    />
                  }
                >
                  <Button variant="outline" className="justify-between">
                    <span>フォロワー</span>
                    <span className="font-semibold">{followers.length}</span>
                  </Button>
                </FollowDialog>

                <FollowDialog
                  title="フォロー中"
                  description={`${profile.display_name}がフォローしているユーザー`}
                  list={
                    <FollowersList
                      users={followingUsers}
                      emptyText={isFollowListLoading ? "読み込み中..." : "まだ誰もフォローしていません。"}
                    />
                  }
                >
                  <Button variant="outline" className="justify-between">
                    <span>フォロー中</span>
                    <span className="font-semibold">{followingUsers.length}</span>
                  </Button>
                </FollowDialog>
              </div>
            </section>

            <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
              <h2 className="mb-3 text-sm font-medium">実績・投稿を検索</h2>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="キーワードで検索"
              />
              {searchKeyword ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  実績 {unlockedAchievements.length} 件 / 投稿{" "}
                  {filteredPosts.length} 件
                </p>
              ) : null}
            </section>

            <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
              <h2 className="mb-3 text-sm font-medium">実績</h2>
              {unlockedAchievements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {searchKeyword
                    ? "検索条件に一致する実績はありません。"
                    : "実績はまだありません。"}
                </div>
              ) : (
                <div className="space-y-2">
                  {unlockedAchievements.map((achievement) => (
                    <div
                      key={achievement.id}
                      className="rounded-xl border border-border/70 bg-muted/30 p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">
                          {achievement.emoji} {achievement.name}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {achievement.rarity === "diamond"
                            ? "ダイヤ"
                            : achievement.rarity === "gold"
                              ? "ゴールド"
                              : achievement.rarity === "silver"
                                ? "シルバー"
                                : "ブロンズ"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {achievement.description}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {isOwnProfile ? (
              <>
                <Dialog
                  open={isEditProfileOpen}
                  onOpenChange={(nextOpen) => {
                    setIsEditProfileOpen(nextOpen);
                    if (nextOpen) {
                      setEditDisplayName(displayName);
                      setEditBio(bio);
                      setEditLikesVisibility((profile.likes_visibility as "public" | "private") ?? "public");
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">Edit profile</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handleSaveProfile} className="space-y-4">
                      <DialogHeader>
                        <DialogTitle>プロフィールを編集</DialogTitle>
                        <DialogDescription>
                          Update your display name and bio. Changes are saved in
                          Supabase.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-1">
                        <p className="text-sm font-medium">Display name</p>
                        <Input
                          value={editDisplayName}
                          onChange={(event) =>
                            setEditDisplayName(event.target.value)
                          }
                          maxLength={50}
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <p className="text-sm font-medium">Bio</p>
                        <Textarea
                          value={editBio}
                          onChange={(event) => setEditBio(event.target.value)}
                          maxLength={280}
                          placeholder="Tell people who you are..."
                        />
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium">いいね表示設定</p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={editLikesVisibility === "public" ? "default" : "outline"}
                            onClick={() => setEditLikesVisibility("public")}
                          >
                            誰でも見れる
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={editLikesVisibility === "private" ? "default" : "outline"}
                            onClick={() => setEditLikesVisibility("private")}
                          >
                            自分のみ
                          </Button>
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEditProfileOpen(false)}
                        >
                          キャンセル
                        </Button>
                        <Button type="submit" disabled={isSavingProfile}>
                          {isSavingProfile ? "保存中..." : "変更を保存"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <section className="rounded-2xl border border-border/80 bg-card/90 p-4">
                  <h2 className="mb-3 text-sm font-medium">Create post</h2>

                  {quoteTarget ? (
                    <div className="mb-3 rounded-xl border border-border/80 bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        Quoting @{quoteTarget.profiles?.username ?? "unknown"} /
                        <Link
                          href={`/post/${quoteTarget.id}`}
                          className="underline underline-offset-2"
                        >
                          /post/{quoteTarget.id}
                        </Link>
                      </p>
                      <div className="mt-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setQuoteTarget(null)}
                        >
                          引用をキャンセル
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {replyTarget ? (
                    <div className="mb-3 rounded-xl border border-border/80 bg-muted/40 p-3">
                      <p className="text-xs text-muted-foreground">
                        @{replyTarget.profiles?.username ?? "unknown"} への返信 /
                        <Link
                          href={`/post/${replyTarget.id}`}
                          className="underline underline-offset-2"
                        >
                          /post/{replyTarget.id}
                        </Link>
                      </p>
                      <div className="mt-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setReplyTarget(null)}
                        >
                          返信をキャンセル
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  <textarea
                    value={composerText}
                    onChange={(event) => setComposerText(event.target.value)}
                    maxLength={500}
                    placeholder={
                      quoteTarget ? "引用を書く" : replyTarget ? "返信を書く" : "今何してる？"
                    }
                    className="min-h-24 w-full resize-none rounded-xl border border-border/80 bg-background/80 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleCreatePost}
                      disabled={
                        !user ||
                        isPosting ||
                        (!quoteTarget && !replyTarget && composerText.trim().length === 0)
                      }
                    >
                      <Send className="size-4" />
                      {isPosting
                        ? "投稿中..."
                        : quoteTarget
                          ? "引用投稿"
                          : replyTarget
                            ? "返信"
                            : "投稿"}
                    </Button>
                  </div>
                </section>
              </>
            ) : null}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activeFeed === "posts" ? "default" : "outline"}
                onClick={() => setActiveFeed("posts")}
              >
                投稿
              </Button>
              <Button
                size="sm"
                variant={activeFeed === "likes" ? "default" : "outline"}
                onClick={() => setActiveFeed("likes")}
                disabled={!isOwnProfile && profile.likes_visibility !== "public"}
              >
                いいねした投稿
              </Button>
            </div>

            <section className="space-y-3">
              {filteredPosts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {!isOwnProfile && activeFeed === "likes" && profile.likes_visibility !== "public"
                    ? "このユーザーのいいねは非公開です。"
                    : searchKeyword
                      ? "検索条件に一致する投稿はありません。"
                      : activeFeed === "likes"
                        ? "いいねした投稿はまだありません。"
                        : "No posts yet."}
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {filteredPosts.map((post, index) => (
                    <motion.div
                      key={post.id}
                      layout
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -12 }}
                      transition={{
                        duration: 0.24,
                        delay: Math.min(index * 0.02, 0.1),
                      }}
                    >
                      <PostCard
                        post={post}
                        currentUserId={user?.id ?? null}
                        onToggleLike={handleToggleLike}
                        onStartReply={(target) => {
                          if (!isOwnProfile) {
                            setMessage("プロフィールからの返信は本人ページのみ許可しています。");
                            return;
                          }
                          setReplyTarget(target);
                          setQuoteTarget(null);
                        }}
                        onToggleRepost={handleToggleRepost}
                        onStartQuote={(target) => {
                          if (!isOwnProfile) {
                            setMessage(
                              "Use timeline page to quote from this profile.",
                            );
                            return;
                          }
                          setQuoteTarget(target);
                          setReplyTarget(null);
                        }}
                        onToggleReaction={handleToggleReaction}
                        onDeletePost={handleDeletePost}
                        onReportPost={handleReportPost}
                        pendingLikePostId={pendingLikePostId}
                        pendingRepostPostId={pendingRepostPostId}
                        pendingReactionKey={pendingReactionKey}
                        repostCount={repostCountMap.get(post.id) ?? 0}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default function UserPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background p-6 text-sm text-muted-foreground">
          ユーザー情報を読み込み中...
        </div>
      }
    >
      <UserPageContent />
    </Suspense>
  );
}
