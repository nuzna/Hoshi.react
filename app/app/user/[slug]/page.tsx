"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  type FormEvent,
  type ChangeEvent,
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
  ImagePlus,
  LogOut,
  Send,
  UserPlus,
  UserRoundCheck,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import { AdminNavButton } from "@/components/admin-nav-button";
import { AnnouncementDialog } from "@/components/announcement-dialog";
import { ModeToggle } from "@/components/mode-toggle";
import { ApexWidget } from "@/components/apex-widget";
import { AppMessageBanner, createErrorMessage, createSuccessMessage, type AppMessage } from "@/components/app-message";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { MobileUserMenu } from "@/components/mobile-user-menu";
import { NotificationBell } from "@/components/notification-bell";
import { PostCard } from "@/components/post-card";
import { ProfileDisplayName } from "@/components/profile-display-name";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TwemojiText } from "@/components/twemoji-text";
import {
  fetchAchievementStats,
  persistUnlockedAchievements,
  resolveAchievements,
  type ResolvedAchievement,
} from "@/lib/achievements";
import { fetchPublicAdminUserIds } from "@/lib/admin-users";
import {
  DISPLAY_FONT_OPTIONS,
  getDisplayFontLabel,
  normalizeDisplayFontValue,
  type DisplayFontValue,
} from "@/lib/display-fonts";
import { deletePostWithMedia } from "@/lib/post-delete";
import { hydratePostsRelations, pickSingleRelation, POST_SELECT_QUERY, type TimelinePost } from "@/lib/post-types";
import {
  preparePostImageSelection,
  revokePendingPostImages,
  type PendingPostImage,
} from "@/lib/post-image";
import { uploadPostImagesToB2 } from "@/lib/post-upload";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { FollowDialog } from "@/components/follow-dialog";
import { FollowersList, type FollowUser } from "@/components/followers-list";
import { prepareAvatarUpload } from "@/lib/avatar-image";

type ProfileDetail = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  "id" | "username" | "display_name" | "bio" | "avatar_url" | "created_at" | "likes_visibility" | "username_changed_at" | "display_font"
>;

const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function formatUsernameResetAt(dateString: string | null) {
  if (!dateString) return "今すぐ変更できます。";

  const nextAt = new Date(new Date(dateString).getTime() + 24 * 60 * 60 * 1000);
  const remainingMs = nextAt.getTime() - Date.now();

  if (remainingMs <= 0) return "今すぐ変更できます。";

  return `次の変更は ${nextAt.toLocaleString("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })} 以降です。`;
}

function UserPageContent() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug ?? "";

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [adminUserIds, setAdminUserIds] = useState<Set<string>>(new Set());
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
  const [editUsername, setEditUsername] = useState("");
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editDisplayFont, setEditDisplayFont] = useState<DisplayFontValue>("geist");
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [editLikesVisibility, setEditLikesVisibility] = useState<"public" | "private">("public");
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileFrozenUntil, setProfileFrozenUntil] = useState<string | null>(null);
  const [apexProfile, setApexProfile] = useState<Database["public"]["Tables"]["apex_profile_cache"]["Row"] | null>(null);

  const [composerText, setComposerText] = useState("");
  const [composerImages, setComposerImages] = useState<PendingPostImage[]>([]);
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
  const [message, setMessage] = useState<AppMessage | null>(null);

  const visiblePostIdsRef = useRef<Set<string>>(new Set());
  const composerFileInputRef = useRef<HTMLInputElement | null>(null);
  const isOwnProfile = profile !== null && user?.id === profile.id;

  const fetchProfileAndPosts = useCallback(
    async (withLoading: boolean, viewerUserId?: string | null) => {
      if (!slug) return;
      if (withLoading) setIsLoading(true);

      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, bio, avatar_url, created_at, likes_visibility, username_changed_at, display_font")
        .eq("username", slug)
        .maybeSingle();

      if (error) {
        setMessage(createErrorMessage(error));
        setProfile(null);
        setApexProfile(null);
        setPosts([]);
        setLikedPosts([]);
        setAchievements([]);
        setIsLoading(false);
        return;
      }

      if (!data) {
        setProfile(null);
        setApexProfile(null);
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
        setEditUsername(typedProfile.username);
        setEditDisplayName(typedProfile.display_name);
        setEditBio(typedProfile.bio);
        setEditDisplayFont(normalizeDisplayFontValue(typedProfile.display_font));
        setEditAvatarFile(null);
        setEditAvatarPreview(typedProfile.avatar_url);
        setEditLikesVisibility((typedProfile.likes_visibility as "public" | "private") ?? "public");
      }

      const { data: moderationStatus, error: moderationError } = await supabase.rpc(
        "get_public_user_moderation_status",
        { p_user_id: typedProfile.id },
      );

      if (moderationError) {
        setProfileFrozenUntil(null);
      } else {
        setProfileFrozenUntil(moderationStatus?.[0]?.frozen_until ?? null);
      }

      const { data: apexProfileData } = await supabase
        .from("apex_profile_cache")
        .select("*")
        .eq("user_id", typedProfile.id)
        .maybeSingle();
      setApexProfile((apexProfileData ?? null) as Database["public"]["Tables"]["apex_profile_cache"]["Row"] | null);

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(POST_SELECT_QUERY)
        .eq("user_id", typedProfile.id)
        .order("created_at", { ascending: false })
        .limit(120);

      if (postsError) {
        setMessage(createErrorMessage(postsError));
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
          setMessage(createErrorMessage(achievementError));
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
        setMessage(createErrorMessage(repostError));
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
      setMessage(createErrorMessage(error));
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
      setMessage(createErrorMessage(error));
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
      setMessage(createErrorMessage(followersResult.error?.message ?? followingResult.error?.message ?? "Follow list load failed."));
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
      void fetchPublicAdminUserIds(supabase)
        .then((ids) => setAdminUserIds(ids))
        .catch((error) => setMessage(createErrorMessage(error)));
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
        { event: "*", schema: "public", table: "post_images" },
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
        {
          event: "*",
          schema: "public",
          table: "apex_profile_cache",
          filter: `user_id=eq.${profileId}`,
        },
        () => void fetchProfileAndPosts(false, user?.id ?? null),
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

  useEffect(() => {
    return () => {
      revokePendingPostImages(composerImages);
    };
  }, [composerImages]);

  const requireLogin = () => {
    router.push("/login");
  };

  const handleToggleFollow = async () => {
    if (!user || !profile || user.id === profile.id) return;
    if (isBlocked) {
      setMessage(createErrorMessage("ブロック中のユーザーはフォローできません"));
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
        setMessage(createErrorMessage(error));
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
      setMessage(createErrorMessage(error));
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
        setMessage(createErrorMessage(error));
        return;
      }
      setIsBlocked(false);
      setMessage(null);
      return;
    }

    const { error } = await supabase.from("blocks").insert({
      blocker_id: user.id,
      blocked_id: profile.id,
    });
    setIsBlockPending(false);

    if (error) {
      setMessage(createErrorMessage(error));
      return;
    }

    // Safety cleanup: remove follow relation both ways when blocking.
    await supabase
      .from("follows")
      .delete()
      .or(`and(follower_id.eq.${user.id},following_id.eq.${profile.id}),and(follower_id.eq.${profile.id},following_id.eq.${user.id})`);

    setIsBlocked(true);
    setIsFollowing(false);
    setMessage(createSuccessMessage("ブロックしました。"));
  };

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isOwnProfile || !profile) return;

    const nextUsername = editUsername.trim().toLowerCase();
    const nextDisplayName = editDisplayName.trim();
    const nextBio = editBio.trim();
    const nextDisplayFont = normalizeDisplayFontValue(editDisplayFont);
    if (!USERNAME_PATTERN.test(nextUsername)) {
      setMessage(createErrorMessage("ユーザー名は3〜20文字の英数字またはアンダースコアで入力してください。"));
      return;
    }
    if (!nextDisplayName) {
      setMessage(createErrorMessage("表示名を入力してください。"));
      return;
    }

    setIsSavingProfile(true);
    setMessage(null);

    const supabase = getSupabaseBrowserClient();
    let nextAvatarUrl = profile.avatar_url;

    if (editAvatarFile) {
      const avatarPath = `${profile.id}/avatar.webp`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(avatarPath, editAvatarFile, {
        contentType: "image/webp",
        cacheControl: "3600",
        upsert: true,
      });

      if (uploadError) {
        setIsSavingProfile(false);
        setMessage(createErrorMessage(uploadError));
        return;
      }

      const { data: avatarData } = supabase.storage.from("avatars").getPublicUrl(avatarPath);
      nextAvatarUrl = `${avatarData.publicUrl}?v=${Date.now()}`;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        username: nextUsername,
        display_name: nextDisplayName,
        bio: nextBio,
        display_font: nextDisplayFont,
        avatar_url: nextAvatarUrl,
        likes_visibility: editLikesVisibility,
      })
      .eq("id", profile.id);

    setIsSavingProfile(false);
    if (error) {
      if (error.message.includes("username can only be changed once every 24 hours")) {
        setMessage(createErrorMessage("ユーザー名は24時間に1回だけ変更できます。"));
      } else {
        setMessage(createErrorMessage(error));
      }
      return;
    }

    setDisplayName(nextDisplayName);
    setBio(nextBio);
    setEditAvatarFile(null);
    const updatedProfile = {
      ...profile,
      username: nextUsername,
      display_name: nextDisplayName,
      bio: nextBio,
      display_font: nextDisplayFont,
      avatar_url: nextAvatarUrl,
      likes_visibility: editLikesVisibility,
      username_changed_at: nextUsername !== profile.username ? new Date().toISOString() : profile.username_changed_at,
    };
    setProfile(updatedProfile);
    setIsEditProfileOpen(false);
    setMessage(createSuccessMessage("プロフィールを更新しました。"));
    if (nextUsername !== profile.username) {
      router.replace(`/user/${nextUsername}`);
      return;
    }
    void fetchProfileAndPosts(false, user?.id ?? null);
  };

  const handleAvatarSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    try {
      const convertedFile = await prepareAvatarUpload(selectedFile);
      const previewUrl = URL.createObjectURL(convertedFile);
      setEditAvatarFile(convertedFile);
      setEditAvatarPreview(previewUrl);
      setMessage(null);
    } catch (error) {
      setMessage(createErrorMessage(error, "画像の処理に失敗しました。"));
      event.target.value = "";
    }
  };

  const resetComposerMedia = () => {
    revokePendingPostImages(composerImages);
    setComposerImages([]);
    if (composerFileInputRef.current) {
      composerFileInputRef.current.value = "";
    }
  };

  const handleComposerImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles?.length) return;

    try {
      const prepared = await preparePostImageSelection(selectedFiles, composerImages.length);
      setComposerImages((current) => [...current, ...prepared]);
      setMessage(null);
    } catch (error) {
      setMessage(createErrorMessage(error, "画像の準備に失敗しました。"));
    } finally {
      event.target.value = "";
    }
  };

  const handleRemoveComposerImage = (index: number) => {
    setComposerImages((current) => {
      const target = current[index];
      if (target) {
        revokePendingPostImages([target]);
      }
      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  };

  const handleCreatePost = async () => {
    if (!user || !isOwnProfile) return;

    const content = composerText.trim();
    const hasImages = composerImages.length > 0;
    if (!quoteTarget && !replyTarget && !content && !hasImages) return;
    if ((quoteTarget || replyTarget) && !content && !hasImages) {
      setMessage(createErrorMessage("引用や返信には本文または画像が必要です。"));
      return;
    }

    setIsPosting(true);
    setMessage(null);

    const payload = quoteTarget
      ? { user_id: user.id, content: content || null, repost_of_id: quoteTarget.id, has_media: hasImages }
      : replyTarget
        ? { user_id: user.id, content: content || null, reply_to_id: replyTarget.id, has_media: hasImages }
        : { user_id: user.id, content: content || null, has_media: hasImages };

    const supabase = getSupabaseBrowserClient();
    const { data: createdPost, error } = await supabase.from("posts").insert(payload).select("id").single();

    if (error) {
      setIsPosting(false);
      setMessage(createErrorMessage(error));
      return;
    }

    if (createdPost && hasImages) {
      try {
        const uploadedImages = await uploadPostImagesToB2(composerImages);
        const { error: imageInsertError } = await supabase.from("post_images").insert(
          uploadedImages.map((image) => ({
            post_id: createdPost.id,
            url: image.url,
            storage_key: image.fileName,
            mime_type: image.mimeType,
            size_bytes: image.sizeBytes,
            width: image.width,
            height: image.height,
            sort_order: image.sortOrder,
          })),
        );

        if (imageInsertError) {
          await supabase.from("posts").delete().eq("id", createdPost.id).eq("user_id", user.id);
          setIsPosting(false);
          setMessage(createErrorMessage(imageInsertError));
          return;
        }
      } catch (uploadError) {
        await supabase.from("posts").delete().eq("id", createdPost.id).eq("user_id", user.id);
        setIsPosting(false);
        setMessage(createErrorMessage(uploadError, "画像アップロードに失敗しました。"));
        return;
      }
    }

    setIsPosting(false);
    setComposerText("");
    setQuoteTarget(null);
    setReplyTarget(null);
    resetComposerMedia();
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
    if (error) setMessage(createErrorMessage(error));
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
      setMessage(createErrorMessage(findError));
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
    if (error) setMessage(createErrorMessage(error));
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
    if (error) setMessage(createErrorMessage(error));
  };

  const handleDeletePost = async (post: TimelinePost) => {
    if (!user || post.user_id !== user.id) return;
    try {
      await deletePostWithMedia(post.id);
    } catch (error) {
      setMessage(createErrorMessage(error, "投稿削除に失敗しました。"));
    }
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
      setMessage(createErrorMessage(error));
      return;
    }
    setMessage(createSuccessMessage("通報しました"));
  };

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) setMessage(createErrorMessage(error));
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

      <main className="mx-auto flex w-full max-w-[680px] flex-col gap-4 px-5 pb-24 pt-4 sm:px-6">
        <header className="sticky top-0 z-30 -mx-5 flex items-center justify-between border-b border-border/80 bg-background/90 px-5 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/">
                <ArrowLeft className="size-4" />
                タイムライン
              </Link>
            </Button>
            <h1 className="text-lg font-semibold">{profile?.display_name} さんのプロフィール</h1>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            <AnnouncementDialog />
            <div className="hidden sm:block">{user ? <NotificationBell userId={user.id} /> : null}</div>
            {user ? (
              <>
                <div className="sm:hidden">
                  <MobileUserMenu profileUsername={profile?.username ?? null} onSignOut={handleSignOut} />
                </div>
                <div className="hidden items-center gap-1 sm:flex">
                  <ModeToggle />
                  <AdminNavButton userId={user.id} />
                  <Button variant="ghost" size="sm" onClick={handleSignOut}>
                    <LogOut className="size-4" />
                    <span>ログアウト</span>
                  </Button>
                </div>
              </>
            ) : (
              <>
                <ModeToggle />
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">ログイン</Link>
                </Button>
              </>
            )}
          </div>
        </header>

        <AppMessageBanner message={message} className="text-xs" />

        {isLoading ? (
          <div className="border-b border-border/80 px-3 py-5">
            <Skeleton className="mb-2 h-5 w-48" />
            <Skeleton className="mb-2 h-4 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : !profile ? (
          <div className="border-b border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            ユーザーは見つかりませんでした。
          </div>
        ) : (
          <>
            {!isOwnProfile && profileFrozenUntil ? (
              <section className="border-b border-border/80 bg-amber-500/8 px-3 py-3">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                  このユーザーは凍結されています。
                </div>
              </section>
            ) : null}

            <section className="border-b border-border/80 px-3 py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={`${profile.display_name}のアイコン`}
                      width={48}
                      height={48}
                      className="size-12 rounded-full border border-border/70 object-cover"
                    />
                  ) : (
                    <div className="grid size-12 place-items-center rounded-full border border-border bg-muted/40 text-lg font-semibold">
                      {profile.display_name.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-base">
                      <ProfileDisplayName
                        name={profile.display_name}
                        font={profile.display_font}
                        isAdmin={adminUserIds.has(profile.id)}
                        textClassName="font-semibold"
                      />
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
                text={profile.bio || "まだ自己紹介はありません。"}
                className="text-sm text-muted-foreground"
              />
              {apexProfile ? (
                <div className="mt-4">
                  <ApexWidget profile={apexProfile} />
                </div>
              ) : null}
              <p className="mt-3 text-xs text-muted-foreground">
                {joinedDate} に参加
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <FollowDialog
                  title="フォロワー"
                  description={`${profile.display_name}をフォローしているユーザー`}
                  list={
                    <FollowersList
                      users={followers}
                      emptyText={isFollowListLoading ? "読み込み中..." : "フォロワーはいません。"}
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

            <section className="border-b border-border/80 px-3 py-4">
              <h2 className="mb-3 text-sm font-medium">実績・投稿を検索</h2>
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="キーワードで検索"
              />
              {searchKeyword ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  実績 {unlockedAchievements.length} 件 / 投稿 {filteredPosts.length} 件
                </p>
              ) : null}
            </section>

            <section className="border-b border-border/80 px-3 py-4">
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
                    <div key={achievement.id} className="border-b border-border/70 py-3 last:border-b-0">
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
                      setEditUsername(profile.username);
                      setEditDisplayName(displayName);
                      setEditBio(bio);
                      setEditDisplayFont(normalizeDisplayFontValue(profile.display_font));
                      setEditAvatarFile(null);
                      setEditAvatarPreview(profile.avatar_url);
                      setEditLikesVisibility((profile.likes_visibility as "public" | "private") ?? "public");
                    }
                  }}
                >
                  <div className="mb-3 flex flex-wrap gap-2">
                    <DialogTrigger asChild>
                      <Button variant="outline">プロフィール編集</Button>
                    </DialogTrigger>
                    <Button asChild variant="ghost">
                      <Link href="/connections">接続</Link>
                    </Button>
                  </div>
                  <DialogContent className="flex max-h-[min(88dvh,44rem)] flex-col overflow-hidden">
                    <form onSubmit={handleSaveProfile} className="flex min-h-0 flex-1 flex-col gap-4">
                      <DialogHeader className="shrink-0">
                        <DialogTitle>プロフィールを編集</DialogTitle>
                        <DialogDescription>
                          ユーザー名、表示名、自己紹介、アイコンを更新できます。変更は Supabase に保存されます。
                        </DialogDescription>
                      </DialogHeader>

                      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">ユーザー名</p>
                          <Input
                            value={editUsername}
                            onChange={(event) =>
                              setEditUsername(event.target.value.replace(/\s+/g, ""))
                            }
                            maxLength={20}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            英数字とアンダースコアのみ使用できます。{formatUsernameResetAt(profile.username_changed_at)}
                          </p>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium">アイコン</p>
                          <div className="flex items-center gap-3">
                            {editAvatarPreview ? (
                              <Image
                                src={editAvatarPreview}
                                alt="アイコンのプレビュー"
                                width={56}
                                height={56}
                                className="size-14 rounded-full border border-border/70 object-cover"
                              />
                            ) : (
                              <div className="grid size-14 place-items-center rounded-full border border-border/70 bg-muted/40 text-lg font-semibold">
                                {profile.display_name.slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <div className="flex-1">
                              <Input
                                type="file"
                                accept="image/png,image/jpeg,image/heic,image/heif,.heic,.heif"
                                onChange={handleAvatarSelect}
                                className="cursor-pointer"
                              />
                              <p className="mt-1 text-xs text-muted-foreground">
                                PNG / JPG / HEIC / HEIF に対応。アップロード前に WebP へ変換し、80KB 以下に圧縮します。
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium">表示名</p>
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
                          <p className="text-sm font-medium">表示名フォント</p>
                          <Select
                            value={editDisplayFont}
                            onValueChange={(value) => setEditDisplayFont(value as DisplayFontValue)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="フォントを選択" />
                            </SelectTrigger>
                            <SelectContent>
                              {DISPLAY_FONT_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground">
                            現在の設定: {getDisplayFontLabel(editDisplayFont)}
                          </p>
                          <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2 text-sm">
                            <ProfileDisplayName
                              name={editDisplayName || "表示名プレビュー"}
                              font={editDisplayFont}
                              isAdmin={adminUserIds.has(profile.id)}
                              textClassName="font-medium"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <p className="text-sm font-medium">自己紹介</p>
                          <Textarea
                            value={editBio}
                            onChange={(event) => setEditBio(event.target.value)}
                            maxLength={280}
                            placeholder="自己紹介を書く"
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
                              公開
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
                      </div>

                      <DialogFooter className="shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEditProfileOpen(false)}
                        >
                          キャンセル
                        </Button>
                        <Button type="submit" disabled={isSavingProfile}>
                          {isSavingProfile ? "保存中..." : "保存する"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>

                <section className="border-b border-border/80 px-3 py-4">
                  <h2 className="mb-3 text-sm font-medium">投稿</h2>

                  {quoteTarget ? (
                    <div className="mb-2 rounded-2xl border border-border/80 bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        引用中 @{quoteTarget.profiles?.username ?? "unknown"} /
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
                          variant="ghost"
                          onClick={() => setQuoteTarget(null)}
                        >
                          引用をキャンセル
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {replyTarget ? (
                    <div className="mb-2 rounded-2xl border border-border/80 bg-muted/30 px-3 py-2">
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
                          variant="ghost"
                          onClick={() => setReplyTarget(null)}
                        >
                          返信をキャンセル
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {composerImages.length > 0 ? (
                    <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
                      {composerImages.map((image, index) => (
                        <div key={`${image.file.name}-${index}`} className="relative shrink-0">
                          <img
                            src={image.previewUrl}
                            alt="投稿画像のプレビュー"
                            className="size-16 rounded-2xl border border-border/80 object-cover"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            size="icon-xs"
                            className="absolute -right-1 -top-1 rounded-full"
                            onClick={() => handleRemoveComposerImage(index)}
                            aria-label="画像を削除"
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <input
                      ref={composerFileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      multiple
                      className="hidden"
                      onChange={handleComposerImageSelect}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="shrink-0 rounded-full"
                      onClick={() => composerFileInputRef.current?.click()}
                      aria-label="画像を追加"
                    >
                      <ImagePlus className="size-4" />
                    </Button>
                    <Textarea
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      maxLength={500}
                      placeholder={quoteTarget ? "引用を書く" : replyTarget ? "返信を書く" : "いま何してる？"}
                      className="min-h-0 rounded-3xl border-border/80 bg-muted/35 px-3 py-2 shadow-none focus-visible:ring-0"
                    />
                    <Button
                      size="icon-lg"
                      onClick={handleCreatePost}
                      className="rounded-full"
                      disabled={
                        !user ||
                        isPosting ||
                        (!quoteTarget && !replyTarget && composerText.trim().length === 0 && composerImages.length === 0)
                      }
                    >
                      <Send className="size-4" />
                      <span className="sr-only">{isPosting ? "投稿中" : "投稿"}</span>
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
                        : "まだ投稿はありません。"}
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
                            setMessage(createErrorMessage("プロフィールからの返信は本人ページでのみ行えます。"));
                            return;
                          }
                          setReplyTarget(target);
                          setQuoteTarget(null);
                        }}
                        onToggleRepost={handleToggleRepost}
                        onStartQuote={(target) => {
                          if (!isOwnProfile) {
                            setMessage(createErrorMessage("プロフィールからの引用は本人ページでのみ行えます。"));
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
                          adminUserIds={adminUserIds}
                        />
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </section>
          </>
        )}
      </main>
      <MobileBottomNav userId={user?.id ?? null} profileUsername={isOwnProfile ? profile?.username ?? null : null} />
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



