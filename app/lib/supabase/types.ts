export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_action_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
          moderator_id: string
          reason: string
          report_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
          moderator_id: string
          reason?: string
          report_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
          moderator_id?: string
          reason?: string
          report_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_action_logs_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_logs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "post_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_action_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          note: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          note?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          content_md: string
          created_at: string
          created_by: string | null
          id: string
          published_at: string
          title: string
          updated_at: string
        }
        Insert: {
          content_md: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          content_md?: string
          created_at?: string
          created_by?: string | null
          id?: string
          published_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deleted_post_history: {
        Row: {
          content: string | null
          deleted_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          content?: string | null
          deleted_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          content?: string | null
          deleted_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deleted_post_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_history: {
        Row: {
          action: "follow" | "unfollow"
          created_at: string
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          action: "follow" | "unfollow"
          created_at?: string
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          action?: "follow" | "unfollow"
          created_at?: string
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_history_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_history_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          is_read: boolean
          post_id: string | null
          reaction_emoji: string | null
          recipient_id: string
          type: "follow" | "like" | "reaction" | "reply"
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          reaction_emoji?: string | null
          recipient_id: string
          type: "follow" | "like" | "reaction" | "reply"
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          reaction_emoji?: string | null
          recipient_id?: string
          type?: "follow" | "like" | "reaction" | "reply"
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          emoji: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string
          id: string
          post_id: string
          reason: string
          reason_category: string
          resolution_note: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          reason?: string
          reason_category?: string
          resolution_note?: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          reason?: string
          reason_category?: string
          resolution_note?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_achievements: {
        Row: {
          achievement_id: string | null
          created_at: string
          description: string
          emoji: string | null
          id: string
          rarity: string
          title: string
          user_id: string
        }
        Insert: {
          achievement_id?: string | null
          created_at?: string
          description?: string
          emoji?: string | null
          id?: string
          rarity?: string
          title: string
          user_id: string
        }
        Update: {
          achievement_id?: string | null
          created_at?: string
          description?: string
          emoji?: string | null
          id?: string
          rarity?: string
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          content: string | null
          created_at: string
          has_media: boolean
          id: string
          reply_to_id: string | null
          repost_of_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          has_media?: boolean
          id?: string
          reply_to_id?: string | null
          repost_of_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          has_media?: boolean
          id?: string
          reply_to_id?: string | null
          repost_of_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_repost_of_id_fkey"
            columns: ["repost_of_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_hashtags: {
        Row: {
          created_at: string
          post_id: string
          tag: string
        }
        Insert: {
          created_at?: string
          post_id: string
          tag: string
        }
        Update: {
          created_at?: string
          post_id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_hashtags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_images: {
        Row: {
          created_at: string
          height: number | null
          id: string
          mime_type: string
          post_id: string
          size_bytes: number
          sort_order: number
          storage_key: string
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          height?: number | null
          id?: string
          mime_type: string
          post_id: string
          size_bytes: number
          sort_order?: number
          storage_key: string
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          height?: number | null
          id?: string
          mime_type?: string
          post_id?: string
          size_bytes?: number
          sort_order?: number
          storage_key?: string
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          display_font: string
          discord_avatar_url: string | null
          discord_id: string | null
          discord_username: string | null
          display_name: string
          id: string
          likes_visibility: string
          username_changed_at: string | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_font?: string
          discord_avatar_url?: string | null
          discord_id?: string | null
          discord_username?: string | null
          display_name: string
          id: string
          likes_visibility?: string
          username_changed_at?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_font?: string
          discord_avatar_url?: string | null
          discord_id?: string | null
          discord_username?: string | null
          display_name?: string
          id?: string
          likes_visibility?: string
          username_changed_at?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      spotify_connections: {
        Row: {
          access_token: string
          access_token_expires_at: string
          created_at: string
          refresh_token: string
          scopes: string
          spotify_avatar_url: string | null
          spotify_display_name: string | null
          spotify_user_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          access_token_expires_at: string
          created_at?: string
          refresh_token: string
          scopes?: string
          spotify_avatar_url?: string | null
          spotify_display_name?: string | null
          spotify_user_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string
          created_at?: string
          refresh_token?: string
          scopes?: string
          spotify_avatar_url?: string | null
          spotify_display_name?: string | null
          spotify_user_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spotify_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      spotify_presence_cache: {
        Row: {
          album_image_url: string | null
          album_name: string | null
          artist_name: string | null
          is_connected: boolean
          is_playing: boolean
          played_at: string | null
          spotify_avatar_url: string | null
          spotify_display_name: string | null
          track_name: string | null
          track_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          album_image_url?: string | null
          album_name?: string | null
          artist_name?: string | null
          is_connected?: boolean
          is_playing?: boolean
          played_at?: string | null
          spotify_avatar_url?: string | null
          spotify_display_name?: string | null
          track_name?: string | null
          track_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          album_image_url?: string | null
          album_name?: string | null
          artist_name?: string | null
          is_connected?: boolean
          is_playing?: boolean
          played_at?: string | null
          spotify_avatar_url?: string | null
          spotify_display_name?: string | null
          track_name?: string | null
          track_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spotify_presence_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_moderation: {
        Row: {
          frozen_until: string | null
          post_restricted_until: string | null
          reason: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          frozen_until?: string | null
          post_restricted_until?: string | null
          reason?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          frozen_until?: string | null
          post_restricted_until?: string | null
          reason?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_moderation_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_moderation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_apply_user_action: {
        Args: {
          p_action: string
          p_duration_hours?: number | null
          p_reason?: string
          p_report_id?: string | null
          p_target_user_id: string
        }
        Returns: boolean
      }
      admin_create_announcement: {
        Args: {
          p_content_md: string
          p_published_at?: string | null
          p_title: string
        }
        Returns: string
      }
      admin_dismiss_report: {
        Args: {
          p_note?: string
          p_report_id: string
        }
        Returns: boolean
      }
      admin_list_announcements: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          title: string
          content_md: string
          published_at: string
          created_at: string
          created_by: string | null
          created_by_username: string | null
          created_by_display_name: string | null
        }[]
      }
      admin_list_logs: {
        Args: {
          limit_count?: number
        }
        Returns: {
          id: string
          action: string
          reason: string
          details: Json
          created_at: string
          moderator_id: string
          moderator_username: string | null
          moderator_display_name: string | null
          target_user_id: string | null
          target_username: string | null
          target_display_name: string | null
          report_id: string | null
        }[]
      }
      admin_list_reports: {
        Args: Record<PropertyKey, never>
        Returns: {
          report_id: string
          status: string
          reported_at: string
          reason_category: string
          reason: string
          resolution_note: string
          reporter_id: string
          reporter_username: string | null
          reporter_display_name: string | null
          post_id: string
          post_content: string | null
          post_created_at: string
          reported_user_id: string
          reported_username: string | null
          reported_display_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_username: string | null
          reviewed_by_display_name: string | null
        }[]
      }
      admin_search_users: {
        Args: {
          search_query?: string | null
        }
        Returns: {
          user_id: string
          username: string
          display_name: string
          avatar_url: string | null
          bio: string
          is_admin: boolean
          post_restricted_until: string | null
          frozen_until: string | null
          moderation_reason: string | null
          moderation_updated_at: string | null
        }[]
      }
      get_public_user_moderation_status: {
        Args: {
          p_user_id: string
        }
        Returns: {
          frozen_until: string | null
          post_restricted_until: string | null
        }[]
      }
      is_current_user_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}


