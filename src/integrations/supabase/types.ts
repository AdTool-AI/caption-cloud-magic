export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ab_test_events: {
        Row: {
          event_type: string
          event_value: number | null
          id: string
          metadata: Json | null
          occurred_at: string | null
          test_id: string
          user_agent: string | null
          variant_id: string
          video_id: string | null
        }
        Insert: {
          event_type: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          test_id: string
          user_agent?: string | null
          variant_id: string
          video_id?: string | null
        }
        Update: {
          event_type?: string
          event_value?: number | null
          id?: string
          metadata?: Json | null
          occurred_at?: string | null
          test_id?: string
          user_agent?: string | null
          variant_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_events_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_insights: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          data: Json | null
          description: string | null
          id: string
          insight_type: string
          test_id: string
          title: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          insight_type: string
          test_id: string
          title: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          data?: Json | null
          description?: string | null
          id?: string
          insight_type?: string
          test_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_insights_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_test_variants: {
        Row: {
          avg_watch_time: number | null
          caption: string
          clicks: number | null
          color_config: Json | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string
          customizations: Json | null
          draft_id: string
          engagement: number | null
          engagement_count: number | null
          engagement_rate: number | null
          hashtag_set: string
          hook: string
          id: string
          impressions: number | null
          published_at: string | null
          scheduled_for: string | null
          test_id: string | null
          text_config: Json | null
          thumbnail_config: Json | null
          variant_name: string
          variant_type: string | null
          video_ids: string[] | null
          views: number | null
        }
        Insert: {
          avg_watch_time?: number | null
          caption: string
          clicks?: number | null
          color_config?: Json | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          customizations?: Json | null
          draft_id: string
          engagement?: number | null
          engagement_count?: number | null
          engagement_rate?: number | null
          hashtag_set: string
          hook: string
          id?: string
          impressions?: number | null
          published_at?: string | null
          scheduled_for?: string | null
          test_id?: string | null
          text_config?: Json | null
          thumbnail_config?: Json | null
          variant_name: string
          variant_type?: string | null
          video_ids?: string[] | null
          views?: number | null
        }
        Update: {
          avg_watch_time?: number | null
          caption?: string
          clicks?: number | null
          color_config?: Json | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          customizations?: Json | null
          draft_id?: string
          engagement?: number | null
          engagement_count?: number | null
          engagement_rate?: number | null
          hashtag_set?: string
          hook?: string
          id?: string
          impressions?: number | null
          published_at?: string | null
          scheduled_for?: string | null
          test_id?: string | null
          text_config?: Json | null
          thumbnail_config?: Json | null
          variant_name?: string
          variant_type?: string | null
          video_ids?: string[] | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_variants_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_test_variants_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_tests: {
        Row: {
          confidence_level: number | null
          created_at: string | null
          ended_at: string | null
          hypothesis: string | null
          id: string
          min_sample_size: number | null
          started_at: string | null
          status: string
          target_metric: string | null
          template_id: string | null
          test_name: string
          updated_at: string | null
          user_id: string
          winner_variant_id: string | null
          workspace_id: string | null
        }
        Insert: {
          confidence_level?: number | null
          created_at?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_size?: number | null
          started_at?: string | null
          status?: string
          target_metric?: string | null
          template_id?: string | null
          test_name: string
          updated_at?: string | null
          user_id: string
          winner_variant_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          confidence_level?: number | null
          created_at?: string | null
          ended_at?: string | null
          hypothesis?: string | null
          id?: string
          min_sample_size?: number | null
          started_at?: string | null
          status?: string
          target_metric?: string | null
          template_id?: string | null
          test_name?: string
          updated_at?: string | null
          user_id?: string
          winner_variant_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_tests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      active_ai_jobs: {
        Row: {
          id: string
          job_id: string
          job_type: string
          started_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          id?: string
          job_id: string
          job_type: string
          started_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          id?: string
          job_id?: string
          job_type?: string
          started_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      active_publishes: {
        Row: {
          created_at: string
          id: string
          job_id: string
          started_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          started_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          started_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ad_campaign_posts: {
        Row: {
          created_at: string
          external_post_id: string | null
          id: string
          last_metrics: Json | null
          last_synced_at: string | null
          master_project_id: string | null
          platform: string
          post_url: string | null
          posted_at: string | null
          project_id: string
          updated_at: string
          user_id: string
          variant_strategy: string | null
        }
        Insert: {
          created_at?: string
          external_post_id?: string | null
          id?: string
          last_metrics?: Json | null
          last_synced_at?: string | null
          master_project_id?: string | null
          platform: string
          post_url?: string | null
          posted_at?: string | null
          project_id: string
          updated_at?: string
          user_id: string
          variant_strategy?: string | null
        }
        Update: {
          created_at?: string
          external_post_id?: string | null
          id?: string
          last_metrics?: Json | null
          last_synced_at?: string | null
          master_project_id?: string | null
          platform?: string
          post_url?: string | null
          posted_at?: string | null
          project_id?: string
          updated_at?: string
          user_id?: string
          variant_strategy?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_posts_master_project_id_fkey"
            columns: ["master_project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_campaign_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      addons: {
        Row: {
          code: string
          created_at: string
          credits: number
          id: string
          name: string
          price_cents: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          credits: number
          id?: string
          name: string
          price_cents: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          id?: string
          name?: string
          price_cents?: number
          sort_order?: number
        }
        Relationships: []
      }
      affiliates: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          payout_type: string | null
          status: string | null
          stripe_account_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          payout_type?: string | null
          status?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          payout_type?: string | null
          status?: string | null
          stripe_account_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      agent_campaigns: {
        Row: {
          angle_rationale: string | null
          audience: string | null
          commercial_angle: string | null
          company_name: string
          conversation_id: string | null
          coverage_breakdown: Json | null
          coverage_explanation: string | null
          coverage_score: number | null
          created_at: string
          error: string | null
          goal: string
          id: string
          language: string
          lease_until: string | null
          location: string | null
          needs_user_review: boolean
          plan_revision_round: number
          requested_video_count: number
          research_summary: string | null
          review_reason: string | null
          social_research_complete: boolean
          stage: string
          updated_at: string
          user_id: string
          video_duration_s: number
          website: string | null
        }
        Insert: {
          angle_rationale?: string | null
          audience?: string | null
          commercial_angle?: string | null
          company_name: string
          conversation_id?: string | null
          coverage_breakdown?: Json | null
          coverage_explanation?: string | null
          coverage_score?: number | null
          created_at?: string
          error?: string | null
          goal: string
          id?: string
          language?: string
          lease_until?: string | null
          location?: string | null
          needs_user_review?: boolean
          plan_revision_round?: number
          requested_video_count?: number
          research_summary?: string | null
          review_reason?: string | null
          social_research_complete?: boolean
          stage?: string
          updated_at?: string
          user_id: string
          video_duration_s?: number
          website?: string | null
        }
        Update: {
          angle_rationale?: string | null
          audience?: string | null
          commercial_angle?: string | null
          company_name?: string
          conversation_id?: string | null
          coverage_breakdown?: Json | null
          coverage_explanation?: string | null
          coverage_score?: number | null
          created_at?: string
          error?: string | null
          goal?: string
          id?: string
          language?: string
          lease_until?: string | null
          location?: string | null
          needs_user_review?: boolean
          plan_revision_round?: number
          requested_video_count?: number
          research_summary?: string | null
          review_reason?: string | null
          social_research_complete?: boolean
          stage?: string
          updated_at?: string
          user_id?: string
          video_duration_s?: number
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_campaigns_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          created_at: string
          estimated_ai_cost_usd: number
          generation_ids: string[]
          id: string
          last_response_id: string | null
          model: string
          pending_response_id: string | null
          pending_tool_outputs: Json
          previous_response_id: string | null
          status: string
          title: string | null
          total_input_tokens: number
          total_output_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          estimated_ai_cost_usd?: number
          generation_ids?: string[]
          id?: string
          last_response_id?: string | null
          model: string
          pending_response_id?: string | null
          pending_tool_outputs?: Json
          previous_response_id?: string | null
          status?: string
          title?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          estimated_ai_cost_usd?: number
          generation_ids?: string[]
          id?: string
          last_response_id?: string | null
          model?: string
          pending_response_id?: string | null
          pending_tool_outputs?: Json
          previous_response_id?: string | null
          status?: string
          title?: string | null
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_generation_approvals: {
        Row: {
          approved_at: string | null
          consumed_at: string | null
          conversation_id: string
          cost: number
          created_at: string
          currency: string
          duration_seconds: number
          expires_at: string
          generation_ids: string[]
          id: string
          max_total_cost: number
          model: string
          pricing_id: string
          resolution: string
          retries_used: number
          retry_budget: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          consumed_at?: string | null
          conversation_id: string
          cost: number
          created_at?: string
          currency: string
          duration_seconds: number
          expires_at: string
          generation_ids?: string[]
          id?: string
          max_total_cost: number
          model: string
          pricing_id: string
          resolution: string
          retries_used?: number
          retry_budget?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          consumed_at?: string | null
          conversation_id?: string
          cost?: number
          created_at?: string
          currency?: string
          duration_seconds?: number
          expires_at?: string
          generation_ids?: string[]
          id?: string
          max_total_cost?: number
          model?: string
          pricing_id?: string
          resolution?: string
          retries_used?: number
          retry_budget?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_generation_approvals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          internal: boolean
          response_id: string | null
          resume_task_id: string | null
          role: string
          tool_calls: Json
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          internal?: boolean
          response_id?: string | null
          resume_task_id?: string | null
          role: string
          tool_calls?: Json
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          internal?: boolean
          response_id?: string | null
          resume_task_id?: string | null
          role?: string
          tool_calls?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_operations: {
        Row: {
          arguments: Json
          attempt: number
          conversation_id: string
          created_at: string
          error_message: string | null
          estimated_cost: number | null
          estimated_cost_currency: string | null
          generation_id: string | null
          id: string
          parent_generation_id: string | null
          result: Json | null
          status: string
          tool_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arguments?: Json
          attempt?: number
          conversation_id: string
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          estimated_cost_currency?: string | null
          generation_id?: string | null
          id?: string
          parent_generation_id?: string | null
          result?: Json | null
          status?: string
          tool_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arguments?: Json
          attempt?: number
          conversation_id?: string
          created_at?: string
          error_message?: string | null
          estimated_cost?: number | null
          estimated_cost_currency?: string | null
          generation_id?: string | null
          id?: string
          parent_generation_id?: string | null
          result?: Json | null
          status?: string
          tool_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_operations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_tasks: {
        Row: {
          approval_id: string | null
          claimed_at: string | null
          conversation_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          generation_id: string
          id: string
          intent: string | null
          language: string | null
          lease_until: string | null
          result: Json | null
          slow_since: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_id?: string | null
          claimed_at?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          generation_id: string
          id?: string
          intent?: string | null
          language?: string | null
          lease_until?: string | null
          result?: Json | null
          slow_since?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_id?: string | null
          claimed_at?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          finished_at?: string | null
          generation_id?: string
          id?: string
          intent?: string | null
          language?: string | null
          lease_until?: string | null
          result?: Json | null
          slow_since?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          input_data: Json
          job_type: string
          max_retries: number | null
          next_retry_at: string | null
          priority: number | null
          processing_started_at: string | null
          result_data: Json | null
          retry_count: number | null
          status: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data: Json
          job_type: string
          max_retries?: number | null
          next_retry_at?: string | null
          priority?: number | null
          processing_started_at?: string | null
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          input_data?: Json
          job_type?: string
          max_retries?: number | null
          next_retry_at?: string | null
          priority?: number | null
          processing_started_at?: string | null
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_posts: {
        Row: {
          brand_kit_id: string | null
          caption: string | null
          created_at: string
          cta_line: string | null
          description: string
          exports_json: Json
          has_watermark: boolean
          hashtags: Json
          headline: string | null
          id: string
          image_url: string
          language: string
          platforms: Json
          style: string
          tone: string
          updated_at: string
          user_id: string
          vision_json: Json
        }
        Insert: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string
          cta_line?: string | null
          description: string
          exports_json?: Json
          has_watermark?: boolean
          hashtags?: Json
          headline?: string | null
          id?: string
          image_url: string
          language?: string
          platforms?: Json
          style?: string
          tone?: string
          updated_at?: string
          user_id: string
          vision_json?: Json
        }
        Update: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string
          cta_line?: string | null
          description?: string
          exports_json?: Json
          has_watermark?: boolean
          hashtags?: Json
          headline?: string | null
          id?: string
          image_url?: string
          language?: string
          platforms?: Json
          style?: string
          tone?: string
          updated_at?: string
          user_id?: string
          vision_json?: Json
        }
        Relationships: []
      }
      ai_response_cache: {
        Row: {
          created_at: string
          endpoint: string
          expires_at: string
          hit_count: number
          id: string
          language: string | null
          last_hit_at: string | null
          model: string | null
          prompt_embedding: string | null
          prompt_hash: string
          prompt_text: string
          response_data: Json
        }
        Insert: {
          created_at?: string
          endpoint: string
          expires_at?: string
          hit_count?: number
          id?: string
          language?: string | null
          last_hit_at?: string | null
          model?: string | null
          prompt_embedding?: string | null
          prompt_hash: string
          prompt_text: string
          response_data: Json
        }
        Update: {
          created_at?: string
          endpoint?: string
          expires_at?: string
          hit_count?: number
          id?: string
          language?: string | null
          last_hit_at?: string | null
          model?: string | null
          prompt_embedding?: string | null
          prompt_hash?: string
          prompt_text?: string
          response_data?: Json
        }
        Relationships: []
      }
      ai_superuser_anomalies: {
        Row: {
          affected_scenarios: string[]
          ai_analysis: string | null
          auto_bug_report_id: string | null
          created_at: string
          detected_at: string
          id: string
          metric_data: Json | null
          pattern_description: string
          resolved_at: string | null
          severity: string
        }
        Insert: {
          affected_scenarios?: string[]
          ai_analysis?: string | null
          auto_bug_report_id?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          metric_data?: Json | null
          pattern_description: string
          resolved_at?: string | null
          severity: string
        }
        Update: {
          affected_scenarios?: string[]
          ai_analysis?: string | null
          auto_bug_report_id?: string | null
          created_at?: string
          detected_at?: string
          id?: string
          metric_data?: Json | null
          pattern_description?: string
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_superuser_anomalies_auto_bug_report_id_fkey"
            columns: ["auto_bug_report_id"]
            isOneToOne: false
            referencedRelation: "bug_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_superuser_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          credits_consumed: number | null
          credits_refunded: number | null
          error_message: string | null
          frames_rendered: number | null
          full_request_json: Json | null
          full_response_json: Json | null
          http_status: number | null
          id: string
          latency_ms: number | null
          module: string
          render_url: string | null
          response_schema_hash: string | null
          scenario_name: string
          started_at: string
          status: string
          triggered_by: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          credits_consumed?: number | null
          credits_refunded?: number | null
          error_message?: string | null
          frames_rendered?: number | null
          full_request_json?: Json | null
          full_response_json?: Json | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          module?: string
          render_url?: string | null
          response_schema_hash?: string | null
          scenario_name: string
          started_at?: string
          status: string
          triggered_by?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          credits_consumed?: number | null
          credits_refunded?: number | null
          error_message?: string | null
          frames_rendered?: number | null
          full_request_json?: Json | null
          full_response_json?: Json | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          module?: string
          render_url?: string | null
          response_schema_hash?: string | null
          scenario_name?: string
          started_at?: string
          status?: string
          triggered_by?: string
        }
        Relationships: []
      }
      ai_video_generations: {
        Row: {
          artlist_job_id: string | null
          aspect_ratio: string
          completed_at: string | null
          cost_per_second: number
          created_at: string
          duration_seconds: number
          error_message: string | null
          failed_at: string | null
          file_size_bytes: number | null
          id: string
          measured_at: string | null
          measured_bitrate_bps: number | null
          measured_container: string | null
          measured_duration_seconds: number | null
          measured_fps: number | null
          measured_height: number | null
          measured_size_bytes: number | null
          measured_width: number | null
          model: string
          output_verdict: string | null
          parity_api_route: string | null
          parity_mode: string | null
          parity_model_id: string | null
          parity_provider_model_slug: string | null
          parity_region: string | null
          parity_resolution_label: string | null
          prompt: string
          requested_height: number | null
          requested_width: number | null
          resolution: string
          retry_count: number | null
          source_image_url: string | null
          started_at: string | null
          status: string
          storage_path: string | null
          target_height: number | null
          target_width: number | null
          thumbnail_url: string | null
          total_cost_euros: number
          user_id: string
          video_url: string | null
        }
        Insert: {
          artlist_job_id?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          cost_per_second?: number
          created_at?: string
          duration_seconds: number
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          id?: string
          measured_at?: string | null
          measured_bitrate_bps?: number | null
          measured_container?: string | null
          measured_duration_seconds?: number | null
          measured_fps?: number | null
          measured_height?: number | null
          measured_size_bytes?: number | null
          measured_width?: number | null
          model?: string
          output_verdict?: string | null
          parity_api_route?: string | null
          parity_mode?: string | null
          parity_model_id?: string | null
          parity_provider_model_slug?: string | null
          parity_region?: string | null
          parity_resolution_label?: string | null
          prompt: string
          requested_height?: number | null
          requested_width?: number | null
          resolution?: string
          retry_count?: number | null
          source_image_url?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          target_height?: number | null
          target_width?: number | null
          thumbnail_url?: string | null
          total_cost_euros: number
          user_id: string
          video_url?: string | null
        }
        Update: {
          artlist_job_id?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          cost_per_second?: number
          created_at?: string
          duration_seconds?: number
          error_message?: string | null
          failed_at?: string | null
          file_size_bytes?: number | null
          id?: string
          measured_at?: string | null
          measured_bitrate_bps?: number | null
          measured_container?: string | null
          measured_duration_seconds?: number | null
          measured_fps?: number | null
          measured_height?: number | null
          measured_size_bytes?: number | null
          measured_width?: number | null
          model?: string
          output_verdict?: string | null
          parity_api_route?: string | null
          parity_mode?: string | null
          parity_model_id?: string | null
          parity_provider_model_slug?: string | null
          parity_region?: string | null
          parity_resolution_label?: string | null
          prompt?: string
          requested_height?: number | null
          requested_width?: number | null
          resolution?: string
          retry_count?: number | null
          source_image_url?: string | null
          started_at?: string | null
          status?: string
          storage_path?: string | null
          target_height?: number | null
          target_width?: number | null
          thumbnail_url?: string | null
          total_cost_euros?: number
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      ai_video_transactions: {
        Row: {
          amount_euros: number
          balance_after: number
          bonus_percent: number | null
          created_at: string
          currency: string
          description: string | null
          generation_id: string | null
          id: string
          metadata: Json | null
          pack_size: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount_euros: number
          balance_after: number
          bonus_percent?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          pack_size?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount_euros?: number
          balance_after?: number
          bonus_percent?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          generation_id?: string | null
          id?: string
          metadata?: Json | null
          pack_size?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_video_wallet_open_corrections: {
        Row: {
          correction_key: string
          created_at: string
          expected_amount_euros: number
          generation_id: string | null
          id: string
          ledger_transaction_id: string | null
          note: string | null
          open_amount_euros: number
          reason: string
          recovered_amount_euros: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          correction_key: string
          created_at?: string
          expected_amount_euros: number
          generation_id?: string | null
          id?: string
          ledger_transaction_id?: string | null
          note?: string | null
          open_amount_euros: number
          reason: string
          recovered_amount_euros?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          correction_key?: string
          created_at?: string
          expected_amount_euros?: number
          generation_id?: string | null
          id?: string
          ledger_transaction_id?: string | null
          note?: string | null
          open_amount_euros?: number
          reason?: string
          recovered_amount_euros?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_video_wallets: {
        Row: {
          balance_euros: number
          created_at: string
          currency: string
          id: string
          stripe_payment_method_id: string | null
          total_purchased_euros: number
          total_spent_euros: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_euros?: number
          created_at?: string
          currency?: string
          id?: string
          stripe_payment_method_id?: string | null
          total_purchased_euros?: number
          total_spent_euros?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_euros?: number
          created_at?: string
          currency?: string
          id?: string
          stripe_payment_method_id?: string | null
          total_purchased_euros?: number
          total_spent_euros?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_notifications: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          message: string
          metric_value: number
          resolved_at: string | null
          sent_at: string
          severity: string
          threshold: number
        }
        Insert: {
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metric_value: number
          resolved_at?: string | null
          sent_at?: string
          severity: string
          threshold: number
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metric_value?: number
          resolved_at?: string | null
          sent_at?: string
          severity?: string
          threshold?: number
        }
        Relationships: []
      }
      app_events: {
        Row: {
          created_at: string
          event_type: Database["public"]["Enums"]["app_event_type"]
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload_json: Json
          processed_flags_json: Json
          source: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: Database["public"]["Enums"]["app_event_type"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_json?: Json
          processed_flags_json?: Json
          source: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: Database["public"]["Enums"]["app_event_type"]
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload_json?: Json
          processed_flags_json?: Json
          source?: string
          user_id?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          created_at: string
          encrypted_value: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          encrypted_value: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          encrypted_value?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      approval_workflows: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          stages: Json
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          stages: Json
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          stages?: Json
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_workflows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobook_chapters: {
        Row: {
          audio_url: string | null
          body: string
          chapter_index: number
          char_count: number
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          id: string
          project_id: string
          render_progress: number
          render_status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          audio_url?: string | null
          body?: string
          chapter_index?: number
          char_count?: number
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          project_id: string
          render_progress?: number
          render_status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          audio_url?: string | null
          body?: string
          chapter_index?: number
          char_count?: number
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          id?: string
          project_id?: string
          render_progress?: number
          render_status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiobook_chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "audiobook_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audiobook_projects: {
        Row: {
          author: string | null
          cast_config: Json
          chapter_gap_ms: number
          created_at: string
          id: string
          language: string
          paragraph_gap_ms: number
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string | null
          cast_config?: Json
          chapter_gap_ms?: number
          created_at?: string
          id?: string
          language?: string
          paragraph_gap_ms?: number
          status?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string | null
          cast_config?: Json
          chapter_gap_ms?: number
          created_at?: string
          id?: string
          language?: string
          paragraph_gap_ms?: number
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auto_post_queue: {
        Row: {
          alt_text: string | null
          attempts: number
          caption: string | null
          created_at: string
          draft_id: string | null
          error_message: string | null
          hashtags: Json | null
          hook: string | null
          id: string
          image_url: string | null
          platform: string
          post_id: string | null
          processed_at: string | null
          recurring_post_id: string | null
          scheduled_at: string
          status: string
          user_id: string
          utm_link: string | null
          variant: string | null
        }
        Insert: {
          alt_text?: string | null
          attempts?: number
          caption?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          image_url?: string | null
          platform: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at: string
          status?: string
          user_id: string
          utm_link?: string | null
          variant?: string | null
        }
        Update: {
          alt_text?: string | null
          attempts?: number
          caption?: string | null
          created_at?: string
          draft_id?: string | null
          error_message?: string | null
          hashtags?: Json | null
          hook?: string | null
          id?: string
          image_url?: string | null
          platform?: string
          post_id?: string | null
          processed_at?: string | null
          recurring_post_id?: string | null
          scheduled_at?: string
          status?: string
          user_id?: string
          utm_link?: string | null
          variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_post_queue_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_activity_log: {
        Row: {
          actor: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          slot_id: string | null
          user_id: string
        }
        Insert: {
          actor?: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          slot_id?: string | null
          user_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          slot_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_activity_log_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "autopilot_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_assets: {
        Row: {
          analysis: Json
          created_at: string
          file_name: string | null
          file_size: number | null
          id: string
          idea_id: string | null
          mime_type: string | null
          production_id: string | null
          public_url: string | null
          role: string
          storage_path: string
          updated_at: string
          usable: boolean
          user_id: string
          user_note: string | null
        }
        Insert: {
          analysis?: Json
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          idea_id?: string | null
          mime_type?: string | null
          production_id?: string | null
          public_url?: string | null
          role?: string
          storage_path: string
          updated_at?: string
          usable?: boolean
          user_id: string
          user_note?: string | null
        }
        Update: {
          analysis?: Json
          created_at?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          idea_id?: string | null
          mime_type?: string | null
          production_id?: string | null
          public_url?: string | null
          role?: string
          storage_path?: string
          updated_at?: string
          usable?: boolean
          user_id?: string
          user_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_assets_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "autopilot_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "autopilot_assets_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "autopilot_productions"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_briefs: {
        Row: {
          activated_at: string | null
          auto_publish_enabled: boolean
          avatar_ids: string[]
          briefing_required_until: string | null
          budget_resets_at: string
          channel_goal: string
          compliance_score: number
          content_mix: Json
          created_at: string
          forbidden_topics: string[]
          id: string
          is_active: boolean
          languages: string[]
          last_performance_analysis_at: string | null
          last_plan_generated_at: string | null
          last_review_completed_at: string | null
          locked_until: string | null
          paused_until: string | null
          performance_loop_enabled: boolean
          platforms: string[]
          posts_per_week: Json
          target_audience: string | null
          tonality: string
          topic_pillars: string[]
          updated_at: string
          user_id: string
          usp: string | null
          video_aspect_ratio: string
          video_duration_sec: number
          video_enabled: boolean
          video_provider: string
          weekly_budget_eur: number
          weekly_credit_budget: number
          weekly_credits_spent: number
        }
        Insert: {
          activated_at?: string | null
          auto_publish_enabled?: boolean
          avatar_ids?: string[]
          briefing_required_until?: string | null
          budget_resets_at?: string
          channel_goal?: string
          compliance_score?: number
          content_mix?: Json
          created_at?: string
          forbidden_topics?: string[]
          id?: string
          is_active?: boolean
          languages?: string[]
          last_performance_analysis_at?: string | null
          last_plan_generated_at?: string | null
          last_review_completed_at?: string | null
          locked_until?: string | null
          paused_until?: string | null
          performance_loop_enabled?: boolean
          platforms?: string[]
          posts_per_week?: Json
          target_audience?: string | null
          tonality?: string
          topic_pillars?: string[]
          updated_at?: string
          user_id: string
          usp?: string | null
          video_aspect_ratio?: string
          video_duration_sec?: number
          video_enabled?: boolean
          video_provider?: string
          weekly_budget_eur?: number
          weekly_credit_budget?: number
          weekly_credits_spent?: number
        }
        Update: {
          activated_at?: string | null
          auto_publish_enabled?: boolean
          avatar_ids?: string[]
          briefing_required_until?: string | null
          budget_resets_at?: string
          channel_goal?: string
          compliance_score?: number
          content_mix?: Json
          created_at?: string
          forbidden_topics?: string[]
          id?: string
          is_active?: boolean
          languages?: string[]
          last_performance_analysis_at?: string | null
          last_plan_generated_at?: string | null
          last_review_completed_at?: string | null
          locked_until?: string | null
          paused_until?: string | null
          performance_loop_enabled?: boolean
          platforms?: string[]
          posts_per_week?: Json
          target_audience?: string | null
          tonality?: string
          topic_pillars?: string[]
          updated_at?: string
          user_id?: string
          usp?: string | null
          video_aspect_ratio?: string
          video_duration_sec?: number
          video_enabled?: boolean
          video_provider?: string
          weekly_budget_eur?: number
          weekly_credit_budget?: number
          weekly_credits_spent?: number
        }
        Relationships: []
      }
      autopilot_consent_log: {
        Row: {
          accepted_text_hash: string
          accepted_text_version: string
          created_at: string
          event_type: string
          id: string
          ip_hash: string | null
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_text_hash: string
          accepted_text_version: string
          created_at?: string
          event_type: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_text_hash?: string
          accepted_text_version?: string
          created_at?: string
          event_type?: string
          id?: string
          ip_hash?: string | null
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      autopilot_director_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: string
          message: string
          meta: Json
          production_id: string
          role: string
          scene_index: number | null
          severity: string
          stage: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          message: string
          meta?: Json
          production_id: string
          role?: string
          scene_index?: number | null
          severity?: string
          stage: string
          user_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: string
          message?: string
          meta?: Json
          production_id?: string
          role?: string
          scene_index?: number | null
          severity?: string
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_director_log_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "autopilot_productions"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_ideas: {
        Row: {
          aspect_ratio: string
          brief: string
          concepts: Json
          created_at: string
          genre: string | null
          id: string
          language: string
          options: Json
          production_id: string | null
          selected_index: number | null
          strategy: Json
          target_duration_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          brief: string
          concepts?: Json
          created_at?: string
          genre?: string | null
          id?: string
          language?: string
          options?: Json
          production_id?: string | null
          selected_index?: number | null
          strategy?: Json
          target_duration_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          brief?: string
          concepts?: Json
          created_at?: string
          genre?: string | null
          id?: string
          language?: string
          options?: Json
          production_id?: string | null
          selected_index?: number | null
          strategy?: Json
          target_duration_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_ideas_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "autopilot_productions"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_lounge_feed_cache: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          expires_at: string
          id: string
          language: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          payload?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      autopilot_performance_insights: {
        Row: {
          analyzed_until: string
          avg_engagement_rate: number | null
          brief_id: string
          created_at: string
          id: string
          recommendation_text: string | null
          top_formats: Json
          top_pillars: Json
          top_platforms: Json
          top_post_hours: Json
          total_posts_analyzed: number
          updated_at: string
          user_id: string
          weakest_pillars: Json
        }
        Insert: {
          analyzed_until: string
          avg_engagement_rate?: number | null
          brief_id: string
          created_at?: string
          id?: string
          recommendation_text?: string | null
          top_formats?: Json
          top_pillars?: Json
          top_platforms?: Json
          top_post_hours?: Json
          total_posts_analyzed?: number
          updated_at?: string
          user_id: string
          weakest_pillars?: Json
        }
        Update: {
          analyzed_until?: string
          avg_engagement_rate?: number | null
          brief_id?: string
          created_at?: string
          id?: string
          recommendation_text?: string | null
          top_formats?: Json
          top_pillars?: Json
          top_platforms?: Json
          top_post_hours?: Json
          total_posts_analyzed?: number
          updated_at?: string
          user_id?: string
          weakest_pillars?: Json
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_performance_insights_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: true
            referencedRelation: "autopilot_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_production_scenes: {
        Row: {
          anchor_attempts: number
          anchor_prompt: string | null
          anchor_score: number | null
          anchor_url: string | null
          anchor_verdicts: Json
          attempt: number
          beat: string
          composer_scene_id: string | null
          created_at: string
          dialogue: Json
          duration_seconds: number
          engine: string | null
          error_message: string | null
          fallback_kind: string | null
          grammar: Json
          id: string
          lipsync_url: string | null
          motion_prompt: string | null
          production_id: string
          refunded: boolean
          scene_index: number
          sound_design: Json
          spent_credits: number
          status: string
          updated_at: string
          user_id: string
          video_url: string | null
          voiceover_duration_seconds: number | null
          voiceover_url: string | null
        }
        Insert: {
          anchor_attempts?: number
          anchor_prompt?: string | null
          anchor_score?: number | null
          anchor_url?: string | null
          anchor_verdicts?: Json
          attempt?: number
          beat?: string
          composer_scene_id?: string | null
          created_at?: string
          dialogue?: Json
          duration_seconds?: number
          engine?: string | null
          error_message?: string | null
          fallback_kind?: string | null
          grammar?: Json
          id?: string
          lipsync_url?: string | null
          motion_prompt?: string | null
          production_id: string
          refunded?: boolean
          scene_index: number
          sound_design?: Json
          spent_credits?: number
          status?: string
          updated_at?: string
          user_id: string
          video_url?: string | null
          voiceover_duration_seconds?: number | null
          voiceover_url?: string | null
        }
        Update: {
          anchor_attempts?: number
          anchor_prompt?: string | null
          anchor_score?: number | null
          anchor_url?: string | null
          anchor_verdicts?: Json
          attempt?: number
          beat?: string
          composer_scene_id?: string | null
          created_at?: string
          dialogue?: Json
          duration_seconds?: number
          engine?: string | null
          error_message?: string | null
          fallback_kind?: string | null
          grammar?: Json
          id?: string
          lipsync_url?: string | null
          motion_prompt?: string | null
          production_id?: string
          refunded?: boolean
          scene_index?: number
          sound_design?: Json
          spent_credits?: number
          status?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
          voiceover_duration_seconds?: number | null
          voiceover_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_production_scenes_production_id_fkey"
            columns: ["production_id"]
            isOneToOne: false
            referencedRelation: "autopilot_productions"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_productions: {
        Row: {
          approved_at: string | null
          aspect_ratio: string
          audio_mix: Json
          brand_kit_id: string | null
          brief: string
          completed_at: string | null
          composer_project_id: string | null
          created_at: string
          error_message: string | null
          estimated_credits: number
          final_video_url: string | null
          genre: string
          heartbeat_at: string | null
          id: string
          language: string
          music_url: string | null
          platform: string
          progress: number
          refunded_credits: number
          render_id: string | null
          research: Json
          resume_attempts: number
          sound_design: Json
          spent_credits: number
          stage: string
          status: string
          target_duration_seconds: number
          treatment: Json
          updated_at: string
          user_id: string
          voiceover_url: string | null
        }
        Insert: {
          approved_at?: string | null
          aspect_ratio?: string
          audio_mix?: Json
          brand_kit_id?: string | null
          brief: string
          completed_at?: string | null
          composer_project_id?: string | null
          created_at?: string
          error_message?: string | null
          estimated_credits?: number
          final_video_url?: string | null
          genre?: string
          heartbeat_at?: string | null
          id?: string
          language?: string
          music_url?: string | null
          platform?: string
          progress?: number
          refunded_credits?: number
          render_id?: string | null
          research?: Json
          resume_attempts?: number
          sound_design?: Json
          spent_credits?: number
          stage?: string
          status?: string
          target_duration_seconds?: number
          treatment?: Json
          updated_at?: string
          user_id: string
          voiceover_url?: string | null
        }
        Update: {
          approved_at?: string | null
          aspect_ratio?: string
          audio_mix?: Json
          brand_kit_id?: string | null
          brief?: string
          completed_at?: string | null
          composer_project_id?: string | null
          created_at?: string
          error_message?: string | null
          estimated_credits?: number
          final_video_url?: string | null
          genre?: string
          heartbeat_at?: string | null
          id?: string
          language?: string
          music_url?: string | null
          platform?: string
          progress?: number
          refunded_credits?: number
          render_id?: string | null
          research?: Json
          resume_attempts?: number
          sound_design?: Json
          spent_credits?: number
          stage?: string
          status?: string
          target_duration_seconds?: number
          treatment?: Json
          updated_at?: string
          user_id?: string
          voiceover_url?: string | null
        }
        Relationships: []
      }
      autopilot_queue: {
        Row: {
          approved_at: string | null
          approved_by_user: boolean | null
          asset_url: string | null
          block_reason: string | null
          brief_id: string
          caption: string | null
          content_payload: Json
          created_at: string
          generation_cost_credits: number | null
          hashtags: string[] | null
          id: string
          language: string
          platform: string
          posted_at: string | null
          qa_findings: Json | null
          qa_score: number | null
          scheduled_at: string
          social_post_id: string | null
          status: string
          topic_hint: string | null
          updated_at: string
          user_id: string
          video_completed_at: string | null
          video_error: string | null
          video_prediction_id: string | null
          video_provider: string | null
          video_started_at: string | null
          video_status: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by_user?: boolean | null
          asset_url?: string | null
          block_reason?: string | null
          brief_id: string
          caption?: string | null
          content_payload?: Json
          created_at?: string
          generation_cost_credits?: number | null
          hashtags?: string[] | null
          id?: string
          language?: string
          platform: string
          posted_at?: string | null
          qa_findings?: Json | null
          qa_score?: number | null
          scheduled_at: string
          social_post_id?: string | null
          status?: string
          topic_hint?: string | null
          updated_at?: string
          user_id: string
          video_completed_at?: string | null
          video_error?: string | null
          video_prediction_id?: string | null
          video_provider?: string | null
          video_started_at?: string | null
          video_status?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by_user?: boolean | null
          asset_url?: string | null
          block_reason?: string | null
          brief_id?: string
          caption?: string | null
          content_payload?: Json
          created_at?: string
          generation_cost_credits?: number | null
          hashtags?: string[] | null
          id?: string
          language?: string
          platform?: string
          posted_at?: string | null
          qa_findings?: Json | null
          qa_score?: number | null
          scheduled_at?: string
          social_post_id?: string | null
          status?: string
          topic_hint?: string | null
          updated_at?: string
          user_id?: string
          video_completed_at?: string | null
          video_error?: string | null
          video_prediction_id?: string | null
          video_provider?: string | null
          video_started_at?: string | null
          video_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_queue_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "autopilot_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_strikes: {
        Row: {
          created_at: string
          evidence_json: Json
          expires_at: string | null
          id: string
          is_active: boolean
          reason_code: string
          reason_description: string
          related_slot_id: string | null
          severity: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence_json?: Json
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason_code: string
          reason_description: string
          related_slot_id?: string | null
          severity: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_json?: Json
          expires_at?: string | null
          id?: string
          is_active?: boolean
          reason_code?: string
          reason_description?: string
          related_slot_id?: string | null
          severity?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_strikes_related_slot_id_fkey"
            columns: ["related_slot_id"]
            isOneToOne: false
            referencedRelation: "autopilot_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_video_jobs: {
        Row: {
          aspect_ratio: string
          completed_at: string | null
          cost_credits: number
          created_at: string
          duration_sec: number
          error_message: string | null
          id: string
          model: string | null
          output_url: string | null
          prediction_id: string | null
          prompt: string
          provider: string
          slot_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          aspect_ratio: string
          completed_at?: string | null
          cost_credits?: number
          created_at?: string
          duration_sec: number
          error_message?: string | null
          id?: string
          model?: string | null
          output_url?: string | null
          prediction_id?: string | null
          prompt: string
          provider: string
          slot_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          completed_at?: string | null
          cost_credits?: number
          created_at?: string
          duration_sec?: number
          error_message?: string | null
          id?: string
          model?: string | null
          output_url?: string | null
          prediction_id?: string | null
          prompt?: string
          provider?: string
          slot_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_video_jobs_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "autopilot_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      autopilot_weekly_reviews: {
        Row: {
          ai_recommendation: Json
          brief_id: string
          created_at: string
          credits_budgeted: number
          credits_spent: number
          decided_at: string | null
          id: string
          period_end: string
          period_start: string
          platform_breakdown: Json
          posts_generated: number
          posts_published: number
          posts_rejected: number
          top_pillar: string | null
          total_engagement: number
          user_decision: string
          user_id: string
          weakest_pillar: string | null
        }
        Insert: {
          ai_recommendation?: Json
          brief_id: string
          created_at?: string
          credits_budgeted?: number
          credits_spent?: number
          decided_at?: string | null
          id?: string
          period_end: string
          period_start: string
          platform_breakdown?: Json
          posts_generated?: number
          posts_published?: number
          posts_rejected?: number
          top_pillar?: string | null
          total_engagement?: number
          user_decision?: string
          user_id: string
          weakest_pillar?: string | null
        }
        Update: {
          ai_recommendation?: Json
          brief_id?: string
          created_at?: string
          credits_budgeted?: number
          credits_spent?: number
          decided_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          platform_breakdown?: Json
          posts_generated?: number
          posts_published?: number
          posts_rejected?: number
          top_pillar?: string | null
          total_engagement?: number
          user_decision?: string
          user_id?: string
          weakest_pillar?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autopilot_weekly_reviews_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "autopilot_briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_outfit_looks: {
        Row: {
          avatar_id: string
          back_url: string | null
          cover_url: string
          created_at: string
          front_url: string | null
          id: string
          name: string
          outfit_id: string
          side_url: string | null
          theme_pack: string
          top_url: string | null
          user_id: string
        }
        Insert: {
          avatar_id: string
          back_url?: string | null
          cover_url: string
          created_at?: string
          front_url?: string | null
          id?: string
          name: string
          outfit_id: string
          side_url?: string | null
          theme_pack: string
          top_url?: string | null
          user_id: string
        }
        Update: {
          avatar_id?: string
          back_url?: string | null
          cover_url?: string
          created_at?: string
          front_url?: string | null
          id?: string
          name?: string
          outfit_id?: string
          side_url?: string | null
          theme_pack?: string
          top_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_outfit_looks_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_pose_variants: {
        Row: {
          avatar_id: string
          created_at: string
          id: string
          image_url: string
          label: string
          pose_id: string
          storage_path: string | null
        }
        Insert: {
          avatar_id: string
          created_at?: string
          id?: string
          image_url: string
          label: string
          pose_id: string
          storage_path?: string | null
        }
        Update: {
          avatar_id?: string
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          pose_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "avatar_pose_variants_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_wardrobe_variants: {
        Row: {
          avatar_id: string
          created_at: string
          id: string
          image_url: string
          label: string
          outfit_id: string
          storage_path: string | null
          theme_pack: string
        }
        Insert: {
          avatar_id: string
          created_at?: string
          id?: string
          image_url: string
          label: string
          outfit_id: string
          storage_path?: string | null
          theme_pack?: string
        }
        Update: {
          avatar_id?: string
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          outfit_id?: string
          storage_path?: string | null
          theme_pack?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_wardrobe_variants_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      background_music_tracks: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          genre: string
          id: string
          is_valid: boolean | null
          last_validated_at: string | null
          mood: string
          moods: string[]
          name: string
          source_id: string | null
          storage_path: string
          validation_attempts: number
          validation_error: string | null
          validation_status: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          genre: string
          id?: string
          is_valid?: boolean | null
          last_validated_at?: string | null
          mood: string
          moods?: string[]
          name: string
          source_id?: string | null
          storage_path: string
          validation_attempts?: number
          validation_error?: string | null
          validation_status?: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          genre?: string
          id?: string
          is_valid?: boolean | null
          last_validated_at?: string | null
          mood?: string
          moods?: string[]
          name?: string
          source_id?: string | null
          storage_path?: string
          validation_attempts?: number
          validation_error?: string | null
          validation_status?: string
        }
        Relationships: []
      }
      background_projects: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          cutout_image_url: string | null
          id: string
          language: string
          lighting: string
          original_image_url: string
          results_json: Json
          style_intensity: number
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lighting?: string
          original_image_url: string
          results_json?: Json
          style_intensity?: number
          theme: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          cutout_image_url?: string | null
          id?: string
          language?: string
          lighting?: string
          original_image_url?: string
          results_json?: Json
          style_intensity?: number
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      batch_jobs: {
        Row: {
          completed_at: string | null
          completed_videos: number
          created_at: string
          csv_data: Json
          error_log: Json | null
          failed_videos: number
          id: string
          job_name: string
          started_at: string | null
          status: string
          template_id: string
          total_videos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_videos?: number
          created_at?: string
          csv_data: Json
          error_log?: Json | null
          failed_videos?: number
          id?: string
          job_name: string
          started_at?: string | null
          status?: string
          template_id: string
          total_videos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_videos?: number
          created_at?: string
          csv_data?: Json
          error_log?: Json | null
          failed_videos?: number
          id?: string
          job_name?: string
          started_at?: string | null
          status?: string
          template_id?: string
          total_videos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_renders: {
        Row: {
          completed_at: string | null
          completed_variants: number
          created_at: string
          credits_used: number
          export_settings: Json
          failed_variants: number
          id: string
          project_id: string
          render_results: Json
          status: string
          total_variants: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_variants?: number
          created_at?: string
          credits_used?: number
          export_settings?: Json
          failed_variants?: number
          id?: string
          project_id: string
          render_results?: Json
          status?: string
          total_variants?: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_variants?: number
          created_at?: string
          credits_used?: number
          export_settings?: Json
          failed_variants?: number
          id?: string
          project_id?: string
          render_results?: Json
          status?: string
          total_variants?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      best_content: {
        Row: {
          analyzed_at: string
          caption_text: string | null
          engagement_rate: number | null
          engagement_score: number
          id: string
          insights_json: Json | null
          platform: string
          post_id: string
          posted_at: string
          reach: number | null
          user_id: string
        }
        Insert: {
          analyzed_at?: string
          caption_text?: string | null
          engagement_rate?: number | null
          engagement_score: number
          id?: string
          insights_json?: Json | null
          platform: string
          post_id: string
          posted_at: string
          reach?: number | null
          user_id: string
        }
        Update: {
          analyzed_at?: string
          caption_text?: string | null
          engagement_rate?: number | null
          engagement_score?: number
          id?: string
          insights_json?: Json | null
          platform?: string
          post_id?: string
          posted_at?: string
          reach?: number | null
          user_id?: string
        }
        Relationships: []
      }
      billing_plans: {
        Row: {
          code: string
          created_at: string
          features_json: Json
          id: string
          max_concurrent_jobs: number
          max_daily_generations: number
          monthly_credits: number
          name: string
          overage_enabled: boolean
          overage_price_per_credit: number
          seats_included: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          features_json?: Json
          id?: string
          max_concurrent_jobs?: number
          max_daily_generations?: number
          monthly_credits?: number
          name: string
          overage_enabled?: boolean
          overage_price_per_credit?: number
          seats_included?: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          features_json?: Json
          id?: string
          max_concurrent_jobs?: number
          max_daily_generations?: number
          monthly_credits?: number
          name?: string
          overage_enabled?: boolean
          overage_price_per_credit?: number
          seats_included?: number
          sort_order?: number
        }
        Relationships: []
      }
      bios_history: {
        Row: {
          audience: string
          bios_json: Json
          created_at: string | null
          id: string
          keywords: string | null
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          audience: string
          bios_json: Json
          created_at?: string | null
          id?: string
          keywords?: string | null
          language?: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          audience?: string
          bios_json?: Json
          created_at?: string | null
          id?: string
          keywords?: string | null
          language?: string
          platform?: string
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      brand_assets: {
        Row: {
          brand_kit_id: string
          created_at: string
          id: string
          kind: string
          meta: Json
          url: string
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          url: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_buildings: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          name: string
          reference_image_url: string
          storage_path: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
          visual_identity_json: Json | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          reference_image_url: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
          visual_identity_json?: Json | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          reference_image_url?: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          visual_identity_json?: Json | null
        }
        Relationships: []
      }
      brand_character_usage: {
        Row: {
          character_id: string
          created_at: string
          generation_id: string | null
          id: string
          model_used: string | null
          module: string | null
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          generation_id?: string | null
          id?: string
          model_used?: string | null
          module?: string | null
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          generation_id?: string | null
          id?: string
          model_used?: string | null
          module?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_character_usage_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_characters: {
        Row: {
          archived_at: string | null
          average_rating: number
          brand_kit_id: string | null
          cloned_from_preset: string | null
          created_at: string
          default_aspect_ratio: string | null
          default_language: string | null
          default_performance: Json | null
          default_voice_id: string | null
          default_voice_language: string | null
          default_voice_name: string | null
          default_voice_provider: string | null
          description: string | null
          gender: string | null
          id: string
          identity_lock_strength: string
          is_favorite: boolean
          license_release_path: string | null
          marketplace_status: string
          name: string
          nsfw_flag: boolean
          origin_metadata: Json
          origin_type: string | null
          portrait_mode: string | null
          portrait_url: string | null
          price_credits: number
          pricing_type: string
          published_at: string | null
          reference_image_url: string
          rejection_reason: string | null
          rekognition_collection_id: string | null
          rekognition_face_ids: string[]
          rekognition_indexed_at: string | null
          rekognition_portrait_hash: string | null
          revenue_share_percent: number
          reviewed_at: string | null
          reviewed_by: string | null
          sample_video_urls: string[]
          storage_path: string | null
          tags: string[]
          total_purchases: number
          total_ratings: number
          total_revenue_credits: number
          updated_at: string
          usage_count: number
          user_id: string
          visual_identity_json: Json | null
          voice_sample_url: string | null
          voice_settings: Json | null
        }
        Insert: {
          archived_at?: string | null
          average_rating?: number
          brand_kit_id?: string | null
          cloned_from_preset?: string | null
          created_at?: string
          default_aspect_ratio?: string | null
          default_language?: string | null
          default_performance?: Json | null
          default_voice_id?: string | null
          default_voice_language?: string | null
          default_voice_name?: string | null
          default_voice_provider?: string | null
          description?: string | null
          gender?: string | null
          id?: string
          identity_lock_strength?: string
          is_favorite?: boolean
          license_release_path?: string | null
          marketplace_status?: string
          name: string
          nsfw_flag?: boolean
          origin_metadata?: Json
          origin_type?: string | null
          portrait_mode?: string | null
          portrait_url?: string | null
          price_credits?: number
          pricing_type?: string
          published_at?: string | null
          reference_image_url: string
          rejection_reason?: string | null
          rekognition_collection_id?: string | null
          rekognition_face_ids?: string[]
          rekognition_indexed_at?: string | null
          rekognition_portrait_hash?: string | null
          revenue_share_percent?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_video_urls?: string[]
          storage_path?: string | null
          tags?: string[]
          total_purchases?: number
          total_ratings?: number
          total_revenue_credits?: number
          updated_at?: string
          usage_count?: number
          user_id: string
          visual_identity_json?: Json | null
          voice_sample_url?: string | null
          voice_settings?: Json | null
        }
        Update: {
          archived_at?: string | null
          average_rating?: number
          brand_kit_id?: string | null
          cloned_from_preset?: string | null
          created_at?: string
          default_aspect_ratio?: string | null
          default_language?: string | null
          default_performance?: Json | null
          default_voice_id?: string | null
          default_voice_language?: string | null
          default_voice_name?: string | null
          default_voice_provider?: string | null
          description?: string | null
          gender?: string | null
          id?: string
          identity_lock_strength?: string
          is_favorite?: boolean
          license_release_path?: string | null
          marketplace_status?: string
          name?: string
          nsfw_flag?: boolean
          origin_metadata?: Json
          origin_type?: string | null
          portrait_mode?: string | null
          portrait_url?: string | null
          price_credits?: number
          pricing_type?: string
          published_at?: string | null
          reference_image_url?: string
          rejection_reason?: string | null
          rekognition_collection_id?: string | null
          rekognition_face_ids?: string[]
          rekognition_indexed_at?: string | null
          rekognition_portrait_hash?: string | null
          revenue_share_percent?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          sample_video_urls?: string[]
          storage_path?: string | null
          tags?: string[]
          total_purchases?: number
          total_ratings?: number
          total_revenue_credits?: number
          updated_at?: string
          usage_count?: number
          user_id?: string
          visual_identity_json?: Json | null
          voice_sample_url?: string | null
          voice_settings?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_characters_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_characters_cloned_from_preset_fkey"
            columns: ["cloned_from_preset"]
            isOneToOne: false
            referencedRelation: "system_preset_avatars"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_consistency_history: {
        Row: {
          analyzed_at: string | null
          brand_kit_id: string
          content_id: string | null
          content_type: string
          feedback: Json | null
          id: string
          score: number
          user_id: string
        }
        Insert: {
          analyzed_at?: string | null
          brand_kit_id: string
          content_id?: string | null
          content_type: string
          feedback?: Json | null
          id?: string
          score: number
          user_id: string
        }
        Update: {
          analyzed_at?: string | null
          brand_kit_id?: string
          content_id?: string | null
          content_type?: string
          feedback?: Json | null
          id?: string
          score?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_consistency_history_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_content_analysis: {
        Row: {
          brand_kit_id: string
          content_id: string | null
          content_type: string
          created_at: string
          feedback: Json | null
          id: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          content_id?: string | null
          content_type: string
          created_at?: string
          feedback?: Json | null
          id?: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          feedback?: Json | null
          id?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_content_analysis_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_drift_reports: {
        Row: {
          brand_kit_id: string
          created_at: string
          id: string
          preview_url: string | null
          resolved_at: string | null
          score: number | null
          severity: string
          source_id: string | null
          source_table: string
          suggested_fix: Json
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          created_at?: string
          id?: string
          preview_url?: string | null
          resolved_at?: string | null
          score?: number | null
          severity?: string
          source_id?: string | null
          source_table: string
          suggested_fix?: Json
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          created_at?: string
          id?: string
          preview_url?: string | null
          resolved_at?: string | null
          score?: number | null
          severity?: string
          source_id?: string | null
          source_table?: string
          suggested_fix?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_drift_reports_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_kits: {
        Row: {
          accent_color: string | null
          ai_comment: string | null
          archived_at: string | null
          brand_emotions: Json | null
          brand_name: string | null
          brand_tone: string | null
          brand_values: Json | null
          brand_voice: Json | null
          color_palette: Json
          consistency_score: number | null
          created_at: string | null
          emoji_suggestions: Json | null
          example_caption: string | null
          font_pairing: Json
          id: string
          industry: string | null
          is_active: boolean | null
          keywords: Json | null
          last_consistency_check: string | null
          logo_url: string | null
          mood: string | null
          neutrals: Json | null
          primary_color: string
          recommended_hashtags: Json | null
          secondary_color: string | null
          share_expires_at: string | null
          share_token: string | null
          shared_with: Json | null
          style_direction: string | null
          target_audience: string | null
          templates_used: Json | null
          updated_at: string
          usage_examples: Json | null
          user_id: string
          version: number | null
          website_url: string | null
        }
        Insert: {
          accent_color?: string | null
          ai_comment?: string | null
          archived_at?: string | null
          brand_emotions?: Json | null
          brand_name?: string | null
          brand_tone?: string | null
          brand_values?: Json | null
          brand_voice?: Json | null
          color_palette?: Json
          consistency_score?: number | null
          created_at?: string | null
          emoji_suggestions?: Json | null
          example_caption?: string | null
          font_pairing?: Json
          id?: string
          industry?: string | null
          is_active?: boolean | null
          keywords?: Json | null
          last_consistency_check?: string | null
          logo_url?: string | null
          mood?: string | null
          neutrals?: Json | null
          primary_color: string
          recommended_hashtags?: Json | null
          secondary_color?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          shared_with?: Json | null
          style_direction?: string | null
          target_audience?: string | null
          templates_used?: Json | null
          updated_at?: string
          usage_examples?: Json | null
          user_id: string
          version?: number | null
          website_url?: string | null
        }
        Update: {
          accent_color?: string | null
          ai_comment?: string | null
          archived_at?: string | null
          brand_emotions?: Json | null
          brand_name?: string | null
          brand_tone?: string | null
          brand_values?: Json | null
          brand_voice?: Json | null
          color_palette?: Json
          consistency_score?: number | null
          created_at?: string | null
          emoji_suggestions?: Json | null
          example_caption?: string | null
          font_pairing?: Json
          id?: string
          industry?: string | null
          is_active?: boolean | null
          keywords?: Json | null
          last_consistency_check?: string | null
          logo_url?: string | null
          mood?: string | null
          neutrals?: Json | null
          primary_color?: string
          recommended_hashtags?: Json | null
          secondary_color?: string | null
          share_expires_at?: string | null
          share_token?: string | null
          shared_with?: Json | null
          style_direction?: string | null
          target_audience?: string | null
          templates_used?: Json | null
          updated_at?: string
          usage_examples?: Json | null
          user_id?: string
          version?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      brand_locations: {
        Row: {
          archived_at: string | null
          brand_kit_id: string | null
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          name: string
          reference_image_url: string
          storage_path: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
          visual_identity_json: Json | null
        }
        Insert: {
          archived_at?: string | null
          brand_kit_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          reference_image_url: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
          visual_identity_json?: Json | null
        }
        Update: {
          archived_at?: string | null
          brand_kit_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          reference_image_url?: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          visual_identity_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_locations_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_props: {
        Row: {
          archived_at: string | null
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          name: string
          reference_image_url: string
          storage_path: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
          visual_identity_json: Json | null
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name: string
          reference_image_url: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
          visual_identity_json?: Json | null
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          name?: string
          reference_image_url?: string
          storage_path?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          visual_identity_json?: Json | null
        }
        Relationships: []
      }
      brand_templates: {
        Row: {
          brand_kit_id: string
          created_at: string | null
          id: string
          is_public: boolean | null
          name: string
          template_data: Json
          template_type: string
          thumbnail_url: string | null
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          brand_kit_id: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name: string
          template_data?: Json
          template_type: string
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          brand_kit_id?: string
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          name?: string
          template_data?: Json
          template_type?: string
          thumbnail_url?: string | null
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_templates_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_trends_cache: {
        Row: {
          brand_kit_id: string | null
          expires_at: string
          generated_at: string
          id: string
          industry: string | null
          locale: string | null
          trends: Json
        }
        Insert: {
          brand_kit_id?: string | null
          expires_at?: string
          generated_at?: string
          id?: string
          industry?: string | null
          locale?: string | null
          trends?: Json
        }
        Update: {
          brand_kit_id?: string | null
          expires_at?: string
          generated_at?: string
          id?: string
          industry?: string | null
          locale?: string | null
          trends?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brand_trends_cache_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_voice: {
        Row: {
          id: string
          keywords: string | null
          tagline: string | null
          tone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          keywords?: string | null
          tagline?: string | null
          tone: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          keywords?: string | null
          tagline?: string | null
          tone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brand_voice_samples: {
        Row: {
          analyzed_attributes: Json | null
          brand_kit_id: string
          created_at: string | null
          id: string
          kind: string
          sample_text: string | null
          text: string | null
          user_id: string
        }
        Insert: {
          analyzed_attributes?: Json | null
          brand_kit_id: string
          created_at?: string | null
          id?: string
          kind?: string
          sample_text?: string | null
          text?: string | null
          user_id: string
        }
        Update: {
          analyzed_attributes?: Json | null
          brand_kit_id?: string
          created_at?: string | null
          id?: string
          kind?: string
          sample_text?: string | null
          text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_voice_samples_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      briefing_research_cache: {
        Row: {
          briefing_hash: string
          created_at: string
          expires_at: string
          id: string
          language: string
          meta: Json
          mode: string | null
          research: Json
          user_id: string
        }
        Insert: {
          briefing_hash: string
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          meta?: Json
          mode?: string | null
          research?: Json
          user_id: string
        }
        Update: {
          briefing_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          language?: string
          meta?: Json
          mode?: string | null
          research?: Json
          user_id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          admin_notes: string | null
          console_logs: Json | null
          created_at: string
          description: string
          id: string
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          screenshot_url: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          viewport: string | null
        }
        Insert: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string
          description: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Update: {
          admin_notes?: string | null
          console_logs?: Json | null
          created_at?: string
          description?: string
          id?: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          viewport?: string | null
        }
        Relationships: []
      }
      building_catalog_previews: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          prompt: string | null
          storage_path: string | null
          theme_pack: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack?: string
        }
        Relationships: []
      }
      bulk_schedule_jobs: {
        Row: {
          completed_at: string | null
          config: Json
          created_at: string | null
          created_events: number | null
          error_message: string | null
          id: string
          status: string | null
          total_events: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          config: Json
          created_at?: string | null
          created_events?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
          total_events: number
          user_id: string
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json
          created_at?: string | null
          created_events?: number | null
          error_message?: string | null
          id?: string
          status?: string | null
          total_events?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_schedule_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cache_policies: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_cache_age_days: number | null
          max_cache_size_gb: number | null
          min_hit_count: number | null
          policy_name: string
          priority_templates: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_cache_age_days?: number | null
          max_cache_size_gb?: number | null
          min_hit_count?: number | null
          policy_name: string
          priority_templates?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_cache_age_days?: number | null
          max_cache_size_gb?: number | null
          min_hit_count?: number | null
          policy_name?: string
          priority_templates?: string[] | null
        }
        Relationships: []
      }
      cache_stats: {
        Row: {
          cache_type: string
          endpoint: string
          hit: boolean
          id: string
          latency_ms: number | null
          recorded_at: string
        }
        Insert: {
          cache_type: string
          endpoint: string
          hit: boolean
          id?: string
          latency_ms?: number | null
          recorded_at?: string
        }
        Update: {
          cache_type?: string
          endpoint?: string
          hit?: boolean
          id?: string
          latency_ms?: number | null
          recorded_at?: string
        }
        Relationships: []
      }
      calendar_activity_log: {
        Row: {
          action: string
          changes_json: Json | null
          created_at: string
          entity_type: string
          event_id: string | null
          id: string
          user_id: string | null
          username: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          changes_json?: Json | null
          created_at?: string
          entity_type: string
          event_id?: string | null
          id?: string
          user_id?: string | null
          username?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          changes_json?: Json | null
          created_at?: string
          entity_type?: string
          event_id?: string | null
          id?: string
          user_id?: string | null
          username?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_activity_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_approvals: {
        Row: {
          approved_changes: Json | null
          approver_email: string | null
          approver_id: string | null
          approver_role: string | null
          comment: string | null
          created_at: string
          event_id: string
          id: string
          review_token: string | null
          reviewed_at: string | null
          stage: string | null
          status: string
          submitted_at: string
          token_expires_at: string | null
        }
        Insert: {
          approved_changes?: Json | null
          approver_email?: string | null
          approver_id?: string | null
          approver_role?: string | null
          comment?: string | null
          created_at?: string
          event_id: string
          id?: string
          review_token?: string | null
          reviewed_at?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string
          token_expires_at?: string | null
        }
        Update: {
          approved_changes?: Json | null
          approver_email?: string | null
          approver_id?: string | null
          approver_role?: string | null
          comment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          review_token?: string | null
          reviewed_at?: string | null
          stage?: string | null
          status?: string
          submitted_at?: string
          token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_approvals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_blackout_dates: {
        Row: {
          all_day: boolean
          brand_kit_id: string | null
          client_id: string | null
          created_at: string
          date: string
          end_time: string | null
          id: string
          note: string
          reason: string | null
          start_time: string | null
          workspace_id: string
        }
        Insert: {
          all_day?: boolean
          brand_kit_id?: string | null
          client_id?: string | null
          created_at?: string
          date: string
          end_time?: string | null
          id?: string
          note: string
          reason?: string | null
          start_time?: string | null
          workspace_id: string
        }
        Update: {
          all_day?: boolean
          brand_kit_id?: string | null
          client_id?: string | null
          created_at?: string
          date?: string
          end_time?: string | null
          id?: string
          note?: string
          reason?: string | null
          start_time?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_blackout_dates_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blackout_dates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_blackout_dates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_campaign_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          duration_days: number
          events_json: Json
          id: string
          is_public: boolean | null
          name: string
          template_type: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days: number
          events_json: Json
          id?: string
          is_public?: boolean | null
          name: string
          template_type: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_days?: number
          events_json?: Json
          id?: string
          is_public?: boolean | null
          name?: string
          template_type?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_campaign_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_comments: {
        Row: {
          comment_text: string
          created_at: string
          event_id: string
          id: string
          mentions: string[] | null
          parent_comment_id: string | null
          updated_at: string
          user_id: string | null
          username: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          event_id: string
          id?: string
          mentions?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
          username: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          event_id?: string
          id?: string
          mentions?: string[] | null
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_comments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "calendar_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assets_json: Json | null
          assignees: string[] | null
          attempt_no: number
          auto_render: boolean | null
          brand_kit_id: string | null
          brief: string | null
          campaign_id: string | null
          caption: string | null
          channels: string[]
          client_id: string | null
          content_hash: string | null
          created_at: string
          created_by: string | null
          end_at: string | null
          error: Json | null
          eta_minutes: number | null
          hashtags: string[] | null
          id: string
          locked_at: string | null
          locked_by: string | null
          next_retry_at: string | null
          owner_id: string | null
          publish_results: Json | null
          published_at: string | null
          start_at: string | null
          status: Database["public"]["Enums"]["calendar_event_status"]
          tags: string[] | null
          timezone: string
          title: string
          updated_at: string
          version: number
          video_project_id: string | null
          video_render_settings: Json | null
          workspace_id: string
        }
        Insert: {
          assets_json?: Json | null
          assignees?: string[] | null
          attempt_no?: number
          auto_render?: boolean | null
          brand_kit_id?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          channels?: string[]
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          error?: Json | null
          eta_minutes?: number | null
          hashtags?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          next_retry_at?: string | null
          owner_id?: string | null
          publish_results?: Json | null
          published_at?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_status"]
          tags?: string[] | null
          timezone?: string
          title: string
          updated_at?: string
          version?: number
          video_project_id?: string | null
          video_render_settings?: Json | null
          workspace_id: string
        }
        Update: {
          assets_json?: Json | null
          assignees?: string[] | null
          attempt_no?: number
          auto_render?: boolean | null
          brand_kit_id?: string | null
          brief?: string | null
          campaign_id?: string | null
          caption?: string | null
          channels?: string[]
          client_id?: string | null
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          error?: Json | null
          eta_minutes?: number | null
          hashtags?: string[] | null
          id?: string
          locked_at?: string | null
          locked_by?: string | null
          next_retry_at?: string | null
          owner_id?: string | null
          publish_results?: Json | null
          published_at?: string | null
          start_at?: string | null
          status?: Database["public"]["Enums"]["calendar_event_status"]
          tags?: string[] | null
          timezone?: string
          title?: string
          updated_at?: string
          version?: number
          video_project_id?: string | null
          video_render_settings?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_video_project_id_fkey"
            columns: ["video_project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          google_calendar_connected: boolean | null
          google_calendar_id: string | null
          google_refresh_token: string | null
          google_sync_direction: string | null
          holiday_region: string | null
          id: string
          settings_json: Json | null
          slack_channel: string | null
          slack_webhook_url: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          google_calendar_connected?: boolean | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_sync_direction?: string | null
          holiday_region?: string | null
          id?: string
          settings_json?: Json | null
          slack_channel?: string | null
          slack_webhook_url?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          google_calendar_connected?: boolean | null
          google_calendar_id?: string | null
          google_refresh_token?: string | null
          google_sync_direction?: string | null
          holiday_region?: string | null
          id?: string
          settings_json?: Json | null
          slack_channel?: string | null
          slack_webhook_url?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_integrations_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_notes: {
        Row: {
          created_at: string | null
          date: string
          id: string
          note_text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: string
          note_text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: string
          note_text?: string
          user_id?: string
        }
        Relationships: []
      }
      calendar_posting_slots: {
        Row: {
          brand_kit_id: string | null
          channels: string[] | null
          client_id: string | null
          created_at: string
          day_of_week: number
          id: string
          max_posts: number | null
          time_slot: string
          workspace_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          channels?: string[] | null
          client_id?: string | null
          created_at?: string
          day_of_week: number
          id?: string
          max_posts?: number | null
          time_slot: string
          workspace_id: string
        }
        Update: {
          brand_kit_id?: string | null
          channels?: string[] | null
          client_id?: string | null
          created_at?: string
          day_of_week?: number
          id?: string
          max_posts?: number | null
          time_slot?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_posting_slots_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posting_slots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_posting_slots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_publish_logs: {
        Row: {
          at: string
          event_id: string
          id: string
          level: string
          message: string
          meta: Json | null
          workspace_id: string
        }
        Insert: {
          at?: string
          event_id: string
          id?: string
          level: string
          message: string
          meta?: Json | null
          workspace_id: string
        }
        Update: {
          at?: string
          event_id?: string
          id?: string
          level?: string
          message?: string
          meta?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_publish_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_publish_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_render_queue: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          event_id: string
          id: string
          project_id: string | null
          render_url: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_id: string
          id?: string
          project_id?: string | null
          render_url?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          event_id?: string
          id?: string
          project_id?: string | null
          render_url?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_render_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_render_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_at: string | null
          estimate_minutes: number | null
          event_id: string
          id: string
          owner_id: string | null
          parent_task_id: string | null
          priority: number
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          event_id: string
          id?: string
          owner_id?: string | null
          parent_task_id?: string | null
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_at?: string | null
          estimate_minutes?: number | null
          event_id?: string
          id?: string
          owner_id?: string | null
          parent_task_id?: string | null
          priority?: number
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "calendar_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_assets: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          kind: string
          media_library_id: string | null
          owner_note: string | null
          reuse_status: string
          source_url: string | null
          url: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          kind: string
          media_library_id?: string | null
          owner_note?: string | null
          reuse_status?: string
          source_url?: string | null
          url: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          kind?: string
          media_library_id?: string | null
          owner_note?: string | null
          reuse_status?: string
          source_url?: string | null
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_budget_approvals: {
        Row: {
          campaign_id: string
          conversation_id: string | null
          created_at: string
          estimated_total: number
          execution_expires_at: string
          id: string
          max_total: number
          pricing_version: string
          retry_budget_per_shot: number
          retry_mode: string
          scope: Json
          spent_total: number
          start_expires_at: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          conversation_id?: string | null
          created_at?: string
          estimated_total: number
          execution_expires_at: string
          id?: string
          max_total: number
          pricing_version: string
          retry_budget_per_shot?: number
          retry_mode?: string
          scope: Json
          spent_total?: number
          start_expires_at: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          conversation_id?: string | null
          created_at?: string
          estimated_total?: number
          execution_expires_at?: string
          id?: string
          max_total?: number
          pricing_version?: string
          retry_budget_per_shot?: number
          retry_mode?: string
          scope?: Json
          spent_total?: number
          start_expires_at?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_budget_approvals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_business_areas: {
        Row: {
          area: string
          campaign_id: string
          created_at: string
          evidence_urls: string[]
          id: string
          rationale: string | null
          relevance: number
          user_id: string
        }
        Insert: {
          area: string
          campaign_id: string
          created_at?: string
          evidence_urls?: string[]
          id?: string
          rationale?: string | null
          relevance: number
          user_id: string
        }
        Update: {
          area?: string
          campaign_id?: string
          created_at?: string
          evidence_urls?: string[]
          id?: string
          rationale?: string | null
          relevance?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_business_areas_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_facts: {
        Row: {
          campaign_id: string
          category: string
          created_at: string
          fact: string
          id: string
          is_hypothesis: boolean
          source_id: string | null
          source_url: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          category: string
          created_at?: string
          fact: string
          id?: string
          is_hypothesis?: boolean
          source_id?: string | null
          source_url?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          category?: string
          created_at?: string
          fact?: string
          id?: string
          is_hypothesis?: boolean
          source_id?: string | null
          source_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_facts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_facts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "campaign_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_media: {
        Row: {
          assigned_to_post_id: string | null
          campaign_id: string
          file_size_bytes: number | null
          id: string
          media_type: string
          mime_type: string | null
          public_url: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          assigned_to_post_id?: string | null
          campaign_id: string
          file_size_bytes?: number | null
          id?: string
          media_type: string
          mime_type?: string | null
          public_url: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          assigned_to_post_id?: string | null
          campaign_id?: string
          file_size_bytes?: number | null
          id?: string
          media_type?: string
          mime_type?: string | null
          public_url?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_media_assigned_to_post_id_fkey"
            columns: ["assigned_to_post_id"]
            isOneToOne: false
            referencedRelation: "campaign_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_pillars: {
        Row: {
          campaign_id: string
          created_at: string
          evidence_urls: string[]
          id: string
          name: string
          rank: number
          relevance: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          evidence_urls?: string[]
          id?: string
          name: string
          rank: number
          relevance?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          evidence_urls?: string[]
          id?: string
          name?: string
          rank?: number
          relevance?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_pillars_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_posts: {
        Row: {
          best_time: string | null
          campaign_id: string
          caption_outline: string
          created_at: string
          cta: string | null
          day: string
          generated_caption_id: string | null
          hashtags: Json
          id: string
          media_storage_path: string | null
          media_title: string | null
          media_type: string | null
          media_url: string | null
          post_type: string
          title: string
          week_number: number
        }
        Insert: {
          best_time?: string | null
          campaign_id: string
          caption_outline: string
          created_at?: string
          cta?: string | null
          day: string
          generated_caption_id?: string | null
          hashtags?: Json
          id?: string
          media_storage_path?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
          post_type: string
          title: string
          week_number: number
        }
        Update: {
          best_time?: string | null
          campaign_id?: string
          caption_outline?: string
          created_at?: string
          cta?: string | null
          day?: string
          generated_caption_id?: string | null
          hashtags?: Json
          id?: string
          media_storage_path?: string | null
          media_title?: string | null
          media_type?: string | null
          media_url?: string | null
          post_type?: string
          title?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_posts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_roi: {
        Row: {
          budget_spent: number | null
          campaign_name: string
          conversions: number | null
          created_at: string
          end_date: string | null
          id: string
          platform: string
          revenue: number | null
          roi_percent: number | null
          start_date: string
          total_engagement: number | null
          total_reach: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_spent?: number | null
          campaign_name: string
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          platform: string
          revenue?: number | null
          roi_percent?: number | null
          start_date: string
          total_engagement?: number | null
          total_reach?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_spent?: number | null
          campaign_name?: string
          conversions?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          platform?: string
          revenue?: number | null
          roi_percent?: number | null
          start_date?: string
          total_engagement?: number | null
          total_reach?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      campaign_shot_attempts: {
        Row: {
          analysis_copy_url: string | null
          attempt_no: number
          campaign_id: string
          client_ready: boolean | null
          cost_charged: number | null
          created_at: string
          failure_class: string | null
          generation_id: string | null
          id: string
          model: string | null
          prompt: string | null
          qa_analysis_source: string | null
          qa_issues: Json | null
          qa_scores: Json | null
          qa_superseded: Json
          qa_verdict: string | null
          shot_id: string
          user_id: string
        }
        Insert: {
          analysis_copy_url?: string | null
          attempt_no: number
          campaign_id: string
          client_ready?: boolean | null
          cost_charged?: number | null
          created_at?: string
          failure_class?: string | null
          generation_id?: string | null
          id?: string
          model?: string | null
          prompt?: string | null
          qa_analysis_source?: string | null
          qa_issues?: Json | null
          qa_scores?: Json | null
          qa_superseded?: Json
          qa_verdict?: string | null
          shot_id: string
          user_id: string
        }
        Update: {
          analysis_copy_url?: string | null
          attempt_no?: number
          campaign_id?: string
          client_ready?: boolean | null
          cost_charged?: number | null
          created_at?: string
          failure_class?: string | null
          generation_id?: string | null
          id?: string
          model?: string | null
          prompt?: string | null
          qa_analysis_source?: string | null
          qa_issues?: Json | null
          qa_scores?: Json | null
          qa_superseded?: Json
          qa_verdict?: string | null
          shot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_shot_attempts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_shot_attempts_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "campaign_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_shots: {
        Row: {
          aspect_ratio: string | null
          asset_id: string | null
          attempt_count: number
          campaign_id: string
          client_ready: boolean | null
          content_category: string | null
          created_at: string
          current_generation_id: string | null
          description: string
          duration_s: number | null
          end_s: number
          english_prompt: string | null
          estimated_cost: number | null
          generation_mode: string | null
          human_anatomy_risk: number | null
          id: string
          identity_consistency_requirement: number | null
          input_asset_id: string | null
          motion_complexity: number | null
          negative_constraints: string | null
          on_screen_text: string | null
          physics_risk: number | null
          purpose: string
          qa_attempts: number
          qa_claim_id: string | null
          qa_claimed_at: string | null
          qa_error: string | null
          qa_stats_generation_id: string | null
          qa_summary: Json | null
          reference_strength: number | null
          resolution: string | null
          retry_model: string | null
          retry_prepared_at: string | null
          retry_prompt: string | null
          retry_reason: string | null
          routing_rationale: Json | null
          selected_model: string | null
          shot_index: number
          shot_type: string
          start_s: number
          status: string
          subject_emphasis: string
          text_requirement: number | null
          updated_at: string
          user_id: string
          video_id: string
          voiceover: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          asset_id?: string | null
          attempt_count?: number
          campaign_id: string
          client_ready?: boolean | null
          content_category?: string | null
          created_at?: string
          current_generation_id?: string | null
          description: string
          duration_s?: number | null
          end_s: number
          english_prompt?: string | null
          estimated_cost?: number | null
          generation_mode?: string | null
          human_anatomy_risk?: number | null
          id?: string
          identity_consistency_requirement?: number | null
          input_asset_id?: string | null
          motion_complexity?: number | null
          negative_constraints?: string | null
          on_screen_text?: string | null
          physics_risk?: number | null
          purpose: string
          qa_attempts?: number
          qa_claim_id?: string | null
          qa_claimed_at?: string | null
          qa_error?: string | null
          qa_stats_generation_id?: string | null
          qa_summary?: Json | null
          reference_strength?: number | null
          resolution?: string | null
          retry_model?: string | null
          retry_prepared_at?: string | null
          retry_prompt?: string | null
          retry_reason?: string | null
          routing_rationale?: Json | null
          selected_model?: string | null
          shot_index: number
          shot_type: string
          start_s: number
          status?: string
          subject_emphasis: string
          text_requirement?: number | null
          updated_at?: string
          user_id: string
          video_id: string
          voiceover?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          asset_id?: string | null
          attempt_count?: number
          campaign_id?: string
          client_ready?: boolean | null
          content_category?: string | null
          created_at?: string
          current_generation_id?: string | null
          description?: string
          duration_s?: number | null
          end_s?: number
          english_prompt?: string | null
          estimated_cost?: number | null
          generation_mode?: string | null
          human_anatomy_risk?: number | null
          id?: string
          identity_consistency_requirement?: number | null
          input_asset_id?: string | null
          motion_complexity?: number | null
          negative_constraints?: string | null
          on_screen_text?: string | null
          physics_risk?: number | null
          purpose?: string
          qa_attempts?: number
          qa_claim_id?: string | null
          qa_claimed_at?: string | null
          qa_error?: string | null
          qa_stats_generation_id?: string | null
          qa_summary?: Json | null
          reference_strength?: number | null
          resolution?: string | null
          retry_model?: string | null
          retry_prepared_at?: string | null
          retry_prompt?: string | null
          retry_reason?: string | null
          routing_rationale?: Json | null
          selected_model?: string | null
          shot_index?: number
          shot_type?: string
          start_s?: number
          status?: string
          subject_emphasis?: string
          text_requirement?: number | null
          updated_at?: string
          user_id?: string
          video_id?: string
          voiceover?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_shots_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "campaign_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_shots_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_shots_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "campaign_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_similarity_checks: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          judge: Json | null
          reason: string | null
          revision_round: number
          scores: Json
          user_id: string
          verdict: string
          video_a: number
          video_b: number
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          judge?: Json | null
          reason?: string | null
          revision_round: number
          scores: Json
          user_id: string
          verdict: string
          video_a: number
          video_b: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          judge?: Json | null
          reason?: string | null
          revision_round?: number
          scores?: Json
          user_id?: string
          verdict?: string
          video_a?: number
          video_b?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_similarity_checks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_social_profiles: {
        Row: {
          access_note: string | null
          analyzed_at: string | null
          campaign_id: string
          content_gaps: string[]
          content_themes: string[]
          created_at: string
          discovery_evidence: Json
          discovery_source: string | null
          discovery_via: string | null
          found: boolean
          id: string
          performance_signals: string | null
          platform: string
          profile_url: string | null
          recent_posts: Json
          status: string
          strongest_formats: string | null
          updated_at: string
          user_id: string
          visual_style: string | null
        }
        Insert: {
          access_note?: string | null
          analyzed_at?: string | null
          campaign_id: string
          content_gaps?: string[]
          content_themes?: string[]
          created_at?: string
          discovery_evidence?: Json
          discovery_source?: string | null
          discovery_via?: string | null
          found?: boolean
          id?: string
          performance_signals?: string | null
          platform: string
          profile_url?: string | null
          recent_posts?: Json
          status?: string
          strongest_formats?: string | null
          updated_at?: string
          user_id: string
          visual_style?: string | null
        }
        Update: {
          access_note?: string | null
          analyzed_at?: string | null
          campaign_id?: string
          content_gaps?: string[]
          content_themes?: string[]
          created_at?: string
          discovery_evidence?: Json
          discovery_source?: string | null
          discovery_via?: string | null
          found?: boolean
          id?: string
          performance_signals?: string | null
          platform?: string
          profile_url?: string | null
          recent_posts?: Json
          status?: string
          strongest_formats?: string | null
          updated_at?: string
          user_id?: string
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_social_profiles_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sources: {
        Row: {
          campaign_id: string
          created_at: string
          excerpt: string | null
          fetched_at: string
          id: string
          title: string | null
          url: string
          user_id: string
          via: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          title?: string | null
          url: string
          user_id: string
          via: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          excerpt?: string | null
          fetched_at?: string
          id?: string
          title?: string | null
          url?: string
          user_id?: string
          via?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sources_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_spend_ledger: {
        Row: {
          amount: number
          approval_id: string
          created_at: string
          entry_type: string
          generation_id: string | null
          id: string
          idempotency_key: string
          shot_id: string | null
        }
        Insert: {
          amount: number
          approval_id: string
          created_at?: string
          entry_type: string
          generation_id?: string | null
          id?: string
          idempotency_key: string
          shot_id?: string | null
        }
        Update: {
          amount?: number
          approval_id?: string
          created_at?: string
          entry_type?: string
          generation_id?: string | null
          id?: string
          idempotency_key?: string
          shot_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_spend_ledger_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "campaign_budget_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_spend_ledger_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "campaign_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_videos: {
        Row: {
          business_area: string
          campaign_id: string
          commercial_objective: string
          concept: string
          created_at: string
          cta: string
          emotional_angle: string
          funnel_stage: string
          hero_subject: string
          hook_text: string
          hook_type: string
          id: string
          main_message: string
          pillar: string
          primary_goal: string
          rationale: string
          script: Json | null
          series_key: string | null
          shot_structure: string[]
          target_audience: string
          title: string
          updated_at: string
          user_id: string
          video_index: number
          visual_style: string
        }
        Insert: {
          business_area: string
          campaign_id: string
          commercial_objective: string
          concept: string
          created_at?: string
          cta: string
          emotional_angle: string
          funnel_stage: string
          hero_subject: string
          hook_text: string
          hook_type: string
          id?: string
          main_message: string
          pillar: string
          primary_goal: string
          rationale: string
          script?: Json | null
          series_key?: string | null
          shot_structure?: string[]
          target_audience: string
          title: string
          updated_at?: string
          user_id: string
          video_index: number
          visual_style: string
        }
        Update: {
          business_area?: string
          campaign_id?: string
          commercial_objective?: string
          concept?: string
          created_at?: string
          cta?: string
          emotional_angle?: string
          funnel_stage?: string
          hero_subject?: string
          hook_text?: string
          hook_type?: string
          id?: string
          main_message?: string
          pillar?: string
          primary_goal?: string
          rationale?: string
          script?: Json | null
          series_key?: string | null
          shot_structure?: string[]
          target_audience?: string
          title?: string
          updated_at?: string
          user_id?: string
          video_index?: number
          visual_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_videos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "agent_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ai_json: Json
          audience: string | null
          brand_kit_id: string | null
          created_at: string
          duration_weeks: number
          ends_at: string | null
          goal: string
          id: string
          pauses_strategy: boolean
          platform: Json
          post_frequency: number
          starts_at: string | null
          summary: string | null
          title: string
          tone: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_json?: Json
          audience?: string | null
          brand_kit_id?: string | null
          created_at?: string
          duration_weeks: number
          ends_at?: string | null
          goal: string
          id?: string
          pauses_strategy?: boolean
          platform?: Json
          post_frequency?: number
          starts_at?: string | null
          summary?: string | null
          title: string
          tone: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_json?: Json
          audience?: string | null
          brand_kit_id?: string | null
          created_at?: string
          duration_weeks?: number
          ends_at?: string | null
          goal?: string
          id?: string
          pauses_strategy?: boolean
          platform?: Json
          post_frequency?: number
          starts_at?: string | null
          summary?: string | null
          title?: string
          tone?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      captions: {
        Row: {
          caption_text: string
          created_at: string | null
          hashtags: string[]
          id: string
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          caption_text: string
          created_at?: string | null
          hashtags: string[]
          id?: string
          language: string
          platform: string
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          caption_text?: string
          created_at?: string | null
          hashtags?: string[]
          id?: string
          language?: string
          platform?: string
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "captions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_assets: {
        Row: {
          created_at: string
          exported_pdf_url: string | null
          exported_png_url: string | null
          id: string
          image_url: string | null
          project_id: string
          slide_index: number
        }
        Insert: {
          created_at?: string
          exported_pdf_url?: string | null
          exported_png_url?: string | null
          id?: string
          image_url?: string | null
          project_id: string
          slide_index: number
        }
        Update: {
          created_at?: string
          exported_pdf_url?: string | null
          exported_png_url?: string | null
          id?: string
          image_url?: string | null
          project_id?: string
          slide_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "carousel_assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "carousel_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      carousel_projects: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          design_json: Json
          has_watermark: boolean
          id: string
          language: string
          outline_json: Json
          platform: string
          slide_count: number
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          design_json?: Json
          has_watermark?: boolean
          id?: string
          language?: string
          outline_json?: Json
          platform?: string
          slide_count?: number
          template?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          design_json?: Json
          has_watermark?: boolean
          id?: string
          language?: string
          outline_json?: Json
          platform?: string
          slide_count?: number
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carousel_projects_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      character_catalog_previews: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          prompt: string | null
          storage_path: string | null
          theme_pack: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack?: string
        }
        Relationships: []
      }
      character_marketplace_consents: {
        Row: {
          character_id: string
          consents: Json
          created_at: string
          id: string
          ip_hash: string | null
          legal_version: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          character_id: string
          consents: Json
          created_at?: string
          id?: string
          ip_hash?: string | null
          legal_version: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          character_id?: string
          consents?: Json
          created_at?: string
          id?: string
          ip_hash?: string | null
          legal_version?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_marketplace_consents_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_marketplace_ratings: {
        Row: {
          character_id: string
          created_at: string
          id: string
          rating: number
          review_text: string | null
          user_id: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          user_id: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_marketplace_ratings_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_marketplace_reports: {
        Row: {
          character_id: string
          created_at: string
          description: string | null
          id: string
          reason: string
          reporter_email: string | null
          reporter_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          character_id: string
          created_at?: string
          description?: string | null
          id?: string
          reason: string
          reporter_email?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          character_id?: string
          created_at?: string
          description?: string | null
          id?: string
          reason?: string
          reporter_email?: string | null
          reporter_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_marketplace_reports_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_purchases: {
        Row: {
          buyer_user_id: string
          character_id: string
          creator_earned_credits: number
          creator_user_id: string | null
          id: string
          license_accepted_at: string
          license_ip_hash: string | null
          license_version: string
          platform_fee_credits: number
          price_credits: number
          pricing_type: string
          purchased_at: string
          refunded_at: string | null
        }
        Insert: {
          buyer_user_id: string
          character_id: string
          creator_earned_credits?: number
          creator_user_id?: string | null
          id?: string
          license_accepted_at?: string
          license_ip_hash?: string | null
          license_version: string
          platform_fee_credits?: number
          price_credits?: number
          pricing_type: string
          purchased_at?: string
          refunded_at?: string | null
        }
        Update: {
          buyer_user_id?: string
          character_id?: string
          creator_earned_credits?: number
          creator_user_id?: string | null
          id?: string
          license_accepted_at?: string
          license_ip_hash?: string | null
          license_version?: string
          platform_fee_credits?: number
          price_credits?: number
          pricing_type?: string
          purchased_at?: string
          refunded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "character_purchases_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      circuit_breaker_state: {
        Row: {
          failure_count: number | null
          last_failure_at: string | null
          last_state_change: string | null
          service_name: string
          state: string
          updated_at: string | null
        }
        Insert: {
          failure_count?: number | null
          last_failure_at?: string | null
          last_state_change?: string | null
          service_name: string
          state: string
          updated_at?: string | null
        }
        Update: {
          failure_count?: number | null
          last_failure_at?: string | null
          last_state_change?: string | null
          service_name?: string
          state?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          settings_json: Json | null
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          settings_json?: Json | null
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          settings_json?: Json | null
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cloud_storage_connections: {
        Row: {
          access_token_encrypted: string | null
          account_email: string | null
          account_name: string | null
          auto_sync: boolean
          created_at: string
          folder_id: string | null
          folder_name: string | null
          id: string
          is_active: boolean
          provider: string
          quota_bytes: number | null
          refresh_token_encrypted: string | null
          token_expires_at: string | null
          updated_at: string
          used_bytes: number | null
          user_id: string
        }
        Insert: {
          access_token_encrypted?: string | null
          account_email?: string | null
          account_name?: string | null
          auto_sync?: boolean
          created_at?: string
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          quota_bytes?: number | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          used_bytes?: number | null
          user_id: string
        }
        Update: {
          access_token_encrypted?: string | null
          account_email?: string | null
          account_name?: string | null
          auto_sync?: boolean
          created_at?: string
          folder_id?: string | null
          folder_name?: string | null
          id?: string
          is_active?: boolean
          provider?: string
          quota_bytes?: number | null
          refresh_token_encrypted?: string | null
          token_expires_at?: string | null
          updated_at?: string
          used_bytes?: number | null
          user_id?: string
        }
        Relationships: []
      }
      coach_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "coach_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_sessions: {
        Row: {
          created_at: string
          id: string
          language: string
          mode: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string
          mode?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string
          mode?: string
          user_id?: string
        }
        Relationships: []
      }
      collaboration_posts: {
        Row: {
          created_at: string
          description: string
          id: string
          skills_needed: string[]
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          skills_needed?: string[]
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          skills_needed?: string[]
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_analysis: {
        Row: {
          action: string | null
          analysis_version: number | null
          comment_id: string
          intent: string | null
          language: string | null
          priority_score: number | null
          reply_suggestions: Json | null
          sentiment: string | null
          topics: string[] | null
          toxicity: string | null
          updated_at: string
          urgency: string | null
        }
        Insert: {
          action?: string | null
          analysis_version?: number | null
          comment_id: string
          intent?: string | null
          language?: string | null
          priority_score?: number | null
          reply_suggestions?: Json | null
          sentiment?: string | null
          topics?: string[] | null
          toxicity?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          action?: string | null
          analysis_version?: number | null
          comment_id?: string
          intent?: string | null
          language?: string | null
          priority_score?: number | null
          reply_suggestions?: Json | null
          sentiment?: string | null
          topics?: string[] | null
          toxicity?: string | null
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "comment_analysis_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_faqs: {
        Row: {
          answer: string
          created_at: string
          frequency: number
          id: string
          question: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer: string
          created_at?: string
          frequency?: number
          id?: string
          question: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer?: string
          created_at?: string
          frequency?: number
          id?: string
          question?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      comment_sources: {
        Row: {
          account_handle: string | null
          created_at: string
          external_account_id: string | null
          id: string
          platform: string
          project_id: string
        }
        Insert: {
          account_handle?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform: string
          project_id: string
        }
        Update: {
          account_handle?: string | null
          created_at?: string
          external_account_id?: string | null
          id?: string
          platform?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_sources_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          created_at_platform: string | null
          external_comment_id: string | null
          fingerprint: string | null
          id: string
          ingested_at: string
          labels: string[] | null
          language: string | null
          project_id: string
          source_id: string | null
          status: string
          text: string
          user_id_external: string | null
          username: string
        }
        Insert: {
          created_at_platform?: string | null
          external_comment_id?: string | null
          fingerprint?: string | null
          id?: string
          ingested_at?: string
          labels?: string[] | null
          language?: string | null
          project_id: string
          source_id?: string | null
          status?: string
          text: string
          user_id_external?: string | null
          username: string
        }
        Update: {
          created_at_platform?: string | null
          external_comment_id?: string | null
          fingerprint?: string | null
          id?: string
          ingested_at?: string
          labels?: string[] | null
          language?: string | null
          project_id?: string
          source_id?: string | null
          status?: string
          text?: string
          user_id_external?: string | null
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "comment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      community_audit_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      community_channels: {
        Row: {
          allowed_user_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          moderation_rules: Json
          name: string
          topic: string
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          allowed_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          moderation_rules?: Json
          name: string
          topic: string
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          allowed_user_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          moderation_rules?: Json
          name?: string
          topic?: string
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_channels_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      community_message_tags: {
        Row: {
          created_at: string
          id: string
          tag: string
          usage_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          tag: string
          usage_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          tag?: string
          usage_count?: number
        }
        Relationships: []
      }
      community_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          id: string
          is_spotlight: boolean
          moderated_at: string | null
          moderation_status: string
          tags: string[]
          user_id: string
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string
          id?: string
          is_spotlight?: boolean
          moderated_at?: string | null
          moderation_status?: string
          tags?: string[]
          user_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          id?: string
          is_spotlight?: boolean
          moderated_at?: string | null
          moderation_status?: string
          tags?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_conversations: {
        Row: {
          context_type: string | null
          created_at: string
          id: string
          is_active: boolean | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          context_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          context_type?: string | null
          created_at?: string
          id?: string
          is_active?: boolean | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "companion_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_triggers: {
        Row: {
          category: string
          converted_at: string | null
          dismissed_at: string | null
          id: string
          metadata: Json
          shown_at: string
          trigger_key: string
          user_id: string
        }
        Insert: {
          category: string
          converted_at?: string | null
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          shown_at?: string
          trigger_key: string
          user_id: string
        }
        Update: {
          category?: string
          converted_at?: string | null
          dismissed_at?: string | null
          id?: string
          metadata?: Json
          shown_at?: string
          trigger_key?: string
          user_id?: string
        }
        Relationships: []
      }
      companion_user_preferences: {
        Row: {
          created_at: string
          features_introduced: Json | null
          id: string
          interaction_count: number | null
          last_interaction_at: string | null
          onboarding_completed: boolean | null
          preferences: Json | null
          preferred_language: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          features_introduced?: Json | null
          id?: string
          interaction_count?: number | null
          last_interaction_at?: string | null
          onboarding_completed?: boolean | null
          preferences?: Json | null
          preferred_language?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          features_introduced?: Json | null
          id?: string
          interaction_count?: number | null
          last_interaction_at?: string | null
          onboarding_completed?: boolean | null
          preferences?: Json | null
          preferred_language?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      compare_lab_outputs: {
        Row: {
          ai_judge_score: number | null
          completed_at: string | null
          cost_euros: number | null
          created_at: string
          duration_seconds: number | null
          engine: string
          error_message: string | null
          generation_id: string | null
          id: string
          is_ai_pick: boolean
          is_user_winner: boolean
          metadata: Json | null
          model: string
          run_id: string
          status: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          user_note: string | null
          user_rating: number | null
          video_url: string | null
        }
        Insert: {
          ai_judge_score?: number | null
          completed_at?: string | null
          cost_euros?: number | null
          created_at?: string
          duration_seconds?: number | null
          engine: string
          error_message?: string | null
          generation_id?: string | null
          id?: string
          is_ai_pick?: boolean
          is_user_winner?: boolean
          metadata?: Json | null
          model: string
          run_id: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          user_note?: string | null
          user_rating?: number | null
          video_url?: string | null
        }
        Update: {
          ai_judge_score?: number | null
          completed_at?: string | null
          cost_euros?: number | null
          created_at?: string
          duration_seconds?: number | null
          engine?: string
          error_message?: string | null
          generation_id?: string | null
          id?: string
          is_ai_pick?: boolean
          is_user_winner?: boolean
          metadata?: Json | null
          model?: string
          run_id?: string
          status?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          user_note?: string | null
          user_rating?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compare_lab_outputs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "compare_lab_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      compare_lab_runs: {
        Row: {
          ai_judge_completed_at: string | null
          ai_judge_reasoning: string | null
          ai_judge_scores: Json | null
          ai_judge_winner_engine: string | null
          aspect_ratio: string
          completed_at: string | null
          composer_scene_id: string | null
          created_at: string
          currency: string
          duration_seconds: number
          engines: string[]
          id: string
          metadata: Json | null
          prompt: string
          prompt_slots: Json | null
          source_image_url: string | null
          status: string
          total_cost_euros: number | null
          updated_at: string
          user_id: string
          user_winner_engine: string | null
        }
        Insert: {
          ai_judge_completed_at?: string | null
          ai_judge_reasoning?: string | null
          ai_judge_scores?: Json | null
          ai_judge_winner_engine?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          composer_scene_id?: string | null
          created_at?: string
          currency?: string
          duration_seconds?: number
          engines?: string[]
          id?: string
          metadata?: Json | null
          prompt: string
          prompt_slots?: Json | null
          source_image_url?: string | null
          status?: string
          total_cost_euros?: number | null
          updated_at?: string
          user_id: string
          user_winner_engine?: string | null
        }
        Update: {
          ai_judge_completed_at?: string | null
          ai_judge_reasoning?: string | null
          ai_judge_scores?: Json | null
          ai_judge_winner_engine?: string | null
          aspect_ratio?: string
          completed_at?: string | null
          composer_scene_id?: string | null
          created_at?: string
          currency?: string
          duration_seconds?: number
          engines?: string[]
          id?: string
          metadata?: Json | null
          prompt?: string
          prompt_slots?: Json | null
          source_image_url?: string | null
          status?: string
          total_cost_euros?: number | null
          updated_at?: string
          user_id?: string
          user_winner_engine?: string | null
        }
        Relationships: []
      }
      composer_callback_observations: {
        Row: {
          details: Json
          external_job_id: string | null
          handler: string
          id: string
          observed_at: string
          pipeline_job_id: string | null
          plate_generation: number | null
          run_id: string | null
          scene_id: string | null
          stage: string | null
          verdict: string
        }
        Insert: {
          details?: Json
          external_job_id?: string | null
          handler: string
          id?: string
          observed_at?: string
          pipeline_job_id?: string | null
          plate_generation?: number | null
          run_id?: string | null
          scene_id?: string | null
          stage?: string | null
          verdict: string
        }
        Update: {
          details?: Json
          external_job_id?: string | null
          handler?: string
          id?: string
          observed_at?: string
          pipeline_job_id?: string | null
          plate_generation?: number | null
          run_id?: string | null
          scene_id?: string | null
          stage?: string | null
          verdict?: string
        }
        Relationships: []
      }
      composer_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_at: string
          invited_by: string | null
          invited_email: string | null
          project_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string | null
          project_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_at?: string
          invited_by?: string | null
          invited_email?: string | null
          project_id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_continuity_queue: {
        Row: {
          attempts: number
          created_at: string
          dispatched_at: string | null
          expires_at: string
          id: string
          last_error: string | null
          payload: Json
          predecessor_scene_id: string
          project_id: string
          scene_id: string
          status: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          expires_at?: string
          id?: string
          last_error?: string | null
          payload: Json
          predecessor_scene_id: string
          project_id: string
          scene_id: string
          status?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dispatched_at?: string | null
          expires_at?: string
          id?: string
          last_error?: string | null
          payload?: Json
          predecessor_scene_id?: string
          project_id?: string
          scene_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_continuity_queue_predecessor_scene_id_fkey"
            columns: ["predecessor_scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_continuity_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_continuity_queue_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_drift_checks: {
        Row: {
          anchor_image_url: string | null
          anchor_scene_id: string | null
          candidate_image_url: string | null
          candidate_scene_id: string | null
          created_at: string
          drift_score: number | null
          id: string
          label: string | null
          metadata: Json
          project_id: string
          recommendation: string | null
          repair_action: string | null
          repaired: boolean
        }
        Insert: {
          anchor_image_url?: string | null
          anchor_scene_id?: string | null
          candidate_image_url?: string | null
          candidate_scene_id?: string | null
          created_at?: string
          drift_score?: number | null
          id?: string
          label?: string | null
          metadata?: Json
          project_id: string
          recommendation?: string | null
          repair_action?: string | null
          repaired?: boolean
        }
        Update: {
          anchor_image_url?: string | null
          anchor_scene_id?: string | null
          candidate_image_url?: string | null
          candidate_scene_id?: string | null
          created_at?: string
          drift_score?: number | null
          id?: string
          label?: string | null
          metadata?: Json
          project_id?: string
          recommendation?: string | null
          repair_action?: string | null
          repaired?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "composer_drift_checks_anchor_scene_id_fkey"
            columns: ["anchor_scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_drift_checks_candidate_scene_id_fkey"
            columns: ["candidate_scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_drift_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_exports: {
        Row: {
          actual_cost_euros: number | null
          aspect_ratio: string
          batch_id: string | null
          completed_at: string | null
          created_at: string
          error_message: string | null
          estimated_cost_euros: number | null
          height: number
          id: string
          platform: string
          preset_key: string
          project_id: string
          render_id: string | null
          status: string
          updated_at: string
          user_id: string
          video_url: string | null
          width: number
        }
        Insert: {
          actual_cost_euros?: number | null
          aspect_ratio: string
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost_euros?: number | null
          height: number
          id?: string
          platform: string
          preset_key: string
          project_id: string
          render_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
          video_url?: string | null
          width: number
        }
        Update: {
          actual_cost_euros?: number | null
          aspect_ratio?: string
          batch_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          estimated_cost_euros?: number | null
          height?: number
          id?: string
          platform?: string
          preset_key?: string
          project_id?: string
          render_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          video_url?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "composer_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_nle_exports: {
        Row: {
          created_at: string
          expires_at: string
          file_size_bytes: number
          format: string
          id: string
          project_id: string
          scene_count: number
          storage_path: string
          total_duration_sec: number
          user_id: string
          warnings: Json
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_size_bytes?: number
          format: string
          id?: string
          project_id: string
          scene_count?: number
          storage_path: string
          total_duration_sec?: number
          user_id: string
          warnings?: Json
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_size_bytes?: number
          format?: string
          id?: string
          project_id?: string
          scene_count?: number
          storage_path?: string
          total_duration_sec?: number
          user_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "composer_nle_exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_pipeline_jobs: {
        Row: {
          attempt_no: number
          callback_claim_expires_at: string | null
          callback_claim_token: string | null
          callback_claimed_at: string | null
          callback_delivery_status: string | null
          completed_at: string | null
          created_at: string
          error_code: string | null
          external_job_id: string | null
          id: string
          idempotency_key: string
          last_heartbeat_at: string | null
          metadata: Json
          payload_hash: string | null
          plate_generation: number | null
          provider: string | null
          replaced_by: string | null
          run_contract_version: number
          run_id: string
          scene_id: string
          segment_id: string | null
          speaker_id: string | null
          stage: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_no?: number
          callback_claim_expires_at?: string | null
          callback_claim_token?: string | null
          callback_claimed_at?: string | null
          callback_delivery_status?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          external_job_id?: string | null
          id?: string
          idempotency_key: string
          last_heartbeat_at?: string | null
          metadata?: Json
          payload_hash?: string | null
          plate_generation?: number | null
          provider?: string | null
          replaced_by?: string | null
          run_contract_version?: number
          run_id: string
          scene_id: string
          segment_id?: string | null
          speaker_id?: string | null
          stage: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_no?: number
          callback_claim_expires_at?: string | null
          callback_claim_token?: string | null
          callback_claimed_at?: string | null
          callback_delivery_status?: string | null
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          external_job_id?: string | null
          id?: string
          idempotency_key?: string
          last_heartbeat_at?: string | null
          metadata?: Json
          payload_hash?: string | null
          plate_generation?: number | null
          provider?: string | null
          replaced_by?: string | null
          run_contract_version?: number
          run_id?: string
          scene_id?: string
          segment_id?: string | null
          speaker_id?: string | null
          stage?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_pipeline_jobs_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "composer_pipeline_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_pipeline_jobs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_pipeline_runs: {
        Row: {
          allow_partial: boolean | null
          completed_at: string | null
          completed_scenes: number
          created_at: string | null
          destination: string | null
          director_cut_project_id: string | null
          error_message: string | null
          failed_scenes: number
          id: string
          project_id: string
          started_at: string | null
          status: string
          stitched_video_url: string | null
          total_scenes: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          allow_partial?: boolean | null
          completed_at?: string | null
          completed_scenes?: number
          created_at?: string | null
          destination?: string | null
          director_cut_project_id?: string | null
          error_message?: string | null
          failed_scenes?: number
          id?: string
          project_id: string
          started_at?: string | null
          status?: string
          stitched_video_url?: string | null
          total_scenes?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          allow_partial?: boolean | null
          completed_at?: string | null
          completed_scenes?: number
          created_at?: string | null
          destination?: string | null
          director_cut_project_id?: string | null
          error_message?: string | null
          failed_scenes?: number
          id?: string
          project_id?: string
          started_at?: string | null
          status?: string
          stitched_video_url?: string | null
          total_scenes?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_pipeline_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_plan_drift_reports: {
        Row: {
          created_at: string
          findings: Json
          id: string
          plan_version: number | null
          project_id: string
          severity: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          findings?: Json
          id?: string
          plan_version?: number | null
          project_id: string
          severity?: string
          snapshot?: Json
        }
        Update: {
          created_at?: string
          findings?: Json
          id?: string
          plan_version?: number | null
          project_id?: string
          severity?: string
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "composer_plan_drift_reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_production_plans: {
        Row: {
          created_at: string
          id: string
          manifest: Json
          parser_meta: Json
          project_id: string | null
          source_text: string
          unresolved: Json
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          manifest: Json
          parser_meta?: Json
          project_id?: string | null
          source_text: string
          unresolved?: Json
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          manifest?: Json
          parser_meta?: Json
          project_id?: string | null
          source_text?: string
          unresolved?: Json
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
      composer_projects: {
        Row: {
          ad_compliance_acknowledged: boolean
          ad_compliance_acknowledged_at: string | null
          ad_format: string | null
          ad_framework: string | null
          ad_goal: string | null
          ad_meta: Json | null
          ad_tonality: string | null
          ad_variant_strategy: string | null
          assembly_config: Json
          auto_director_config: Json | null
          brand_kit_auto_sync: boolean
          brand_kit_id: string | null
          briefing: Json
          category: string
          created_at: string
          cutdown_type: string | null
          id: string
          is_test_run: boolean
          language: string
          origin: string
          output_url: string | null
          parent_project_id: string | null
          smart_reframe_enabled: boolean
          status: string
          storyboard: Json
          thumbnail_url: string | null
          title: string
          total_cost_euros: number
          updated_at: string
          user_id: string
          video_mode: string | null
        }
        Insert: {
          ad_compliance_acknowledged?: boolean
          ad_compliance_acknowledged_at?: string | null
          ad_format?: string | null
          ad_framework?: string | null
          ad_goal?: string | null
          ad_meta?: Json | null
          ad_tonality?: string | null
          ad_variant_strategy?: string | null
          assembly_config?: Json
          auto_director_config?: Json | null
          brand_kit_auto_sync?: boolean
          brand_kit_id?: string | null
          briefing?: Json
          category?: string
          created_at?: string
          cutdown_type?: string | null
          id?: string
          is_test_run?: boolean
          language?: string
          origin?: string
          output_url?: string | null
          parent_project_id?: string | null
          smart_reframe_enabled?: boolean
          status?: string
          storyboard?: Json
          thumbnail_url?: string | null
          title?: string
          total_cost_euros?: number
          updated_at?: string
          user_id: string
          video_mode?: string | null
        }
        Update: {
          ad_compliance_acknowledged?: boolean
          ad_compliance_acknowledged_at?: string | null
          ad_format?: string | null
          ad_framework?: string | null
          ad_goal?: string | null
          ad_meta?: Json | null
          ad_tonality?: string | null
          ad_variant_strategy?: string | null
          assembly_config?: Json
          auto_director_config?: Json | null
          brand_kit_auto_sync?: boolean
          brand_kit_id?: string | null
          briefing?: Json
          category?: string
          created_at?: string
          cutdown_type?: string | null
          id?: string
          is_test_run?: boolean
          language?: string
          origin?: string
          output_url?: string | null
          parent_project_id?: string | null
          smart_reframe_enabled?: boolean
          status?: string
          storyboard?: Json
          thumbnail_url?: string | null
          title?: string
          total_cost_euros?: number
          updated_at?: string
          user_id?: string
          video_mode?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "composer_projects_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_projects_parent_project_id_fkey"
            columns: ["parent_project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_run_reservations: {
        Row: {
          actual_euros: number | null
          created_at: string
          id: string
          metadata: Json
          project_id: string | null
          reason: string | null
          reserved_euros: number
          run_ids: string[]
          scene_ids: string[]
          settled_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          actual_euros?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          reason?: string | null
          reserved_euros: number
          run_ids?: string[]
          scene_ids?: string[]
          settled_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          actual_euros?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          project_id?: string | null
          reason?: string | null
          reserved_euros?: number
          run_ids?: string[]
          scene_ids?: string[]
          settled_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      composer_runless_transition_rules: {
        Row: {
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          note: string | null
          reason: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Insert: {
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          note?: string | null
          reason: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Update: {
          from_state?: Database["public"]["Enums"]["composer_scene_state"]
          note?: string | null
          reason?: string
          to_state?: Database["public"]["Enums"]["composer_scene_state"]
          write_id?: string
        }
        Relationships: []
      }
      composer_scene_comments: {
        Row: {
          body: string
          created_at: string
          id: string
          parent_id: string | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          scene_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          scene_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          scene_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_scene_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "composer_scene_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scene_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scene_comments_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_scene_runs: {
        Row: {
          audio_asset_hash: string | null
          audio_asset_id: string | null
          audio_plan_id: string | null
          billable_duration_seconds: number | null
          completed_at: string | null
          continuity_source_clip_url: string | null
          contract_frozen_at: string | null
          created_at: string
          dialog_content_hash: string | null
          duration_policy_version: string | null
          effective_duration_frames: number | null
          effective_duration_ms: number | null
          measured_audio_duration_ms: number | null
          metadata: Json
          quoted_cost_euros: number | null
          requested_duration_ms: number | null
          required_duration_ms: number | null
          reservation_id: string | null
          run_contract_version: number
          run_id: string
          scene_id: string
          status: string
          updated_at: string
          voice_configuration_hash: string | null
        }
        Insert: {
          audio_asset_hash?: string | null
          audio_asset_id?: string | null
          audio_plan_id?: string | null
          billable_duration_seconds?: number | null
          completed_at?: string | null
          continuity_source_clip_url?: string | null
          contract_frozen_at?: string | null
          created_at?: string
          dialog_content_hash?: string | null
          duration_policy_version?: string | null
          effective_duration_frames?: number | null
          effective_duration_ms?: number | null
          measured_audio_duration_ms?: number | null
          metadata?: Json
          quoted_cost_euros?: number | null
          requested_duration_ms?: number | null
          required_duration_ms?: number | null
          reservation_id?: string | null
          run_contract_version?: number
          run_id: string
          scene_id: string
          status?: string
          updated_at?: string
          voice_configuration_hash?: string | null
        }
        Update: {
          audio_asset_hash?: string | null
          audio_asset_id?: string | null
          audio_plan_id?: string | null
          billable_duration_seconds?: number | null
          completed_at?: string | null
          continuity_source_clip_url?: string | null
          contract_frozen_at?: string | null
          created_at?: string
          dialog_content_hash?: string | null
          duration_policy_version?: string | null
          effective_duration_frames?: number | null
          effective_duration_ms?: number | null
          measured_audio_duration_ms?: number | null
          metadata?: Json
          quoted_cost_euros?: number | null
          requested_duration_ms?: number | null
          required_duration_ms?: number | null
          reservation_id?: string | null
          run_contract_version?: number
          run_id?: string
          scene_id?: string
          status?: string
          updated_at?: string
          voice_configuration_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "composer_scene_runs_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_scene_transition_log: {
        Row: {
          applied: boolean
          auth_uid: string | null
          caller_class: string
          caller_role: string | null
          created_at: string
          detail: string | null
          error_text: string | null
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          generation: number | null
          guard_mode: string
          id: string
          is_intermediate: boolean
          path: Database["public"]["Enums"]["composer_scene_state"][] | null
          project_id: string
          reason: string | null
          run_id: string | null
          runless_reason: string | null
          scene_id: string
          source_signature: string
          step_index: number
          substate: string | null
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Insert: {
          applied: boolean
          auth_uid?: string | null
          caller_class: string
          caller_role?: string | null
          created_at?: string
          detail?: string | null
          error_text?: string | null
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          generation?: number | null
          guard_mode: string
          id?: string
          is_intermediate?: boolean
          path?: Database["public"]["Enums"]["composer_scene_state"][] | null
          project_id: string
          reason?: string | null
          run_id?: string | null
          runless_reason?: string | null
          scene_id: string
          source_signature: string
          step_index: number
          substate?: string | null
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Update: {
          applied?: boolean
          auth_uid?: string | null
          caller_class?: string
          caller_role?: string | null
          created_at?: string
          detail?: string | null
          error_text?: string | null
          from_state?: Database["public"]["Enums"]["composer_scene_state"]
          generation?: number | null
          guard_mode?: string
          id?: string
          is_intermediate?: boolean
          path?: Database["public"]["Enums"]["composer_scene_state"][] | null
          project_id?: string
          reason?: string | null
          run_id?: string | null
          runless_reason?: string | null
          scene_id?: string
          source_signature?: string
          step_index?: number
          substate?: string | null
          to_state?: Database["public"]["Enums"]["composer_scene_state"]
          write_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "composer_scene_transition_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scene_transition_log_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_scene_transitions: {
        Row: {
          created_at: string
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          to_state: Database["public"]["Enums"]["composer_scene_state"]
        }
        Insert: {
          created_at?: string
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          to_state: Database["public"]["Enums"]["composer_scene_state"]
        }
        Update: {
          created_at?: string
          from_state?: Database["public"]["Enums"]["composer_scene_state"]
          to_state?: Database["public"]["Enums"]["composer_scene_state"]
        }
        Relationships: []
      }
      composer_scenes: {
        Row: {
          action_beat: Json | null
          active_run_id: string | null
          active_run_started_at: string | null
          ai_prompt: string | null
          anchor_confirmed_at: string | null
          applied_style_preset_id: string | null
          audio_asset_hash: string | null
          audio_asset_id: string | null
          audio_plan: Json | null
          audio_plan_id: string | null
          audio_selfheal_count: number
          audio_source: string | null
          base_clip_status: string | null
          base_clip_url: string | null
          base_video_url: string | null
          billable_duration_seconds: number | null
          camera_choreography_en: string | null
          character_audio_url: string | null
          character_image_url: string | null
          character_script: string | null
          character_shot: Json | null
          character_shots: Json
          character_voice_id: string | null
          cinematic_preset_slug: string | null
          clip_error: string | null
          clip_lead_in_trim_seconds: number
          clip_quality: string
          clip_source: string
          clip_status: string
          clip_url: string | null
          continuity_auto_repair: boolean
          continuity_checked_at: string | null
          continuity_drift_label: string | null
          continuity_drift_notes: Json | null
          continuity_drift_score: number | null
          continuity_locked: boolean
          continuity_rendered_source_clip_url: string | null
          continuity_source_clip_url: string | null
          continuity_source_scene_id: string | null
          continuity_stale: boolean
          cost_euros: number
          created_at: string
          dialog_content_hash: string | null
          dialog_locked_at: string | null
          dialog_mode: boolean
          dialog_script: string | null
          dialog_shots: Json | null
          dialog_takes: Json
          dialog_turns: Json
          dialog_voices: Json
          director_modifiers: Json | null
          duration_policy_version: string | null
          duration_run_id: string | null
          duration_seconds: number
          effective_duration_frames: number | null
          effective_duration_ms: number | null
          effects: Json | null
          end_reference_image_url: string | null
          engine_override: string
          first_frame_url: string | null
          first_rendered_at: string | null
          frame_pick_seconds: number | null
          hybrid_mode: string | null
          hybrid_target_scene_id: string | null
          id: string
          last_drift_check_at: string | null
          last_frame_url: string | null
          last_good_output_generation: number | null
          last_good_output_url: string | null
          lip_sync_applied_at: string | null
          lip_sync_source_clip_url: string | null
          lip_sync_status: string | null
          lip_sync_with_voiceover: boolean
          lock_reference_url: string | null
          measured_audio_duration_ms: number | null
          mentioned_character_ids: string[] | null
          mentioned_location_ids: string[] | null
          motion_track: Json | null
          order_index: number
          pipeline_detail: string | null
          pipeline_state: Database["public"]["Enums"]["composer_scene_state"]
          pipeline_state_at: string
          pipeline_state_run_id: string | null
          pipeline_substate: string | null
          pipeline_substate_at: string | null
          plate_generation: number
          plate_generation_started_at: string | null
          plate_pipeline_job_id: string | null
          plate_ready_at: string | null
          plate_ready_generation: number | null
          preview_anchor_url: string | null
          preview_audit: Json | null
          preview_clip_url: string | null
          preview_status: string | null
          processed_video_url: string | null
          progress_percent: number | null
          project_id: string
          prompt_mode: string | null
          prompt_slot_order: string[] | null
          prompt_slots: Json | null
          quoted_cost_euros: number | null
          realism_preset: string | null
          reference_image_url: string | null
          replicate_prediction_id: string | null
          requested_duration_ms: number | null
          required_duration_ms: number | null
          reservation_id: string | null
          retry_count: number
          run_contract_version: number | null
          scene_action_en: string | null
          scene_action_user: string | null
          scene_assets: Json
          scene_type: string
          seed: number | null
          seed_variations: Json
          shot_director: Json | null
          sound_design: string | null
          stock_keywords: string | null
          subject_track: Json | null
          talking_head_aspect: string | null
          talking_head_resolution: string | null
          text_overlay: Json
          transition_duration: number
          transition_type: string
          trim_end_sec: number | null
          trim_start_sec: number | null
          twoshot_stage: string | null
          updated_at: string
          upload_type: string | null
          upload_url: string | null
          visual_source: string | null
          voice_configuration_hash: string | null
          with_audio: boolean
        }
        Insert: {
          action_beat?: Json | null
          active_run_id?: string | null
          active_run_started_at?: string | null
          ai_prompt?: string | null
          anchor_confirmed_at?: string | null
          applied_style_preset_id?: string | null
          audio_asset_hash?: string | null
          audio_asset_id?: string | null
          audio_plan?: Json | null
          audio_plan_id?: string | null
          audio_selfheal_count?: number
          audio_source?: string | null
          base_clip_status?: string | null
          base_clip_url?: string | null
          base_video_url?: string | null
          billable_duration_seconds?: number | null
          camera_choreography_en?: string | null
          character_audio_url?: string | null
          character_image_url?: string | null
          character_script?: string | null
          character_shot?: Json | null
          character_shots?: Json
          character_voice_id?: string | null
          cinematic_preset_slug?: string | null
          clip_error?: string | null
          clip_lead_in_trim_seconds?: number
          clip_quality?: string
          clip_source?: string
          clip_status?: string
          clip_url?: string | null
          continuity_auto_repair?: boolean
          continuity_checked_at?: string | null
          continuity_drift_label?: string | null
          continuity_drift_notes?: Json | null
          continuity_drift_score?: number | null
          continuity_locked?: boolean
          continuity_rendered_source_clip_url?: string | null
          continuity_source_clip_url?: string | null
          continuity_source_scene_id?: string | null
          continuity_stale?: boolean
          cost_euros?: number
          created_at?: string
          dialog_content_hash?: string | null
          dialog_locked_at?: string | null
          dialog_mode?: boolean
          dialog_script?: string | null
          dialog_shots?: Json | null
          dialog_takes?: Json
          dialog_turns?: Json
          dialog_voices?: Json
          director_modifiers?: Json | null
          duration_policy_version?: string | null
          duration_run_id?: string | null
          duration_seconds?: number
          effective_duration_frames?: number | null
          effective_duration_ms?: number | null
          effects?: Json | null
          end_reference_image_url?: string | null
          engine_override?: string
          first_frame_url?: string | null
          first_rendered_at?: string | null
          frame_pick_seconds?: number | null
          hybrid_mode?: string | null
          hybrid_target_scene_id?: string | null
          id?: string
          last_drift_check_at?: string | null
          last_frame_url?: string | null
          last_good_output_generation?: number | null
          last_good_output_url?: string | null
          lip_sync_applied_at?: string | null
          lip_sync_source_clip_url?: string | null
          lip_sync_status?: string | null
          lip_sync_with_voiceover?: boolean
          lock_reference_url?: string | null
          measured_audio_duration_ms?: number | null
          mentioned_character_ids?: string[] | null
          mentioned_location_ids?: string[] | null
          motion_track?: Json | null
          order_index?: number
          pipeline_detail?: string | null
          pipeline_state?: Database["public"]["Enums"]["composer_scene_state"]
          pipeline_state_at?: string
          pipeline_state_run_id?: string | null
          pipeline_substate?: string | null
          pipeline_substate_at?: string | null
          plate_generation?: number
          plate_generation_started_at?: string | null
          plate_pipeline_job_id?: string | null
          plate_ready_at?: string | null
          plate_ready_generation?: number | null
          preview_anchor_url?: string | null
          preview_audit?: Json | null
          preview_clip_url?: string | null
          preview_status?: string | null
          processed_video_url?: string | null
          progress_percent?: number | null
          project_id: string
          prompt_mode?: string | null
          prompt_slot_order?: string[] | null
          prompt_slots?: Json | null
          quoted_cost_euros?: number | null
          realism_preset?: string | null
          reference_image_url?: string | null
          replicate_prediction_id?: string | null
          requested_duration_ms?: number | null
          required_duration_ms?: number | null
          reservation_id?: string | null
          retry_count?: number
          run_contract_version?: number | null
          scene_action_en?: string | null
          scene_action_user?: string | null
          scene_assets?: Json
          scene_type?: string
          seed?: number | null
          seed_variations?: Json
          shot_director?: Json | null
          sound_design?: string | null
          stock_keywords?: string | null
          subject_track?: Json | null
          talking_head_aspect?: string | null
          talking_head_resolution?: string | null
          text_overlay?: Json
          transition_duration?: number
          transition_type?: string
          trim_end_sec?: number | null
          trim_start_sec?: number | null
          twoshot_stage?: string | null
          updated_at?: string
          upload_type?: string | null
          upload_url?: string | null
          visual_source?: string | null
          voice_configuration_hash?: string | null
          with_audio?: boolean
        }
        Update: {
          action_beat?: Json | null
          active_run_id?: string | null
          active_run_started_at?: string | null
          ai_prompt?: string | null
          anchor_confirmed_at?: string | null
          applied_style_preset_id?: string | null
          audio_asset_hash?: string | null
          audio_asset_id?: string | null
          audio_plan?: Json | null
          audio_plan_id?: string | null
          audio_selfheal_count?: number
          audio_source?: string | null
          base_clip_status?: string | null
          base_clip_url?: string | null
          base_video_url?: string | null
          billable_duration_seconds?: number | null
          camera_choreography_en?: string | null
          character_audio_url?: string | null
          character_image_url?: string | null
          character_script?: string | null
          character_shot?: Json | null
          character_shots?: Json
          character_voice_id?: string | null
          cinematic_preset_slug?: string | null
          clip_error?: string | null
          clip_lead_in_trim_seconds?: number
          clip_quality?: string
          clip_source?: string
          clip_status?: string
          clip_url?: string | null
          continuity_auto_repair?: boolean
          continuity_checked_at?: string | null
          continuity_drift_label?: string | null
          continuity_drift_notes?: Json | null
          continuity_drift_score?: number | null
          continuity_locked?: boolean
          continuity_rendered_source_clip_url?: string | null
          continuity_source_clip_url?: string | null
          continuity_source_scene_id?: string | null
          continuity_stale?: boolean
          cost_euros?: number
          created_at?: string
          dialog_content_hash?: string | null
          dialog_locked_at?: string | null
          dialog_mode?: boolean
          dialog_script?: string | null
          dialog_shots?: Json | null
          dialog_takes?: Json
          dialog_turns?: Json
          dialog_voices?: Json
          director_modifiers?: Json | null
          duration_policy_version?: string | null
          duration_run_id?: string | null
          duration_seconds?: number
          effective_duration_frames?: number | null
          effective_duration_ms?: number | null
          effects?: Json | null
          end_reference_image_url?: string | null
          engine_override?: string
          first_frame_url?: string | null
          first_rendered_at?: string | null
          frame_pick_seconds?: number | null
          hybrid_mode?: string | null
          hybrid_target_scene_id?: string | null
          id?: string
          last_drift_check_at?: string | null
          last_frame_url?: string | null
          last_good_output_generation?: number | null
          last_good_output_url?: string | null
          lip_sync_applied_at?: string | null
          lip_sync_source_clip_url?: string | null
          lip_sync_status?: string | null
          lip_sync_with_voiceover?: boolean
          lock_reference_url?: string | null
          measured_audio_duration_ms?: number | null
          mentioned_character_ids?: string[] | null
          mentioned_location_ids?: string[] | null
          motion_track?: Json | null
          order_index?: number
          pipeline_detail?: string | null
          pipeline_state?: Database["public"]["Enums"]["composer_scene_state"]
          pipeline_state_at?: string
          pipeline_state_run_id?: string | null
          pipeline_substate?: string | null
          pipeline_substate_at?: string | null
          plate_generation?: number
          plate_generation_started_at?: string | null
          plate_pipeline_job_id?: string | null
          plate_ready_at?: string | null
          plate_ready_generation?: number | null
          preview_anchor_url?: string | null
          preview_audit?: Json | null
          preview_clip_url?: string | null
          preview_status?: string | null
          processed_video_url?: string | null
          progress_percent?: number | null
          project_id?: string
          prompt_mode?: string | null
          prompt_slot_order?: string[] | null
          prompt_slots?: Json | null
          quoted_cost_euros?: number | null
          realism_preset?: string | null
          reference_image_url?: string | null
          replicate_prediction_id?: string | null
          requested_duration_ms?: number | null
          required_duration_ms?: number | null
          reservation_id?: string | null
          retry_count?: number
          run_contract_version?: number | null
          scene_action_en?: string | null
          scene_action_user?: string | null
          scene_assets?: Json
          scene_type?: string
          seed?: number | null
          seed_variations?: Json
          shot_director?: Json | null
          sound_design?: string | null
          stock_keywords?: string | null
          subject_track?: Json | null
          talking_head_aspect?: string | null
          talking_head_resolution?: string | null
          text_overlay?: Json
          transition_duration?: number
          transition_type?: string
          trim_end_sec?: number | null
          trim_start_sec?: number | null
          twoshot_stage?: string | null
          updated_at?: string
          upload_type?: string | null
          upload_url?: string | null
          visual_source?: string | null
          voice_configuration_hash?: string | null
          with_audio?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "composer_scenes_applied_style_preset_id_fkey"
            columns: ["applied_style_preset_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_style_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scenes_continuity_source_scene_id_fkey"
            columns: ["continuity_source_scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scenes_hybrid_target_scene_id_fkey"
            columns: ["hybrid_target_scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "composer_scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "composer_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      composer_state_guard_violations: {
        Row: {
          created_at: string
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          id: string
          reason: string
          scene_id: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          verdict: string
        }
        Insert: {
          created_at?: string
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          id?: string
          reason: string
          scene_id: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          verdict: string
        }
        Update: {
          created_at?: string
          from_state?: Database["public"]["Enums"]["composer_scene_state"]
          id?: string
          reason?: string
          scene_id?: string
          to_state?: Database["public"]["Enums"]["composer_scene_state"]
          verdict?: string
        }
        Relationships: []
      }
      composer_template_suggestions: {
        Row: {
          aggregation_window_end: string | null
          aggregation_window_start: string | null
          category: string | null
          completion_rate: number | null
          created_at: string | null
          description: string | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          performance_score: number | null
          preview_video_url: string | null
          scene_count: number | null
          shares_count: number | null
          source_project_id: string | null
          structure_json: Json
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          total_duration_sec: number | null
          updated_at: string | null
          use_count: number | null
          views_count: number | null
        }
        Insert: {
          aggregation_window_end?: string | null
          aggregation_window_start?: string | null
          category?: string | null
          completion_rate?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          performance_score?: number | null
          preview_video_url?: string | null
          scene_count?: number | null
          shares_count?: number | null
          source_project_id?: string | null
          structure_json?: Json
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          total_duration_sec?: number | null
          updated_at?: string | null
          use_count?: number | null
          views_count?: number | null
        }
        Update: {
          aggregation_window_end?: string | null
          aggregation_window_start?: string | null
          category?: string | null
          completion_rate?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          performance_score?: number | null
          preview_video_url?: string | null
          scene_count?: number | null
          shares_count?: number | null
          source_project_id?: string | null
          structure_json?: Json
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          total_duration_sec?: number | null
          updated_at?: string | null
          use_count?: number | null
          views_count?: number | null
        }
        Relationships: []
      }
      composer_transition_grandfather: {
        Row: {
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          note: string | null
          source_signature: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Insert: {
          from_state: Database["public"]["Enums"]["composer_scene_state"]
          note?: string | null
          source_signature: string
          to_state: Database["public"]["Enums"]["composer_scene_state"]
          write_id: string
        }
        Update: {
          from_state?: Database["public"]["Enums"]["composer_scene_state"]
          note?: string | null
          source_signature?: string
          to_state?: Database["public"]["Enums"]["composer_scene_state"]
          write_id?: string
        }
        Relationships: []
      }
      composer_undo_stack: {
        Row: {
          action_type: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          credits_charged: number
          id: string
          label: string | null
          project_id: string
          refundable: boolean
          scene_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          credits_charged?: number
          id?: string
          label?: string | null
          project_id: string
          refundable?: boolean
          scene_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          credits_charged?: number
          id?: string
          label?: string | null
          project_id?: string
          refundable?: boolean
          scene_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_approvals: {
        Row: {
          content_id: string
          content_type: string
          created_at: string
          created_by: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          submitted_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string
          created_by: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string
          created_by?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          submitted_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_items: {
        Row: {
          caption: string | null
          created_at: string | null
          duration_sec: number | null
          file_size_mb: number | null
          id: string
          media_id: string | null
          source: string | null
          source_id: string | null
          tags: string[] | null
          targets: Json | null
          thumb_url: string | null
          title: string
          type: string
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          id?: string
          media_id?: string | null
          source?: string | null
          source_id?: string | null
          tags?: string[] | null
          targets?: Json | null
          thumb_url?: string | null
          title: string
          type: string
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          id?: string
          media_id?: string | null
          source?: string | null
          source_id?: string | null
          tags?: string[] | null
          targets?: Json | null
          thumb_url?: string | null
          title?: string
          type?: string
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_items_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "media_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_projects: {
        Row: {
          audio_config: Json | null
          brand_kit_id: string | null
          brief: string | null
          completed_at: string | null
          content_type: string
          created_at: string | null
          credits_used: number | null
          customizations: Json
          export_aspect_ratios: string[] | null
          export_formats: Json | null
          file_size_mb: number | null
          id: string
          output_urls: Json | null
          project_name: string
          render_engine: string | null
          render_id: string | null
          scenes: Json | null
          shared_with: string[] | null
          status: string | null
          storage_bucket: string | null
          template_id: string | null
          thumbnail_urls: Json | null
          updated_at: string | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          audio_config?: Json | null
          brand_kit_id?: string | null
          brief?: string | null
          completed_at?: string | null
          content_type: string
          created_at?: string | null
          credits_used?: number | null
          customizations?: Json
          export_aspect_ratios?: string[] | null
          export_formats?: Json | null
          file_size_mb?: number | null
          id?: string
          output_urls?: Json | null
          project_name: string
          render_engine?: string | null
          render_id?: string | null
          scenes?: Json | null
          shared_with?: string[] | null
          status?: string | null
          storage_bucket?: string | null
          template_id?: string | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          audio_config?: Json | null
          brand_kit_id?: string | null
          brief?: string | null
          completed_at?: string | null
          content_type?: string
          created_at?: string | null
          credits_used?: number | null
          customizations?: Json
          export_aspect_ratios?: string[] | null
          export_formats?: Json | null
          file_size_mb?: number | null
          id?: string
          output_urls?: Json | null
          project_name?: string
          render_engine?: string | null
          render_id?: string | null
          scenes?: Json | null
          shared_with?: string[] | null
          status?: string | null
          storage_bucket?: string | null
          template_id?: string | null
          thumbnail_urls?: Json | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_projects_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_reviews: {
        Row: {
          comments: Json | null
          created_at: string
          draft_id: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string
          workspace_id: string | null
        }
        Insert: {
          comments?: Json | null
          created_at?: string
          draft_id: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          workspace_id?: string | null
        }
        Update: {
          comments?: Json | null
          created_at?: string
          draft_id?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reviews_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_tasks: {
        Row: {
          assigned_by: string
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: Database["public"]["Enums"]["task_priority"]
          related_content_id: string | null
          related_content_type: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_by: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_content_id?: string | null
          related_content_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          related_content_id?: string | null
          related_content_type?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          ai_features: string[] | null
          aspect_ratios: string[] | null
          average_rating: number | null
          category: string
          content_type: string | null
          created_at: string
          created_by: string | null
          customizable_fields: Json | null
          description: string | null
          duration_max: number | null
          duration_min: number | null
          id: string
          is_featured: boolean | null
          is_public: boolean
          name: string
          platform: string
          platforms: string[] | null
          remotion_component_id: string | null
          search_vector: unknown
          tags: string[] | null
          template_data: Json
          thumbnail_url: string | null
          total_ratings: number | null
          updated_at: string
          usage_count: number
          user_id: string | null
          view_count: number | null
        }
        Insert: {
          ai_features?: string[] | null
          aspect_ratios?: string[] | null
          average_rating?: number | null
          category: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json | null
          description?: string | null
          duration_max?: number | null
          duration_min?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          name: string
          platform: string
          platforms?: string[] | null
          remotion_component_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          template_data?: Json
          thumbnail_url?: string | null
          total_ratings?: number | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          view_count?: number | null
        }
        Update: {
          ai_features?: string[] | null
          aspect_ratios?: string[] | null
          average_rating?: number | null
          category?: string
          content_type?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json | null
          description?: string | null
          duration_max?: number | null
          duration_min?: number | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean
          name?: string
          platform?: string
          platforms?: string[] | null
          remotion_component_id?: string | null
          search_vector?: unknown
          tags?: string[] | null
          template_data?: Json
          thumbnail_url?: string | null
          total_ratings?: number | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      cost_table: {
        Row: {
          created_at: string
          description: string
          feature_code: string
          unit_cost: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          feature_code: string
          unit_cost: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          feature_code?: string
          unit_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      creator_earnings_ledger: {
        Row: {
          character_id: string | null
          character_purchase_id: string | null
          created_at: string
          creator_user_id: string
          credits_earned: number
          id: string
          purchase_id: string | null
          source_type: string
          template_id: string | null
        }
        Insert: {
          character_id?: string | null
          character_purchase_id?: string | null
          created_at?: string
          creator_user_id: string
          credits_earned: number
          id?: string
          purchase_id?: string | null
          source_type?: string
          template_id?: string | null
        }
        Update: {
          character_id?: string | null
          character_purchase_id?: string | null
          created_at?: string
          creator_user_id?: string
          credits_earned?: number
          id?: string
          purchase_id?: string | null
          source_type?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_ledger_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_ledger_character_purchase_id_fkey"
            columns: ["character_purchase_id"]
            isOneToOne: false
            referencedRelation: "character_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_ledger_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "template_purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_ledger_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_level_history: {
        Row: {
          created_at: string
          id: string
          level_from: string | null
          level_to: string
          metrics_snapshot: Json | null
          reason: string | null
          trigger: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level_from?: string | null
          level_to: string
          metrics_snapshot?: Json | null
          reason?: string | null
          trigger: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level_from?: string | null
          level_to?: string
          metrics_snapshot?: Json | null
          reason?: string | null
          trigger?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_reservations: {
        Row: {
          actual_amount: number | null
          committed_at: string | null
          created_at: string | null
          expires_at: string | null
          feature_code: string
          id: string
          metadata: Json | null
          reserved_amount: number
          status: string
          user_id: string
        }
        Insert: {
          actual_amount?: number | null
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          feature_code: string
          id?: string
          metadata?: Json | null
          reserved_amount: number
          status?: string
          user_id: string
        }
        Update: {
          actual_amount?: number | null
          committed_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          feature_code?: string
          id?: string
          metadata?: Json | null
          reserved_amount?: number
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      credit_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json
          reason: Database["public"]["Enums"]["transaction_reason"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json
          reason: Database["public"]["Enums"]["transaction_reason"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json
          reason?: Database["public"]["Enums"]["transaction_reason"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage_events: {
        Row: {
          credits_used: number
          engine: string | null
          feature_code: string
          id: string
          metadata: Json | null
          template_id: string | null
          timestamp: string | null
          user_id: string
        }
        Insert: {
          credits_used: number
          engine?: string | null
          feature_code: string
          id?: string
          metadata?: Json | null
          template_id?: string | null
          timestamp?: string | null
          user_id: string
        }
        Update: {
          credits_used?: number
          engine?: string | null
          feature_code?: string
          id?: string
          metadata?: Json | null
          template_id?: string | null
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_usage_reports: {
        Row: {
          breakdown_by_engine: Json | null
          breakdown_by_feature: Json | null
          breakdown_by_template: Json | null
          cost_savings_potential: Json | null
          created_at: string | null
          id: string
          period_end: string
          period_start: string
          report_period: string | null
          top_cost_drivers: Json | null
          total_credits_used: number | null
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          breakdown_by_engine?: Json | null
          breakdown_by_feature?: Json | null
          breakdown_by_template?: Json | null
          cost_savings_potential?: Json | null
          created_at?: string | null
          id?: string
          period_end: string
          period_start: string
          report_period?: string | null
          top_cost_drivers?: Json | null
          total_credits_used?: number | null
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          breakdown_by_engine?: Json | null
          breakdown_by_feature?: Json | null
          breakdown_by_template?: Json | null
          cost_savings_potential?: Json | null
          created_at?: string | null
          id?: string
          period_end?: string
          period_start?: string
          report_period?: string | null
          top_cost_drivers?: Json | null
          total_credits_used?: number | null
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_usage_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_heartbeats: {
        Row: {
          consecutive_failures: number
          expected_interval_seconds: number
          job_name: string
          last_details: Json
          last_duration_ms: number | null
          last_error: string | null
          last_run_at: string
          last_status: string
          updated_at: string
        }
        Insert: {
          consecutive_failures?: number
          expected_interval_seconds?: number
          job_name: string
          last_details?: Json
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Update: {
          consecutive_failures?: number
          expected_interval_seconds?: number
          job_name?: string
          last_details?: Json
          last_duration_ms?: number | null
          last_error?: string | null
          last_run_at?: string
          last_status?: string
          updated_at?: string
        }
        Relationships: []
      }
      cross_post_drafts: {
        Row: {
          caption: string | null
          channel: string
          description: string | null
          edited_by_user: boolean | null
          generated_at: string
          hashtags: string[] | null
          hook_score: number | null
          id: string
          language: string | null
          tags: string[] | null
          title: string | null
          tone: string | null
          updated_at: string
          user_id: string
          video_id: string | null
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          channel: string
          description?: string | null
          edited_by_user?: boolean | null
          generated_at?: string
          hashtags?: string[] | null
          hook_score?: number | null
          id?: string
          language?: string | null
          tags?: string[] | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          user_id: string
          video_id?: string | null
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          channel?: string
          description?: string | null
          edited_by_user?: boolean | null
          generated_at?: string
          hashtags?: string[] | null
          hook_score?: number | null
          id?: string
          language?: string | null
          tags?: string[] | null
          title?: string | null
          tone?: string | null
          updated_at?: string
          user_id?: string
          video_id?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      custom_voices: {
        Row: {
          created_at: string | null
          elevenlabs_voice_id: string
          id: string
          is_active: boolean | null
          language: string | null
          name: string
          sample_urls: string[] | null
          updated_at: string | null
          user_id: string
          voice_characteristics: Json | null
        }
        Insert: {
          created_at?: string | null
          elevenlabs_voice_id: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          name: string
          sample_urls?: string[] | null
          updated_at?: string | null
          user_id: string
          voice_characteristics?: Json | null
        }
        Update: {
          created_at?: string | null
          elevenlabs_voice_id?: string
          id?: string
          is_active?: boolean | null
          language?: string | null
          name?: string
          sample_urls?: string[] | null
          updated_at?: string | null
          user_id?: string
          voice_characteristics?: Json | null
        }
        Relationships: []
      }
      daily_quotas: {
        Row: {
          date: string
          feature_code: string
          id: string
          updated_at: string
          used_credits: number
          used_units: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          date?: string
          feature_code: string
          id?: string
          updated_at?: string
          used_credits?: number
          used_units?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          date?: string
          feature_code?: string
          id?: string
          updated_at?: string
          used_credits?: number
          used_units?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_quotas_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      dialog_dispatch_locks: {
        Row: {
          acquired_at: string
          expires_at: string
          holder: string
          pass_idx: number
          scene_id: string
        }
        Insert: {
          acquired_at?: string
          expires_at: string
          holder: string
          pass_idx?: number
          scene_id: string
        }
        Update: {
          acquired_at?: string
          expires_at?: string
          holder?: string
          pass_idx?: number
          scene_id?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      director_cut_enhancements: {
        Row: {
          aspect_ratio: string | null
          completed_at: string | null
          cost_euros: number
          created_at: string | null
          duration_seconds: number
          error_message: string | null
          generated_video_url: string | null
          id: string
          model: string
          original_frame_url: string
          project_id: string | null
          prompt: string
          replicate_prediction_id: string | null
          scene_id: string
          status: string
          user_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          completed_at?: string | null
          cost_euros: number
          created_at?: string | null
          duration_seconds: number
          error_message?: string | null
          generated_video_url?: string | null
          id?: string
          model: string
          original_frame_url: string
          project_id?: string | null
          prompt: string
          replicate_prediction_id?: string | null
          scene_id: string
          status?: string
          user_id: string
        }
        Update: {
          aspect_ratio?: string | null
          completed_at?: string | null
          cost_euros?: number
          created_at?: string | null
          duration_seconds?: number
          error_message?: string | null
          generated_video_url?: string | null
          id?: string
          model?: string
          original_frame_url?: string
          project_id?: string | null
          prompt?: string
          replicate_prediction_id?: string | null
          scene_id?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      director_cut_projects: {
        Row: {
          applied_effects: Json | null
          audio_enhancements: Json | null
          burned_subtitles_error: string | null
          burned_subtitles_pass: number
          burned_subtitles_prediction_id: string | null
          burned_subtitles_status: string
          cleaned_video_url: string | null
          created_at: string | null
          credits_used: number | null
          duration_seconds: number | null
          export_settings: Json | null
          id: string
          output_url: string | null
          project_name: string | null
          scene_analysis: Json | null
          source_video_id: string | null
          source_video_url: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          applied_effects?: Json | null
          audio_enhancements?: Json | null
          burned_subtitles_error?: string | null
          burned_subtitles_pass?: number
          burned_subtitles_prediction_id?: string | null
          burned_subtitles_status?: string
          cleaned_video_url?: string | null
          created_at?: string | null
          credits_used?: number | null
          duration_seconds?: number | null
          export_settings?: Json | null
          id?: string
          output_url?: string | null
          project_name?: string | null
          scene_analysis?: Json | null
          source_video_id?: string | null
          source_video_url: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          applied_effects?: Json | null
          audio_enhancements?: Json | null
          burned_subtitles_error?: string | null
          burned_subtitles_pass?: number
          burned_subtitles_prediction_id?: string | null
          burned_subtitles_status?: string
          cleaned_video_url?: string | null
          created_at?: string | null
          credits_used?: number | null
          duration_seconds?: number | null
          export_settings?: Json | null
          id?: string
          output_url?: string | null
          project_name?: string | null
          scene_analysis?: Json | null
          source_video_id?: string | null
          source_video_url?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_cut_projects_source_video_id_fkey"
            columns: ["source_video_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      director_cut_renders: {
        Row: {
          audio_config: Json | null
          bucket_name: string | null
          completed_at: string | null
          created_at: string
          credits_breakdown: Json | null
          credits_used: number
          effects_config: Json | null
          error_message: string | null
          export_settings: Json | null
          file_size_bytes: number | null
          id: string
          output_duration_seconds: number | null
          output_format: string | null
          output_height: number | null
          output_url: string | null
          output_width: number | null
          premium_features: Json | null
          progress: number | null
          project_id: string | null
          remotion_render_id: string | null
          render_config: Json | null
          retry_count: number | null
          source_video_duration: number | null
          source_video_url: string
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          audio_config?: Json | null
          bucket_name?: string | null
          completed_at?: string | null
          created_at?: string
          credits_breakdown?: Json | null
          credits_used?: number
          effects_config?: Json | null
          error_message?: string | null
          export_settings?: Json | null
          file_size_bytes?: number | null
          id?: string
          output_duration_seconds?: number | null
          output_format?: string | null
          output_height?: number | null
          output_url?: string | null
          output_width?: number | null
          premium_features?: Json | null
          progress?: number | null
          project_id?: string | null
          remotion_render_id?: string | null
          render_config?: Json | null
          retry_count?: number | null
          source_video_duration?: number | null
          source_video_url: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          audio_config?: Json | null
          bucket_name?: string | null
          completed_at?: string | null
          created_at?: string
          credits_breakdown?: Json | null
          credits_used?: number
          effects_config?: Json | null
          error_message?: string | null
          export_settings?: Json | null
          file_size_bytes?: number | null
          id?: string
          output_duration_seconds?: number | null
          output_format?: string | null
          output_height?: number | null
          output_url?: string | null
          output_width?: number | null
          premium_features?: Json | null
          progress?: number | null
          project_id?: string | null
          remotion_render_id?: string | null
          render_config?: Json | null
          retry_count?: number | null
          source_video_duration?: number | null
          source_video_url?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "director_cut_renders_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "director_cut_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      drip_email_log: {
        Row: {
          created_at: string
          drip_step: number
          error_message: string | null
          id: string
          progress_at_send: number | null
          resend_message_id: string | null
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          drip_step: number
          error_message?: string | null
          id?: string
          progress_at_send?: number | null
          resend_message_id?: string | null
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          drip_step?: number
          error_message?: string | null
          id?: string
          progress_at_send?: number | null
          resend_message_id?: string | null
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          briefing: string
          created_at: string
          goal: string | null
          id: string
          language: string
          metadata: Json
          status: string
          subjects: Json
          title: string
          tonality: string | null
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          briefing: string
          created_at?: string
          goal?: string | null
          id?: string
          language?: string
          metadata?: Json
          status?: string
          subjects?: Json
          title: string
          tonality?: string | null
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          briefing?: string
          created_at?: string
          goal?: string | null
          id?: string
          language?: string
          metadata?: Json
          status?: string
          subjects?: Json
          title?: string
          tonality?: string | null
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_suppression_list: {
        Row: {
          details: Json | null
          email: string
          reason: string
          suppressed_at: string
        }
        Insert: {
          details?: Json | null
          email: string
          reason: string
          suppressed_at?: string
        }
        Update: {
          details?: Json | null
          email?: string
          reason?: string
          suppressed_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      email_verification_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          token: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          token?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      explainer_generation_progress: {
        Row: {
          assets_json: Json | null
          created_at: string
          current_step: string
          error: string | null
          id: string
          message: string | null
          progress: number
          project_data: Json | null
          step_index: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assets_json?: Json | null
          created_at?: string
          current_step?: string
          error?: string | null
          id?: string
          message?: string | null
          progress?: number
          project_data?: Json | null
          step_index?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assets_json?: Json | null
          created_at?: string
          current_step?: string
          error?: string | null
          id?: string
          message?: string | null
          progress?: number
          project_data?: Json | null
          step_index?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      export_history: {
        Row: {
          created_at: string
          draft_id: string | null
          export_type: string
          file_url: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          draft_id?: string | null
          export_type: string
          file_url: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          draft_id?: string | null
          export_type?: string
          file_url?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_history_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      fb_page_daily: {
        Row: {
          created_at: string | null
          date: string
          fans_total: number | null
          id: string
          impressions: number | null
          page_id: string
          post_engagements: number | null
          total_actions: number | null
          video_views: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          fans_total?: number | null
          id?: string
          impressions?: number | null
          page_id: string
          post_engagements?: number | null
          total_actions?: number | null
          video_views?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          fans_total?: number | null
          id?: string
          impressions?: number | null
          page_id?: string
          post_engagements?: number | null
          total_actions?: number | null
          video_views?: number | null
        }
        Relationships: []
      }
      feature_costs: {
        Row: {
          created_at: string | null
          credits_per_use: number
          description: string | null
          feature_code: string
          id: string
        }
        Insert: {
          created_at?: string | null
          credits_per_use: number
          description?: string | null
          feature_code: string
          id?: string
        }
        Update: {
          created_at?: string | null
          credits_per_use?: number
          description?: string | null
          feature_code?: string
          id?: string
        }
        Relationships: []
      }
      feature_registry: {
        Row: {
          category: string
          created_at: string | null
          description_json: Json | null
          enabled: boolean
          icon: string
          id: string
          order: number
          plan: string
          route: string
          titles_json: Json
          updated_at: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description_json?: Json | null
          enabled?: boolean
          icon: string
          id: string
          order: number
          plan: string
          route: string
          titles_json: Json
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description_json?: Json | null
          enabled?: boolean
          icon?: string
          id?: string
          order?: number
          plan?: string
          route?: string
          titles_json?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      feature_usage_events: {
        Row: {
          feature_key: string
          first_used_at: string
          id: string
          last_used_at: string
          use_count: number
          user_id: string
        }
        Insert: {
          feature_key: string
          first_used_at?: string
          id?: string
          last_used_at?: string
          use_count?: number
          user_id: string
        }
        Update: {
          feature_key?: string
          first_used_at?: string
          id?: string
          last_used_at?: string
          use_count?: number
          user_id?: string
        }
        Relationships: []
      }
      founders_signups: {
        Row: {
          claimed_at: string
          coupon_id: string
          id: string
          revoked_at: string | null
          revoked_reason: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          claimed_at?: string
          coupon_id: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          claimed_at?: string
          coupon_id?: string
          id?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      frame_face_cache: {
        Row: {
          created_at: string
          expires_at: string
          eye_open_score: number | null
          face_score: number | null
          fps: number
          frame_number: number
          id: string
          pitch_degrees: number | null
          result: Json
          sharpness_score: number | null
          validator: string
          video_url: string
          yaw_degrees: number | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          eye_open_score?: number | null
          face_score?: number | null
          fps?: number
          frame_number: number
          id?: string
          pitch_degrees?: number | null
          result: Json
          sharpness_score?: number | null
          validator?: string
          video_url: string
          yaw_degrees?: number | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          eye_open_score?: number | null
          face_score?: number | null
          fps?: number
          frame_number?: number
          id?: string
          pitch_degrees?: number | null
          result?: Json
          sharpness_score?: number | null
          validator?: string
          video_url?: string
          yaw_degrees?: number | null
        }
        Relationships: []
      }
      gaming_discord_settings: {
        Row: {
          auto_notify_live: boolean | null
          auto_notify_offline: boolean | null
          created_at: string | null
          custom_go_live_message: string | null
          custom_offline_message: string | null
          embed_color: number | null
          id: string
          include_category: boolean | null
          include_thumbnail: boolean | null
          include_viewer_count: boolean | null
          last_notification_at: string | null
          notification_count: number | null
          notify_on_clip: boolean | null
          updated_at: string | null
          user_id: string
          webhook_url: string
        }
        Insert: {
          auto_notify_live?: boolean | null
          auto_notify_offline?: boolean | null
          created_at?: string | null
          custom_go_live_message?: string | null
          custom_offline_message?: string | null
          embed_color?: number | null
          id?: string
          include_category?: boolean | null
          include_thumbnail?: boolean | null
          include_viewer_count?: boolean | null
          last_notification_at?: string | null
          notification_count?: number | null
          notify_on_clip?: boolean | null
          updated_at?: string | null
          user_id: string
          webhook_url: string
        }
        Update: {
          auto_notify_live?: boolean | null
          auto_notify_offline?: boolean | null
          created_at?: string | null
          custom_go_live_message?: string | null
          custom_offline_message?: string | null
          embed_color?: number | null
          id?: string
          include_category?: boolean | null
          include_thumbnail?: boolean | null
          include_viewer_count?: boolean | null
          last_notification_at?: string | null
          notification_count?: number | null
          notify_on_clip?: boolean | null
          updated_at?: string | null
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      generated_templates: {
        Row: {
          analysis_data: Json | null
          created_at: string | null
          generation_metadata: Json | null
          id: string
          source_post_id: string | null
          source_url: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          analysis_data?: Json | null
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          source_post_id?: string | null
          source_url?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          analysis_data?: Json | null
          created_at?: string | null
          generation_metadata?: Json | null
          id?: string
          source_post_id?: string | null
          source_url?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_templates_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_templates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      hashtag_performance: {
        Row: {
          avg_engagement_rate: number
          created_at: string
          hashtag: string
          id: string
          last_used_at: string | null
          platform: string
          posts_count: number
          total_engagement: number
          total_reach: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_engagement_rate?: number
          created_at?: string
          hashtag: string
          id?: string
          last_used_at?: string | null
          platform: string
          posts_count?: number
          total_engagement?: number
          total_reach?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_engagement_rate?: number
          created_at?: string
          hashtag?: string
          id?: string
          last_used_at?: string | null
          platform?: string
          posts_count?: number
          total_engagement?: number
          total_reach?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      hooks: {
        Row: {
          category: string
          created_at: string
          formula: string
          id: string
          is_default: boolean | null
          performance_score: number | null
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          formula: string
          id?: string
          is_default?: boolean | null
          performance_score?: number | null
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          formula?: string
          id?: string
          is_default?: boolean | null
          performance_score?: number | null
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      hooks_history: {
        Row: {
          audience: string | null
          created_at: string
          hooks_json: Json
          id: string
          language: string
          platform: string
          styles_json: Json
          tone: string
          topic: string
          user_id: string
        }
        Insert: {
          audience?: string | null
          created_at?: string
          hooks_json: Json
          id?: string
          language: string
          platform: string
          styles_json: Json
          tone: string
          topic: string
          user_id: string
        }
        Update: {
          audience?: string | null
          created_at?: string
          hooks_json?: Json
          id?: string
          language?: string
          platform?: string
          styles_json?: Json
          tone?: string
          topic?: string
          user_id?: string
        }
        Relationships: []
      }
      ig_account_daily: {
        Row: {
          created_at: string
          date: string
          followers_count: number
          id: string
          ig_user_id: string
          media_count: number | null
          reach_28d: number | null
          reach_day: number
          reach_week: number | null
        }
        Insert: {
          created_at?: string
          date: string
          followers_count?: number
          id?: string
          ig_user_id: string
          media_count?: number | null
          reach_28d?: number | null
          reach_day?: number
          reach_week?: number | null
        }
        Update: {
          created_at?: string
          date?: string
          followers_count?: number
          id?: string
          ig_user_id?: string
          media_count?: number | null
          reach_28d?: number | null
          reach_day?: number
          reach_week?: number | null
        }
        Relationships: []
      }
      ig_media: {
        Row: {
          caption: string | null
          created_at: string
          ig_user_id: string
          media_id: string
          media_type: Database["public"]["Enums"]["ig_media_type"]
          permalink: string
          thumbnail_url: string | null
          timestamp: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          ig_user_id: string
          media_id: string
          media_type: Database["public"]["Enums"]["ig_media_type"]
          permalink: string
          thumbnail_url?: string | null
          timestamp: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          ig_user_id?: string
          media_id?: string
          media_type?: Database["public"]["Enums"]["ig_media_type"]
          permalink?: string
          thumbnail_url?: string | null
          timestamp?: string
          updated_at?: string
        }
        Relationships: []
      }
      ig_media_metrics: {
        Row: {
          last_updated: string
          media_id: string
          plays: number | null
          reach: number
          saved: number
        }
        Insert: {
          last_updated?: string
          media_id: string
          plays?: number | null
          reach?: number
          saved?: number
        }
        Update: {
          last_updated?: string
          media_id?: string
          plays?: number | null
          reach?: number
          saved?: number
        }
        Relationships: [
          {
            foreignKeyName: "ig_media_metrics_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: true
            referencedRelation: "ig_media"
            referencedColumns: ["media_id"]
          },
        ]
      }
      image_analysis: {
        Row: {
          ai_description: string | null
          brand_color_match: boolean | null
          brightness_score: number | null
          contrast_score: number | null
          created_at: string
          dominant_colors: Json | null
          draft_id: string
          has_faces: boolean | null
          id: string
          image_url: string
          quality_score: number | null
          resolution_height: number | null
          resolution_width: number | null
          text_percentage: number | null
        }
        Insert: {
          ai_description?: string | null
          brand_color_match?: boolean | null
          brightness_score?: number | null
          contrast_score?: number | null
          created_at?: string
          dominant_colors?: Json | null
          draft_id: string
          has_faces?: boolean | null
          id?: string
          image_url: string
          quality_score?: number | null
          resolution_height?: number | null
          resolution_width?: number | null
          text_percentage?: number | null
        }
        Update: {
          ai_description?: string | null
          brand_color_match?: boolean | null
          brightness_score?: number | null
          contrast_score?: number | null
          created_at?: string
          dominant_colors?: Json | null
          draft_id?: string
          has_faces?: boolean | null
          id?: string
          image_url?: string
          quality_score?: number | null
          resolution_height?: number | null
          resolution_width?: number | null
          text_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "image_analysis_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
        ]
      }
      image_caption_history: {
        Row: {
          ai_description: string | null
          captions_json: Json
          created_at: string | null
          hashtags_json: Json
          id: string
          image_url: string
          language: string
          platform: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_description?: string | null
          captions_json?: Json
          created_at?: string | null
          hashtags_json?: Json
          id?: string
          image_url: string
          language?: string
          platform: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_description?: string | null
          captions_json?: Json
          created_at?: string | null
          hashtags_json?: Json
          id?: string
          image_url?: string
          language?: string
          platform?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      imports: {
        Row: {
          count_inserted: number
          count_skipped: number
          count_total: number
          created_at: string
          id: string
          project_id: string
          source_id: string | null
        }
        Insert: {
          count_inserted?: number
          count_skipped?: number
          count_total?: number
          created_at?: string
          id?: string
          project_id: string
          source_id?: string | null
        }
        Update: {
          count_inserted?: number
          count_skipped?: number
          count_total?: number
          created_at?: string
          id?: string
          project_id?: string
          source_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imports_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "comment_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      included_allowance_claims: {
        Row: {
          created_at: string
          id: string
          job_key: string
          kind: string
          period_start: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_key: string
          kind: string
          period_start: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_key?: string
          kind?: string
          period_start?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      included_allowances: {
        Row: {
          created_at: string
          fast_video_limit: number
          fast_video_used: number
          music_limit: number
          music_used: number
          period_end: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fast_video_limit?: number
          fast_video_used?: number
          music_limit?: number
          music_used?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fast_video_limit?: number
          fast_video_used?: number
          music_limit?: number
          music_used?: number
          period_end?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      instant_avatar_rate: {
        Row: {
          created_at: string
          id: string
          ip_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_hash?: string
        }
        Relationships: []
      }
      kv_secrets_backup: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_value: string
          expires_at: string | null
          id: number
          name: string
          scopes: Json | null
          token_hash: string
          token_last6: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_value: string
          expires_at?: string | null
          id?: number
          name: string
          scopes?: Json | null
          token_hash: string
          token_last6: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_value?: string
          expires_at?: string | null
          id?: number
          name?: string
          scopes?: Json | null
          token_hash?: string
          token_last6?: string
        }
        Relationships: []
      }
      lambda_health_metrics: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          function_name: string | null
          id: string
          job_id: string | null
          memory_limit_mb: number | null
          memory_used_mb: number | null
          render_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          job_id?: string | null
          memory_limit_mb?: number | null
          memory_used_mb?: number | null
          render_id?: string | null
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          job_id?: string | null
          memory_limit_mb?: number | null
          memory_used_mb?: number | null
          render_id?: string | null
          status?: string
        }
        Relationships: []
      }
      launch_milestones: {
        Row: {
          achieved_at: string
          created_at: string
          key: string
          label: string | null
          payload: Json
        }
        Insert: {
          achieved_at?: string
          created_at?: string
          key: string
          label?: string | null
          payload?: Json
        }
        Update: {
          achieved_at?: string
          created_at?: string
          key?: string
          label?: string | null
          payload?: Json
        }
        Relationships: []
      }
      license_certificates: {
        Row: {
          asset_id: string
          asset_source_url: string | null
          asset_thumbnail_url: string | null
          asset_title: string
          asset_type: string
          attribution_required: boolean
          certificate_number: string
          created_at: string
          id: string
          issued_at: string
          license_tier: string
          metadata: Json
          pdf_storage_path: string | null
          permitted_uses: string[]
          provider_license_name: string
          provider_license_url: string | null
          restrictions: string[]
          revoked_at: string | null
          source_provider: string
          updated_at: string
          user_id: string
          verify_token: string
        }
        Insert: {
          asset_id: string
          asset_source_url?: string | null
          asset_thumbnail_url?: string | null
          asset_title: string
          asset_type: string
          attribution_required?: boolean
          certificate_number: string
          created_at?: string
          id?: string
          issued_at?: string
          license_tier?: string
          metadata?: Json
          pdf_storage_path?: string | null
          permitted_uses?: string[]
          provider_license_name: string
          provider_license_url?: string | null
          restrictions?: string[]
          revoked_at?: string | null
          source_provider: string
          updated_at?: string
          user_id: string
          verify_token: string
        }
        Update: {
          asset_id?: string
          asset_source_url?: string | null
          asset_thumbnail_url?: string | null
          asset_title?: string
          asset_type?: string
          attribution_required?: boolean
          certificate_number?: string
          created_at?: string
          id?: string
          issued_at?: string
          license_tier?: string
          metadata?: Json
          pdf_storage_path?: string | null
          permitted_uses?: string[]
          provider_license_name?: string
          provider_license_url?: string | null
          restrictions?: string[]
          revoked_at?: string | null
          source_provider?: string
          updated_at?: string
          user_id?: string
          verify_token?: string
        }
        Relationships: []
      }
      location_catalog_previews: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          prompt: string | null
          storage_path: string | null
          theme_pack: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack?: string
        }
        Relationships: []
      }
      location_prop_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          location_id: string
          prop_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          location_id: string
          prop_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          location_id?: string
          prop_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "location_prop_variants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "brand_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      location_vibe_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          location_id: string
          storage_path: string | null
          vibe_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          location_id: string
          storage_path?: string | null
          vibe_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          location_id?: string
          storage_path?: string | null
          vibe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_vibe_variants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "brand_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          created_at: string | null
          duration_sec: number | null
          height: number | null
          id: string
          mime: string | null
          original_url: string | null
          size_bytes: number | null
          source: string
          storage_path: string | null
          type: string
          user_id: string
          width: number | null
        }
        Insert: {
          created_at?: string | null
          duration_sec?: number | null
          height?: number | null
          id?: string
          mime?: string | null
          original_url?: string | null
          size_bytes?: number | null
          source: string
          storage_path?: string | null
          type: string
          user_id: string
          width?: number | null
        }
        Update: {
          created_at?: string | null
          duration_sec?: number | null
          height?: number | null
          id?: string
          mime?: string | null
          original_url?: string | null
          size_bytes?: number | null
          source?: string
          storage_path?: string | null
          type?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      media_library: {
        Row: {
          alt_text: string | null
          brand_kit_id: string | null
          category: string | null
          created_at: string
          description: string | null
          duration: number | null
          file_name: string
          file_size: number | null
          file_type: string
          file_url: string
          height: number | null
          id: string
          metadata_json: Json | null
          mime_type: string | null
          tags: Json | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          brand_kit_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_name: string
          file_size?: number | null
          file_type: string
          file_url: string
          height?: number | null
          id?: string
          metadata_json?: Json | null
          mime_type?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          brand_kit_id?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          file_name?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          height?: number | null
          id?: string
          metadata_json?: Json | null
          mime_type?: string | null
          tags?: Json | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "media_library_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      media_profiles: {
        Row: {
          account_id: string | null
          config: Json
          created_at: string | null
          id: string
          is_default: boolean | null
          name: string
          platform: string
          type: string | null
          updated_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          account_id?: string | null
          config: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          platform: string
          type?: string | null
          updated_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          account_id?: string | null
          config?: Json
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          platform?: string
          type?: string | null
          updated_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mentor_slots: {
        Row: {
          booked_by: string | null
          channel_id: string | null
          created_at: string
          duration_min: number
          id: string
          mentor_user_id: string
          slot_time: string
          status: string
          updated_at: string
        }
        Insert: {
          booked_by?: string | null
          channel_id?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          mentor_user_id: string
          slot_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          booked_by?: string | null
          channel_id?: string | null
          created_at?: string
          duration_min?: number
          id?: string
          mentor_user_id?: string
          slot_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mentor_slots_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_oauth_diagnostics: {
        Row: {
          auth_type: string | null
          callback_completed_at: string | null
          created_at: string
          debug_token_raw: Json | null
          declined_scopes: string[] | null
          dialog_url: string | null
          fb_user_id: string | null
          fb_user_name: string | null
          granted_scopes: string[] | null
          granular_scopes: Json | null
          id: string
          me_accounts_raw: Json | null
          me_businesses_raw: Json | null
          pages_found_count: number | null
          provider: string
          requested_scopes: string[] | null
          state_key: string | null
          user_id: string
          uses_config_id: boolean | null
        }
        Insert: {
          auth_type?: string | null
          callback_completed_at?: string | null
          created_at?: string
          debug_token_raw?: Json | null
          declined_scopes?: string[] | null
          dialog_url?: string | null
          fb_user_id?: string | null
          fb_user_name?: string | null
          granted_scopes?: string[] | null
          granular_scopes?: Json | null
          id?: string
          me_accounts_raw?: Json | null
          me_businesses_raw?: Json | null
          pages_found_count?: number | null
          provider: string
          requested_scopes?: string[] | null
          state_key?: string | null
          user_id: string
          uses_config_id?: boolean | null
        }
        Update: {
          auth_type?: string | null
          callback_completed_at?: string | null
          created_at?: string
          debug_token_raw?: Json | null
          declined_scopes?: string[] | null
          dialog_url?: string | null
          fb_user_id?: string | null
          fb_user_name?: string | null
          granted_scopes?: string[] | null
          granular_scopes?: Json | null
          id?: string
          me_accounts_raw?: Json | null
          me_businesses_raw?: Json | null
          pages_found_count?: number | null
          provider?: string
          requested_scopes?: string[] | null
          state_key?: string | null
          user_id?: string
          uses_config_id?: boolean | null
        }
        Relationships: []
      }
      model_qa_stats: {
        Row: {
          content_category: string
          generation_mode: string
          issue_class_counts: Json
          last_updated: string
          model: string
          n_client_ready: number
          n_runs: number
          score_sum: number
        }
        Insert: {
          content_category: string
          generation_mode: string
          issue_class_counts?: Json
          last_updated?: string
          model: string
          n_client_ready?: number
          n_runs?: number
          score_sum?: number
        }
        Update: {
          content_category?: string
          generation_mode?: string
          issue_class_counts?: Json
          last_updated?: string
          model?: string
          n_client_ready?: number
          n_runs?: number
          score_sum?: number
        }
        Relationships: []
      }
      motion_studio_character_variants: {
        Row: {
          character_id: string
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          label: string | null
          metadata: Json
          seed: string | null
          user_id: string
          vibe: string
        }
        Insert: {
          character_id: string
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          label?: string | null
          metadata?: Json
          seed?: string | null
          user_id: string
          vibe: string
        }
        Update: {
          character_id?: string
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          label?: string | null
          metadata?: Json
          seed?: string | null
          user_id?: string
          vibe?: string
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_character_variants_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_characters: {
        Row: {
          consent_recorded_at: string | null
          consent_version: string | null
          created_at: string
          depicts_real_person: boolean
          description: string
          id: string
          is_ai_generated: boolean
          name: string
          reference_image_seed: string | null
          reference_image_url: string | null
          signature_items: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
          voice_id: string | null
          workspace_id: string | null
        }
        Insert: {
          consent_recorded_at?: string | null
          consent_version?: string | null
          created_at?: string
          depicts_real_person?: boolean
          description?: string
          id?: string
          is_ai_generated?: boolean
          name: string
          reference_image_seed?: string | null
          reference_image_url?: string | null
          signature_items?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
          voice_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          consent_recorded_at?: string | null
          consent_version?: string | null
          created_at?: string
          depicts_real_person?: boolean
          description?: string
          id?: string
          is_ai_generated?: boolean
          name?: string
          reference_image_seed?: string | null
          reference_image_url?: string | null
          signature_items?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          voice_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_characters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_location_variants: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_primary: boolean
          label: string | null
          location_id: string
          metadata: Json
          seed: string | null
          user_id: string
          vibe: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_primary?: boolean
          label?: string | null
          location_id: string
          metadata?: Json
          seed?: string | null
          user_id: string
          vibe: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_primary?: boolean
          label?: string | null
          location_id?: string
          metadata?: Json
          seed?: string | null
          user_id?: string
          vibe?: string
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_location_variants_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_locations: {
        Row: {
          consent_recorded_at: string | null
          consent_version: string | null
          created_at: string
          description: string
          id: string
          is_ai_generated: boolean
          lighting_notes: string | null
          name: string
          reference_image_url: string | null
          tags: string[] | null
          updated_at: string
          usage_count: number
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          consent_recorded_at?: string | null
          consent_version?: string | null
          created_at?: string
          description?: string
          id?: string
          is_ai_generated?: boolean
          lighting_notes?: string | null
          name: string
          reference_image_url?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          consent_recorded_at?: string | null
          consent_version?: string | null
          created_at?: string
          description?: string
          id?: string
          is_ai_generated?: boolean
          lighting_notes?: string | null
          name?: string
          reference_image_url?: string | null
          tags?: string[] | null
          updated_at?: string
          usage_count?: number
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_scene_snippets: {
        Row: {
          attribution_name: string | null
          attribution_url: string | null
          cast_character_ids: string[] | null
          category: string | null
          clip_url: string | null
          cloned_from: string | null
          created_at: string
          description: string | null
          duration_seconds: number | null
          id: string
          is_public: boolean
          is_system: boolean
          last_frame_url: string | null
          like_count: number
          location_id: string | null
          metadata: Json
          name: string
          preview_video_url: string | null
          prompt: string
          published_at: string | null
          reference_image_url: string | null
          sort_order: number
          source: string | null
          tags: string[] | null
          thumbnail_url: string | null
          updated_at: string
          usage_count: number
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          attribution_name?: string | null
          attribution_url?: string | null
          cast_character_ids?: string[] | null
          category?: string | null
          clip_url?: string | null
          cloned_from?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_public?: boolean
          is_system?: boolean
          last_frame_url?: string | null
          like_count?: number
          location_id?: string | null
          metadata?: Json
          name: string
          preview_video_url?: string | null
          prompt: string
          published_at?: string | null
          reference_image_url?: string | null
          sort_order?: number
          source?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          attribution_name?: string | null
          attribution_url?: string | null
          cast_character_ids?: string[] | null
          category?: string | null
          clip_url?: string | null
          cloned_from?: string | null
          created_at?: string
          description?: string | null
          duration_seconds?: number | null
          id?: string
          is_public?: boolean
          is_system?: boolean
          last_frame_url?: string | null
          like_count?: number
          location_id?: string | null
          metadata?: Json
          name?: string
          preview_video_url?: string | null
          prompt?: string
          published_at?: string | null
          reference_image_url?: string | null
          sort_order?: number
          source?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_scene_snippets_cloned_from_fkey"
            columns: ["cloned_from"]
            isOneToOne: false
            referencedRelation: "motion_studio_scene_snippets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motion_studio_scene_snippets_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motion_studio_scene_snippets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_snippet_likes: {
        Row: {
          created_at: string
          snippet_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          snippet_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          snippet_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_snippet_likes_snippet_id_fkey"
            columns: ["snippet_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_scene_snippets"
            referencedColumns: ["id"]
          },
        ]
      }
      motion_studio_style_presets: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          director_modifiers: Json
          id: string
          is_public: boolean
          name: string
          preview_thumb_url: string | null
          slots: Json
          updated_at: string
          usage_count: number
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          director_modifiers?: Json
          id?: string
          is_public?: boolean
          name: string
          preview_thumb_url?: string | null
          slots?: Json
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          director_modifiers?: Json
          id?: string
          is_public?: boolean
          name?: string
          preview_thumb_url?: string | null
          slots?: Json
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      motion_studio_templates: {
        Row: {
          aspect_ratio: string
          average_rating: number
          briefing_defaults: Json
          category: string
          created_at: string
          creator_user_id: string | null
          description: string
          duration_seconds: number
          id: string
          is_active: boolean
          is_featured: boolean
          marketplace_status: string
          name: string
          preview_video_url: string | null
          price_credits: number
          pricing_type: string
          published_at: string | null
          rejection_reason: string | null
          revenue_share_percent: number
          reviewed_at: string | null
          reviewed_by: string | null
          scene_suggestions: Json
          sort_order: number
          style: string
          tags: string[]
          thumbnail_url: string | null
          total_purchases: number
          total_ratings: number
          total_revenue_credits: number
          updated_at: string
          usage_count: number
          use_case: string
          workspace_id: string | null
        }
        Insert: {
          aspect_ratio?: string
          average_rating?: number
          briefing_defaults?: Json
          category?: string
          created_at?: string
          creator_user_id?: string | null
          description?: string
          duration_seconds?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          marketplace_status?: string
          name: string
          preview_video_url?: string | null
          price_credits?: number
          pricing_type?: string
          published_at?: string | null
          rejection_reason?: string | null
          revenue_share_percent?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          scene_suggestions?: Json
          sort_order?: number
          style?: string
          tags?: string[]
          thumbnail_url?: string | null
          total_purchases?: number
          total_ratings?: number
          total_revenue_credits?: number
          updated_at?: string
          usage_count?: number
          use_case: string
          workspace_id?: string | null
        }
        Update: {
          aspect_ratio?: string
          average_rating?: number
          briefing_defaults?: Json
          category?: string
          created_at?: string
          creator_user_id?: string | null
          description?: string
          duration_seconds?: number
          id?: string
          is_active?: boolean
          is_featured?: boolean
          marketplace_status?: string
          name?: string
          preview_video_url?: string | null
          price_credits?: number
          pricing_type?: string
          published_at?: string | null
          rejection_reason?: string | null
          revenue_share_percent?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          scene_suggestions?: Json
          sort_order?: number
          style?: string
          tags?: string[]
          thumbnail_url?: string | null
          total_purchases?: number
          total_ratings?: number
          total_revenue_credits?: number
          updated_at?: string
          usage_count?: number
          use_case?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "motion_studio_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      news_hub_articles: {
        Row: {
          batch_id: string | null
          category: string
          created_at: string
          headline: string
          id: string
          image_url: string | null
          language: string
          published_at: string
          source: string | null
          source_url: string | null
          summary: string | null
          video_embed_url: string | null
          video_url: string | null
        }
        Insert: {
          batch_id?: string | null
          category?: string
          created_at?: string
          headline: string
          id?: string
          image_url?: string | null
          language?: string
          published_at?: string
          source?: string | null
          source_url?: string | null
          summary?: string | null
          video_embed_url?: string | null
          video_url?: string | null
        }
        Update: {
          batch_id?: string | null
          category?: string
          created_at?: string
          headline?: string
          id?: string
          image_url?: string | null
          language?: string
          published_at?: string
          source?: string | null
          source_url?: string | null
          summary?: string | null
          video_embed_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      news_radar_cache: {
        Row: {
          fetched_at: string
          id: string
          language: string
          news_json: Json
        }
        Insert: {
          fetched_at?: string
          id?: string
          language?: string
          news_json?: Json
        }
        Update: {
          fetched_at?: string
          id?: string
          language?: string
          news_json?: Json
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          approval_request_notify: boolean | null
          created_at: string | null
          deadline_reminder_hours: number | null
          email_reminders: boolean | null
          in_app_notifications: boolean | null
          push_enabled: boolean
          push_subscription: Json | null
          reminder_pushes_enabled: boolean
          render_complete_notify: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          approval_request_notify?: boolean | null
          created_at?: string | null
          deadline_reminder_hours?: number | null
          email_reminders?: boolean | null
          in_app_notifications?: boolean | null
          push_enabled?: boolean
          push_subscription?: Json | null
          reminder_pushes_enabled?: boolean
          render_complete_notify?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          approval_request_notify?: boolean | null
          created_at?: string | null
          deadline_reminder_hours?: number | null
          email_reminders?: boolean | null
          in_app_notifications?: boolean | null
          push_enabled?: boolean
          push_subscription?: Json | null
          reminder_pushes_enabled?: boolean
          render_complete_notify?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          message: string | null
          metadata: Json | null
          read: boolean | null
          sent_via_email: boolean | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          sent_via_email?: boolean | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          message?: string | null
          metadata?: Json | null
          read?: boolean | null
          sent_via_email?: boolean | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          payload: Json
          sent_at: string
          type: Database["public"]["Enums"]["notification_type"]
          workspace_id: string
        }
        Insert: {
          id?: string
          payload?: Json
          sent_at?: string
          type: Database["public"]["Enums"]["notification_type"]
          workspace_id: string
        }
        Update: {
          id?: string
          payload?: Json
          sent_at?: string
          type?: Database["public"]["Enums"]["notification_type"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_states: {
        Row: {
          code_challenge: string | null
          code_challenge_method: string | null
          code_verifier: string | null
          created_at: string | null
          csrf_token: string
          expires_at: string
          id: string
          provider: string
          redirect_url: string | null
          state: string | null
          user_id: string
        }
        Insert: {
          code_challenge?: string | null
          code_challenge_method?: string | null
          code_verifier?: string | null
          created_at?: string | null
          csrf_token: string
          expires_at: string
          id?: string
          provider: string
          redirect_url?: string | null
          state?: string | null
          user_id: string
        }
        Update: {
          code_challenge?: string | null
          code_challenge_method?: string | null
          code_verifier?: string | null
          created_at?: string | null
          csrf_token?: string
          expires_at?: string
          id?: string
          provider?: string
          redirect_url?: string | null
          state?: string | null
          user_id?: string
        }
        Relationships: []
      }
      onboarding_profiles: {
        Row: {
          business_type: string
          created_at: string
          experience_level: string
          first_video_prompts: Json | null
          id: string
          niche: string
          platforms: string[]
          posting_goal: string
          posts_per_week: number
          user_id: string
        }
        Insert: {
          business_type?: string
          created_at?: string
          experience_level?: string
          first_video_prompts?: Json | null
          id?: string
          niche?: string
          platforms?: string[]
          posting_goal?: string
          posts_per_week?: number
          user_id: string
        }
        Update: {
          business_type?: string
          created_at?: string
          experience_level?: string
          first_video_prompts?: Json | null
          id?: string
          niche?: string
          platforms?: string[]
          posting_goal?: string
          posts_per_week?: number
          user_id?: string
        }
        Relationships: []
      }
      overlay_presets: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean | null
          name: string
          preset_type: string
          thumbnail_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          name: string
          preset_type?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean | null
          name?: string
          preset_type?: string
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payouts: {
        Row: {
          affiliate_id: string
          amount_cents: number
          created_at: string
          currency: string | null
          id: string
          invoice_id: string | null
          paid_at: string | null
          period_end: string
          period_start: string
          referral_id: string | null
          status: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          affiliate_id: string
          amount_cents: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          period_end: string
          period_start: string
          referral_id?: string | null
          status?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          affiliate_id?: string
          amount_cents?: number
          created_at?: string
          currency?: string | null
          id?: string
          invoice_id?: string | null
          paid_at?: string | null
          period_end?: string
          period_start?: string
          referral_id?: string | null
          status?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_ai_insights: {
        Row: {
          created_at: string | null
          date_range_end: string
          date_range_start: string
          id: string
          provider: string | null
          summary_json: Json
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date_range_end: string
          date_range_start: string
          id?: string
          provider?: string | null
          summary_json: Json
          user_id: string
        }
        Update: {
          created_at?: string | null
          date_range_end?: string
          date_range_start?: string
          id?: string
          provider?: string | null
          summary_json?: Json
          user_id?: string
        }
        Relationships: []
      }
      performance_analyses: {
        Row: {
          analysis_json: Json
          created_at: string
          id: string
          platform: string | null
          user_id: string
        }
        Insert: {
          analysis_json?: Json
          created_at?: string
          id?: string
          platform?: string | null
          user_id: string
        }
        Update: {
          analysis_json?: Json
          created_at?: string
          id?: string
          platform?: string | null
          user_id?: string
        }
        Relationships: []
      }
      picture_enhance_runs: {
        Row: {
          contribution_eur: number
          created_at: string
          currency: string
          fx_rate_used: number
          fx_safety_buffer_used: number
          id: string
          margin_pct: number
          model_id: string
          multiplier_used: number | null
          net_revenue_eur: number
          pricing_mode: string
          pricing_version: string
          provider_cost_eur_buffered: number
          provider_cost_usd_estimated: number
          provider_pricing_version: string
          refunded: boolean
          scale: number | null
          status: string
          studio_image_id: string | null
          user_id: string
          user_price_eur: number
        }
        Insert: {
          contribution_eur: number
          created_at?: string
          currency?: string
          fx_rate_used: number
          fx_safety_buffer_used: number
          id?: string
          margin_pct: number
          model_id: string
          multiplier_used?: number | null
          net_revenue_eur: number
          pricing_mode: string
          pricing_version: string
          provider_cost_eur_buffered?: number
          provider_cost_usd_estimated?: number
          provider_pricing_version: string
          refunded?: boolean
          scale?: number | null
          status?: string
          studio_image_id?: string | null
          user_id: string
          user_price_eur: number
        }
        Update: {
          contribution_eur?: number
          created_at?: string
          currency?: string
          fx_rate_used?: number
          fx_safety_buffer_used?: number
          id?: string
          margin_pct?: number
          model_id?: string
          multiplier_used?: number | null
          net_revenue_eur?: number
          pricing_mode?: string
          pricing_version?: string
          provider_cost_eur_buffered?: number
          provider_cost_usd_estimated?: number
          provider_pricing_version?: string
          refunded?: boolean
          scale?: number | null
          status?: string
          studio_image_id?: string | null
          user_id?: string
          user_price_eur?: number
        }
        Relationships: []
      }
      plan_rate_limits: {
        Row: {
          ai_calls_per_minute: number
          api_calls_per_minute: number
          concurrent_ai_jobs: number
          created_at: string | null
          plan_code: string
          storage_quota_mb: number
          updated_at: string | null
        }
        Insert: {
          ai_calls_per_minute: number
          api_calls_per_minute: number
          concurrent_ai_jobs: number
          created_at?: string | null
          plan_code: string
          storage_quota_mb: number
          updated_at?: string | null
        }
        Update: {
          ai_calls_per_minute?: number
          api_calls_per_minute?: number
          concurrent_ai_jobs?: number
          created_at?: string | null
          plan_code?: string
          storage_quota_mb?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      plan_repair_events: {
        Row: {
          actions: string[]
          consistent: boolean
          created_at: string
          duration_source: string | null
          fidelity_mode: string | null
          id: string
          previous_sum: number | null
          previous_total: number | null
          project_id: string | null
          repair_kinds: string[]
          repair_log: Json
          scene_count: number | null
          script_timing_mode: string | null
          total_duration_sec: number | null
          user_id: string
        }
        Insert: {
          actions?: string[]
          consistent?: boolean
          created_at?: string
          duration_source?: string | null
          fidelity_mode?: string | null
          id?: string
          previous_sum?: number | null
          previous_total?: number | null
          project_id?: string | null
          repair_kinds?: string[]
          repair_log?: Json
          scene_count?: number | null
          script_timing_mode?: string | null
          total_duration_sec?: number | null
          user_id: string
        }
        Update: {
          actions?: string[]
          consistent?: boolean
          created_at?: string
          duration_source?: string | null
          fidelity_mode?: string | null
          id?: string
          previous_sum?: number | null
          previous_total?: number | null
          project_id?: string | null
          repair_kinds?: string[]
          repair_log?: Json
          scene_count?: number | null
          script_timing_mode?: string | null
          total_duration_sec?: number | null
          user_id?: string
        }
        Relationships: []
      }
      plate_attempts: {
        Row: {
          clip_url: string | null
          completed_at: string | null
          continuity_source_clip_url: string | null
          created_at: string
          expected_plate_generation: number
          id: string
          provider: string | null
          provider_job_id: string | null
          run_id: string | null
          scene_id: string
          status: string
          superseded_at: string | null
          superseded_by_generation: number | null
          updated_at: string
        }
        Insert: {
          clip_url?: string | null
          completed_at?: string | null
          continuity_source_clip_url?: string | null
          created_at?: string
          expected_plate_generation: number
          id?: string
          provider?: string | null
          provider_job_id?: string | null
          run_id?: string | null
          scene_id: string
          status?: string
          superseded_at?: string | null
          superseded_by_generation?: number | null
          updated_at?: string
        }
        Update: {
          clip_url?: string | null
          completed_at?: string | null
          continuity_source_clip_url?: string | null
          created_at?: string
          expected_plate_generation?: number
          id?: string
          provider?: string | null
          provider_job_id?: string | null
          run_id?: string | null
          scene_id?: string
          status?: string
          superseded_at?: string | null
          superseded_by_generation?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plate_attempts_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          priority: string
          title: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          priority?: string
          title: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          priority?: string
          title?: string
        }
        Relationships: []
      }
      platform_credentials: {
        Row: {
          created_at: string | null
          id: string
          is_connected: boolean | null
          last_verified_at: string | null
          platform: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          platform: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          platform?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_limits: {
        Row: {
          config: Json | null
          created_at: string | null
          id: string
          max_caption_length: number | null
          max_hashtags: number | null
          max_media_count: number | null
          platform: string
          rate_limit_per_hour: number | null
          supported_ratios: string[] | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          id?: string
          max_caption_length?: number | null
          max_hashtags?: number | null
          max_media_count?: number | null
          platform: string
          rate_limit_per_hour?: number | null
          supported_ratios?: string[] | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          id?: string
          max_caption_length?: number | null
          max_hashtags?: number | null
          max_media_count?: number | null
          platform?: string
          rate_limit_per_hour?: number | null
          supported_ratios?: string[] | null
        }
        Relationships: []
      }
      post_designs: {
        Row: {
          brand_kit_id: string | null
          created_at: string
          design: Json
          format: string
          id: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          brand_kit_id?: string | null
          created_at?: string
          design: Json
          format?: string
          id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          brand_kit_id?: string | null
          created_at?: string
          design?: Json
          format?: string
          id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      post_drafts: {
        Row: {
          ai_output_json: Json | null
          alt_text: string | null
          brand_kit_id: string | null
          brief: string
          caption: string
          caption_b: string | null
          compliance: Json | null
          created_at: string
          crops: Json | null
          cta_input: string | null
          export_bundle_url: string | null
          exported_at: string | null
          hashtags: Json
          hooks: Json
          id: string
          image_url: string | null
          image_urls: Json | null
          languages: Json
          media_type: string | null
          media_url: string | null
          options: Json
          platforms: Json
          review_id: string | null
          scores: Json | null
          status: string
          style_preset: string
          tone_override: string | null
          updated_at: string
          user_id: string
          utm: Json | null
          utm_link: string | null
        }
        Insert: {
          ai_output_json?: Json | null
          alt_text?: string | null
          brand_kit_id?: string | null
          brief: string
          caption: string
          caption_b?: string | null
          compliance?: Json | null
          created_at?: string
          crops?: Json | null
          cta_input?: string | null
          export_bundle_url?: string | null
          exported_at?: string | null
          hashtags?: Json
          hooks?: Json
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          languages?: Json
          media_type?: string | null
          media_url?: string | null
          options?: Json
          platforms?: Json
          review_id?: string | null
          scores?: Json | null
          status?: string
          style_preset?: string
          tone_override?: string | null
          updated_at?: string
          user_id: string
          utm?: Json | null
          utm_link?: string | null
        }
        Update: {
          ai_output_json?: Json | null
          alt_text?: string | null
          brand_kit_id?: string | null
          brief?: string
          caption?: string
          caption_b?: string | null
          compliance?: Json | null
          created_at?: string
          crops?: Json | null
          cta_input?: string | null
          export_bundle_url?: string | null
          exported_at?: string | null
          hashtags?: Json
          hooks?: Json
          id?: string
          image_url?: string | null
          image_urls?: Json | null
          languages?: Json
          media_type?: string | null
          media_url?: string | null
          options?: Json
          platforms?: Json
          review_id?: string | null
          scores?: Json | null
          status?: string
          style_preset?: string
          tone_override?: string | null
          updated_at?: string
          user_id?: string
          utm?: Json | null
          utm_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_drafts_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      post_jobs: {
        Row: {
          calendar_event_id: string | null
          content_snapshot: Json
          created_at: string | null
          error: string | null
          id: string
          platform: string
          posted_at: string | null
          run_at: string
          schedule_id: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          content_snapshot: Json
          created_at?: string | null
          error?: string | null
          id?: string
          platform: string
          posted_at?: string | null
          run_at: string
          schedule_id?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          calendar_event_id?: string | null
          content_snapshot?: Json
          created_at?: string | null
          error?: string | null
          id?: string
          platform?: string
          posted_at?: string | null
          run_at?: string
          schedule_id?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_jobs_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_jobs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "schedule_blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      post_metrics: {
        Row: {
          account_id: string
          caption_text: string | null
          comments: number | null
          engagement_rate: number | null
          external_id: string | null
          fetched_at: string | null
          id: string
          imported_at: string | null
          impressions: number | null
          likes: number | null
          media_type: string | null
          post_id: string
          post_url: string | null
          posted_at: string
          provider: string
          reach: number | null
          reshares: number | null
          saves: number | null
          shares: number | null
          user_id: string
          video_views: number | null
        }
        Insert: {
          account_id: string
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: number | null
          external_id?: string | null
          fetched_at?: string | null
          id?: string
          imported_at?: string | null
          impressions?: number | null
          likes?: number | null
          media_type?: string | null
          post_id: string
          post_url?: string | null
          posted_at: string
          provider: string
          reach?: number | null
          reshares?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
          video_views?: number | null
        }
        Update: {
          account_id?: string
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: number | null
          external_id?: string | null
          fetched_at?: string | null
          id?: string
          imported_at?: string | null
          impressions?: number | null
          likes?: number | null
          media_type?: string | null
          post_id?: string
          post_url?: string | null
          posted_at?: string
          provider?: string
          reach?: number | null
          reshares?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          video_views?: number | null
        }
        Relationships: []
      }
      post_optimizations: {
        Row: {
          applied_at: string | null
          applied_improvements: string[] | null
          created_at: string | null
          draft_id: string | null
          id: string
          optimization_score: number | null
          original_data: Json
          performance_after: Json | null
          performance_before: Json | null
          post_id: string | null
          suggested_improvements: Json
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          applied_improvements?: string[] | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          optimization_score?: number | null
          original_data: Json
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          suggested_improvements: Json
          user_id: string
        }
        Update: {
          applied_at?: string | null
          applied_improvements?: string[] | null
          created_at?: string | null
          draft_id?: string | null
          id?: string
          optimization_score?: number | null
          original_data?: Json
          performance_after?: Json | null
          performance_before?: Json | null
          post_id?: string | null
          suggested_improvements?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_optimizations_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "post_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_optimizations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_time_advice: {
        Row: {
          ai_result_json: Json
          created_at: string
          goal: string | null
          id: string
          niche: string | null
          platform: string
          timezone: string
          user_id: string
        }
        Insert: {
          ai_result_json: Json
          created_at?: string
          goal?: string | null
          id?: string
          niche?: string | null
          platform: string
          timezone: string
          user_id: string
        }
        Update: {
          ai_result_json?: Json
          created_at?: string
          goal?: string | null
          id?: string
          niche?: string | null
          platform?: string
          timezone?: string
          user_id?: string
        }
        Relationships: []
      }
      posting_slots: {
        Row: {
          account_id: string
          features: Json | null
          generated_at: string
          id: string
          platform: string
          reasons: string[] | null
          score: number
          slot_end: string
          slot_start: string
          user_id: string
        }
        Insert: {
          account_id: string
          features?: Json | null
          generated_at?: string
          id?: string
          platform: string
          reasons?: string[] | null
          score: number
          slot_end: string
          slot_start: string
          user_id: string
        }
        Update: {
          account_id?: string
          features?: Json | null
          generated_at?: string
          id?: string
          platform?: string
          reasons?: string[] | null
          score?: number
          slot_end?: string
          slot_start?: string
          user_id?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          brand_kit_id: string | null
          caption: string | null
          created_at: string | null
          error_message: string | null
          external_post_id: string | null
          id: string
          image_url: string | null
          media_urls: Json | null
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: Database["public"]["Enums"]["post_status"]
          tags: Json | null
          timezone: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          image_url?: string | null
          media_urls?: Json | null
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tags?: Json | null
          timezone?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          brand_kit_id?: string | null
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          external_post_id?: string | null
          id?: string
          image_url?: string | null
          media_urls?: Json | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: Database["public"]["Enums"]["post_status"]
          tags?: Json | null
          timezone?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      posts_history: {
        Row: {
          account_id: string
          clicks: number | null
          comments: number | null
          created_at: string | null
          engagement_score: number | null
          id: string
          impressions: number | null
          likes: number | null
          platform: string
          post_id: string
          published_at: string
          raw: Json | null
          reach: number | null
          saves: number | null
          shares: number | null
          user_id: string
          watch_time_seconds: number | null
        }
        Insert: {
          account_id: string
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform: string
          post_id: string
          published_at: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id: string
          watch_time_seconds?: number | null
        }
        Update: {
          account_id?: string
          clicks?: number | null
          comments?: number | null
          created_at?: string | null
          engagement_score?: number | null
          id?: string
          impressions?: number | null
          likes?: number | null
          platform?: string
          post_id?: string
          published_at?: string
          raw?: Json | null
          reach?: number | null
          saves?: number | null
          shares?: number | null
          user_id?: string
          watch_time_seconds?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_paused: boolean | null
          account_type: string
          activation_emails_sent: Json | null
          ai_discount_percent: number
          analytics_enabled: boolean | null
          api_key: string | null
          autopilot_permanently_locked: boolean
          avatar_url: string | null
          brand_color: string | null
          brand_name: string | null
          created_at: string | null
          current_period_end: string | null
          drip_emails_enabled: boolean
          email: string
          email_verified: boolean | null
          email_verified_at: string | null
          id: string
          is_test_account: boolean
          is_test_user: boolean
          language: string | null
          last_active_at: string | null
          last_marketing_email_at: string | null
          level_auto_pause_until: string | null
          login_notification_enabled: boolean | null
          name: string | null
          onboarding_completed: boolean | null
          personalized_recommendations: boolean | null
          phone_number: string | null
          plan: string | null
          qa_budget_cents: number
          security_alerts_enabled: boolean | null
          sora2_grandfathered: boolean
          storage_limit_mb: number | null
          storage_used_mb: number | null
          strategy_mode_activated_at: string | null
          strategy_mode_enabled: boolean
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          terminated_at: string | null
          terminated_reason: string | null
          test_mode_plan: string | null
          timezone: string | null
          tour_completed_at: string | null
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_status: string | null
          twitch_username: string | null
          unsubscribe_token: string
          updated_at: string | null
          upgrade_prompts_dismissed: Json
          verify_reminder_sent_at: string | null
          welcome_bonus_granted_at: string | null
          welcome_bonus_seen_at: string | null
        }
        Insert: {
          account_paused?: boolean | null
          account_type?: string
          activation_emails_sent?: Json | null
          ai_discount_percent?: number
          analytics_enabled?: boolean | null
          api_key?: string | null
          autopilot_permanently_locked?: boolean
          avatar_url?: string | null
          brand_color?: string | null
          brand_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          drip_emails_enabled?: boolean
          email: string
          email_verified?: boolean | null
          email_verified_at?: string | null
          id: string
          is_test_account?: boolean
          is_test_user?: boolean
          language?: string | null
          last_active_at?: string | null
          last_marketing_email_at?: string | null
          level_auto_pause_until?: string | null
          login_notification_enabled?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          personalized_recommendations?: boolean | null
          phone_number?: string | null
          plan?: string | null
          qa_budget_cents?: number
          security_alerts_enabled?: boolean | null
          sora2_grandfathered?: boolean
          storage_limit_mb?: number | null
          storage_used_mb?: number | null
          strategy_mode_activated_at?: string | null
          strategy_mode_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          terminated_at?: string | null
          terminated_reason?: string | null
          test_mode_plan?: string | null
          timezone?: string | null
          tour_completed_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          twitch_username?: string | null
          unsubscribe_token?: string
          updated_at?: string | null
          upgrade_prompts_dismissed?: Json
          verify_reminder_sent_at?: string | null
          welcome_bonus_granted_at?: string | null
          welcome_bonus_seen_at?: string | null
        }
        Update: {
          account_paused?: boolean | null
          account_type?: string
          activation_emails_sent?: Json | null
          ai_discount_percent?: number
          analytics_enabled?: boolean | null
          api_key?: string | null
          autopilot_permanently_locked?: boolean
          avatar_url?: string | null
          brand_color?: string | null
          brand_name?: string | null
          created_at?: string | null
          current_period_end?: string | null
          drip_emails_enabled?: boolean
          email?: string
          email_verified?: boolean | null
          email_verified_at?: string | null
          id?: string
          is_test_account?: boolean
          is_test_user?: boolean
          language?: string | null
          last_active_at?: string | null
          last_marketing_email_at?: string | null
          level_auto_pause_until?: string | null
          login_notification_enabled?: boolean | null
          name?: string | null
          onboarding_completed?: boolean | null
          personalized_recommendations?: boolean | null
          phone_number?: string | null
          plan?: string | null
          qa_budget_cents?: number
          security_alerts_enabled?: boolean | null
          sora2_grandfathered?: boolean
          storage_limit_mb?: number | null
          storage_used_mb?: number | null
          strategy_mode_activated_at?: string | null
          strategy_mode_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          terminated_at?: string | null
          terminated_reason?: string | null
          test_mode_plan?: string | null
          timezone?: string | null
          tour_completed_at?: string | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_status?: string | null
          twitch_username?: string | null
          unsubscribe_token?: string
          updated_at?: string | null
          upgrade_prompts_dismissed?: Json
          verify_reminder_sent_at?: string | null
          welcome_bonus_granted_at?: string | null
          welcome_bonus_seen_at?: string | null
        }
        Relationships: []
      }
      project_collaborators: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: string
          invited_by: string
          project_id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by: string
          project_id: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: string
          invited_by?: string
          project_id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_collaborators_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_share_links: {
        Row: {
          allow_comments: boolean
          allow_download: boolean
          created_at: string
          created_by: string
          current_views: number
          expires_at: string
          id: string
          max_views: number | null
          password_hash: string | null
          project_id: string
          require_password: boolean
          share_token: string
        }
        Insert: {
          allow_comments?: boolean
          allow_download?: boolean
          created_at?: string
          created_by: string
          current_views?: number
          expires_at: string
          id?: string
          max_views?: number | null
          password_hash?: string | null
          project_id: string
          require_password?: boolean
          share_token: string
        }
        Update: {
          allow_comments?: boolean
          allow_download?: boolean
          created_at?: string
          created_by?: string
          current_views?: number
          expires_at?: string
          id?: string
          max_views?: number | null
          password_hash?: string | null
          project_id?: string
          require_password?: boolean
          share_token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_share_links_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          active: boolean | null
          affiliate_id: string | null
          benefit_label_de: string | null
          benefit_label_en: string | null
          benefit_label_es: string | null
          code: string
          created_at: string
          discount_percent: number | null
          duration_months: number | null
          id: string
          kind: string
          max_redemptions: number | null
          redemptions_count: number | null
          stripe_promo_id: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean | null
          affiliate_id?: string | null
          benefit_label_de?: string | null
          benefit_label_en?: string | null
          benefit_label_es?: string | null
          code: string
          created_at?: string
          discount_percent?: number | null
          duration_months?: number | null
          id?: string
          kind?: string
          max_redemptions?: number | null
          redemptions_count?: number | null
          stripe_promo_id: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean | null
          affiliate_id?: string | null
          benefit_label_de?: string | null
          benefit_label_en?: string | null
          benefit_label_es?: string | null
          code?: string
          created_at?: string
          discount_percent?: number | null
          duration_months?: number | null
          id?: string
          kind?: string
          max_redemptions?: number | null
          redemptions_count?: number | null
          stripe_promo_id?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_redemptions: {
        Row: {
          applied_at: string | null
          code: string
          created_at: string
          id: string
          promo_code_id: string
          status: string
          stripe_session_id: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          code: string
          created_at?: string
          id?: string
          promo_code_id: string
          status?: string
          stripe_session_id?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          code?: string
          created_at?: string
          id?: string
          promo_code_id?: string
          status?: string
          stripe_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      prompts: {
        Row: {
          business_type: string
          created_at: string
          explanation: string
          goal: string
          id: string
          keywords: string | null
          optimized_prompt: string
          platform: string
          sample_caption: string
          tone: string
          user_id: string
        }
        Insert: {
          business_type: string
          created_at?: string
          explanation: string
          goal: string
          id?: string
          keywords?: string | null
          optimized_prompt: string
          platform: string
          sample_caption: string
          tone: string
          user_id: string
        }
        Update: {
          business_type?: string
          created_at?: string
          explanation?: string
          goal?: string
          id?: string
          keywords?: string | null
          optimized_prompt?: string
          platform?: string
          sample_caption?: string
          tone?: string
          user_id?: string
        }
        Relationships: []
      }
      prop_catalog_previews: {
        Row: {
          created_at: string
          id: string
          image_url: string
          label: string
          prompt: string | null
          storage_path: string | null
          theme_pack: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          label: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          label?: string
          prompt?: string | null
          storage_path?: string | null
          theme_pack?: string
        }
        Relationships: []
      }
      provider_circuit_state: {
        Row: {
          fail_count: number
          half_open_at: string | null
          last_error_class: string | null
          last_failure_at: string | null
          last_success_at: string | null
          meta: Json
          opened_at: string | null
          provider: string
          state: string
          updated_at: string
        }
        Insert: {
          fail_count?: number
          half_open_at?: string | null
          last_error_class?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          meta?: Json
          opened_at?: string | null
          provider: string
          state?: string
          updated_at?: string
        }
        Update: {
          fail_count?: number
          half_open_at?: string | null
          last_error_class?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          meta?: Json
          opened_at?: string | null
          provider?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      provider_quota_log: {
        Row: {
          created_at: string
          endpoint: string | null
          error_message: string | null
          id: string
          provider: string
          rate_limit_remaining: number | null
          rate_limit_total: number | null
          response_time_ms: number | null
          status_code: number | null
          success: boolean
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          provider: string
          rate_limit_remaining?: number | null
          rate_limit_total?: number | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          provider?: string
          rate_limit_remaining?: number | null
          rate_limit_total?: number | null
          response_time_ms?: number | null
          status_code?: number | null
          success?: boolean
        }
        Relationships: []
      }
      publish_jobs: {
        Row: {
          channel_offsets: Json | null
          channels: string[]
          content_hash: string | null
          created_at: string
          id: string
          media: Json | null
          text_content: string | null
          user_id: string
        }
        Insert: {
          channel_offsets?: Json | null
          channels: string[]
          content_hash?: string | null
          created_at?: string
          id?: string
          media?: Json | null
          text_content?: string | null
          user_id: string
        }
        Update: {
          channel_offsets?: Json | null
          channels?: string[]
          content_hash?: string | null
          created_at?: string
          id?: string
          media?: Json | null
          text_content?: string | null
          user_id?: string
        }
        Relationships: []
      }
      publish_logs: {
        Row: {
          created_at: string | null
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          id: string
          job_id: string | null
          provider: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          provider: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          job_id?: string | null
          provider?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publish_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_results: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          external_id: string | null
          id: string
          job_id: string
          ok: boolean
          permalink: string | null
          provider: string
          transform_report: Json | null
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          job_id: string
          ok: boolean
          permalink?: string | null
          provider: string
          transform_report?: Json | null
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          job_id?: string
          ok?: boolean
          permalink?: string | null
          provider?: string
          transform_report?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "publish_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "publish_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      push_reminder_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          progress_at_send: number | null
          reminder_step: number
          sent_at: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          progress_at_send?: number | null
          reminder_step: number
          sent_at?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          progress_at_send?: number | null
          reminder_step?: number
          sent_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      qa_baselines: {
        Row: {
          captured_at: string
          dom_snapshot_hash: string | null
          id: string
          mission_id: string | null
          performance_cls: number | null
          performance_js_heap_mb: number | null
          performance_lcp_ms: number | null
          screenshot_hash: string | null
          screenshot_url: string | null
          step_index: number
          step_name: string | null
        }
        Insert: {
          captured_at?: string
          dom_snapshot_hash?: string | null
          id?: string
          mission_id?: string | null
          performance_cls?: number | null
          performance_js_heap_mb?: number | null
          performance_lcp_ms?: number | null
          screenshot_hash?: string | null
          screenshot_url?: string | null
          step_index: number
          step_name?: string | null
        }
        Update: {
          captured_at?: string
          dom_snapshot_hash?: string | null
          id?: string
          mission_id?: string | null
          performance_cls?: number | null
          performance_js_heap_mb?: number | null
          performance_lcp_ms?: number | null
          screenshot_hash?: string | null
          screenshot_url?: string | null
          step_index?: number
          step_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qa_baselines_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "qa_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_budget_ledger: {
        Row: {
          budgeted_cents: number
          category: string
          hard_cap_cents: number
          id: string
          period: string
          period_start: string
          spent_cents: number
          updated_at: string
        }
        Insert: {
          budgeted_cents?: number
          category: string
          hard_cap_cents?: number
          id?: string
          period: string
          period_start: string
          spent_cents?: number
          updated_at?: string
        }
        Update: {
          budgeted_cents?: number
          category?: string
          hard_cap_cents?: number
          id?: string
          period?: string
          period_start?: string
          spent_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      qa_bug_reports: {
        Row: {
          category: string
          console_log: Json | null
          created_at: string
          description: string | null
          diff_from_baseline: Json | null
          id: string
          mission_name: string
          network_trace: Json | null
          reproduce_steps: Json
          resolved_at: string | null
          resolved_by: string | null
          route: string | null
          run_id: string | null
          screenshot_url: string | null
          severity: string
          status: string
          step_index: number | null
          title: string
        }
        Insert: {
          category: string
          console_log?: Json | null
          created_at?: string
          description?: string | null
          diff_from_baseline?: Json | null
          id?: string
          mission_name: string
          network_trace?: Json | null
          reproduce_steps?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          run_id?: string | null
          screenshot_url?: string | null
          severity: string
          status?: string
          step_index?: number | null
          title: string
        }
        Update: {
          category?: string
          console_log?: Json | null
          created_at?: string
          description?: string | null
          diff_from_baseline?: Json | null
          id?: string
          mission_name?: string
          network_trace?: Json | null
          reproduce_steps?: Json
          resolved_at?: string | null
          resolved_by?: string | null
          route?: string | null
          run_id?: string | null
          screenshot_url?: string | null
          severity?: string
          status?: string
          step_index?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_bug_reports_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "qa_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_deep_sweep_flow_results: {
        Row: {
          actual_cost_eur: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          estimated_cost_eur: number
          finished_at: string | null
          flow_index: number
          flow_name: string
          id: string
          output_url: string | null
          run_id: string
          stage_log: Json
          started_at: string | null
          status: string
          validation_checks: Json
        }
        Insert: {
          actual_cost_eur?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_eur?: number
          finished_at?: string | null
          flow_index: number
          flow_name: string
          id?: string
          output_url?: string | null
          run_id: string
          stage_log?: Json
          started_at?: string | null
          status?: string
          validation_checks?: Json
        }
        Update: {
          actual_cost_eur?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_eur?: number
          finished_at?: string | null
          flow_index?: number
          flow_name?: string
          id?: string
          output_url?: string | null
          run_id?: string
          stage_log?: Json
          started_at?: string | null
          status?: string
          validation_checks?: Json
        }
        Relationships: [
          {
            foreignKeyName: "qa_deep_sweep_flow_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "qa_deep_sweep_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_deep_sweep_runs: {
        Row: {
          cap_eur: number
          created_at: string
          finished_at: string | null
          flows_failed: number
          flows_skipped: number
          flows_succeeded: number
          flows_total: number
          id: string
          notes: string | null
          started_at: string
          status: string
          total_cost_eur: number
          triggered_by: string | null
        }
        Insert: {
          cap_eur?: number
          created_at?: string
          finished_at?: string | null
          flows_failed?: number
          flows_skipped?: number
          flows_succeeded?: number
          flows_total?: number
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          total_cost_eur?: number
          triggered_by?: string | null
        }
        Update: {
          cap_eur?: number
          created_at?: string
          finished_at?: string | null
          flows_failed?: number
          flows_skipped?: number
          flows_succeeded?: number
          flows_total?: number
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          total_cost_eur?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      qa_live_budget: {
        Row: {
          cap_eur: number
          created_at: string
          id: string
          last_run_at: string | null
          period_start: string
          spent_eur: number
          updated_at: string
        }
        Insert: {
          cap_eur?: number
          created_at?: string
          id?: string
          last_run_at?: string | null
          period_start?: string
          spent_eur?: number
          updated_at?: string
        }
        Update: {
          cap_eur?: number
          created_at?: string
          id?: string
          last_run_at?: string | null
          period_start?: string
          spent_eur?: number
          updated_at?: string
        }
        Relationships: []
      }
      qa_live_runs: {
        Row: {
          asset_url: string | null
          completed_at: string | null
          cost_eur: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          estimated_cost_eur: number
          id: string
          mode: string
          model: string | null
          provider: string
          raw_response: Json | null
          refund_verified: boolean | null
          started_at: string
          status: string
          sweep_id: string
        }
        Insert: {
          asset_url?: string | null
          completed_at?: string | null
          cost_eur?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_eur?: number
          id?: string
          mode: string
          model?: string | null
          provider: string
          raw_response?: Json | null
          refund_verified?: boolean | null
          started_at?: string
          status: string
          sweep_id: string
        }
        Update: {
          asset_url?: string | null
          completed_at?: string | null
          cost_eur?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          estimated_cost_eur?: number
          id?: string
          mode?: string
          model?: string | null
          provider?: string
          raw_response?: Json | null
          refund_verified?: boolean | null
          started_at?: string
          status?: string
          sweep_id?: string
        }
        Relationships: []
      }
      qa_missions: {
        Row: {
          category: string
          cost_cap_cents: number
          cost_real_providers: string[]
          created_at: string
          description: string | null
          enabled: boolean
          expected_assertions: Json
          id: string
          last_run_at: string | null
          mock_mode: boolean
          name: string
          rate_limit_minutes: number
          steps: Json
          tier: string
          updated_at: string
        }
        Insert: {
          category?: string
          cost_cap_cents?: number
          cost_real_providers?: string[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          expected_assertions?: Json
          id?: string
          last_run_at?: string | null
          mock_mode?: boolean
          name: string
          rate_limit_minutes?: number
          steps?: Json
          tier: string
          updated_at?: string
        }
        Update: {
          category?: string
          cost_cap_cents?: number
          cost_real_providers?: string[]
          created_at?: string
          description?: string | null
          enabled?: boolean
          expected_assertions?: Json
          id?: string
          last_run_at?: string | null
          mock_mode?: boolean
          name?: string
          rate_limit_minutes?: number
          steps?: Json
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      qa_muted_patterns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          mission_pattern: string | null
          pattern_regex: string
          reason: string | null
          severity_when_matched: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          mission_pattern?: string | null
          pattern_regex: string
          reason?: string | null
          severity_when_matched?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          mission_pattern?: string | null
          pattern_regex?: string
          reason?: string | null
          severity_when_matched?: string
        }
        Relationships: []
      }
      qa_provider_rotation: {
        Row: {
          avg_cost_cents: number
          category: string
          enabled: boolean
          id: string
          last_real_test_at: string | null
          next_due_at: string | null
          provider: string
          total_failures: number
          total_tests: number
        }
        Insert: {
          avg_cost_cents?: number
          category: string
          enabled?: boolean
          id?: string
          last_real_test_at?: string | null
          next_due_at?: string | null
          provider: string
          total_failures?: number
          total_tests?: number
        }
        Update: {
          avg_cost_cents?: number
          category?: string
          enabled?: boolean
          id?: string
          last_real_test_at?: string | null
          next_due_at?: string | null
          provider?: string
          total_failures?: number
          total_tests?: number
        }
        Relationships: []
      }
      qa_smoke_runs: {
        Row: {
          category: string
          created_at: string
          duration_ms: number | null
          error: string | null
          function_name: string
          id: string
          response_hash: string | null
          status: string
          status_code: number | null
          sweep_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          function_name: string
          id?: string
          response_hash?: string | null
          status: string
          status_code?: number | null
          sweep_id: string
        }
        Update: {
          category?: string
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          function_name?: string
          id?: string
          response_hash?: string | null
          status?: string
          status_code?: number | null
          sweep_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_smoke_runs_sweep_id_fkey"
            columns: ["sweep_id"]
            isOneToOne: false
            referencedRelation: "qa_smoke_sweeps"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_smoke_sweeps: {
        Row: {
          category_filter: string | null
          duration_ms: number | null
          fail_count: number
          finished_at: string | null
          id: string
          pass_count: number
          skip_count: number
          source: string
          started_at: string
          timeout_count: number
          total: number
          triggered_by: string | null
        }
        Insert: {
          category_filter?: string | null
          duration_ms?: number | null
          fail_count?: number
          finished_at?: string | null
          id?: string
          pass_count?: number
          skip_count?: number
          source?: string
          started_at?: string
          timeout_count?: number
          total?: number
          triggered_by?: string | null
        }
        Update: {
          category_filter?: string | null
          duration_ms?: number | null
          fail_count?: number
          finished_at?: string | null
          id?: string
          pass_count?: number
          skip_count?: number
          source?: string
          started_at?: string
          timeout_count?: number
          total?: number
          triggered_by?: string | null
        }
        Relationships: []
      }
      qa_stats_contributions: {
        Row: {
          analysis_source: string
          client_ready: boolean
          content_category: string
          created_at: string
          generation_id: string
          generation_mode: string
          id: string
          invalidated_at: string | null
          invalidated_reason: string | null
          issues: Json
          model: string
          overall: number
          shot_id: string
          valid: boolean
        }
        Insert: {
          analysis_source?: string
          client_ready: boolean
          content_category: string
          created_at?: string
          generation_id: string
          generation_mode: string
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          issues?: Json
          model: string
          overall?: number
          shot_id: string
          valid?: boolean
        }
        Update: {
          analysis_source?: string
          client_ready?: boolean
          content_category?: string
          created_at?: string
          generation_id?: string
          generation_mode?: string
          id?: string
          invalidated_at?: string | null
          invalidated_reason?: string | null
          issues?: Json
          model?: string
          overall?: number
          shot_id?: string
          valid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "qa_stats_contributions_shot_id_fkey"
            columns: ["shot_id"]
            isOneToOne: false
            referencedRelation: "campaign_shots"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_test_assets: {
        Row: {
          asset_type: string
          created_at: string
          duration_seconds: number | null
          height: number | null
          id: string
          metadata: Json
          storage_path: string | null
          tags: string[]
          url: string
          width: number | null
        }
        Insert: {
          asset_type: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          storage_path?: string | null
          tags?: string[]
          url: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          duration_seconds?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          storage_path?: string | null
          tags?: string[]
          url?: string
          width?: number | null
        }
        Relationships: []
      }
      qa_test_runs: {
        Row: {
          baseline_run_id: string | null
          bugs_found: number | null
          cost_actual_cents: number
          cost_budgeted_cents: number
          created_at: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          last_screenshot_url: string | null
          log_summary: string | null
          metadata: Json
          mission_id: string | null
          mission_name: string
          started_at: string
          status: string
          steps_completed: number | null
          steps_total: number | null
          tier: string
          triggered_by: string
        }
        Insert: {
          baseline_run_id?: string | null
          bugs_found?: number | null
          cost_actual_cents?: number
          cost_budgeted_cents?: number
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          last_screenshot_url?: string | null
          log_summary?: string | null
          metadata?: Json
          mission_id?: string | null
          mission_name: string
          started_at?: string
          status?: string
          steps_completed?: number | null
          steps_total?: number | null
          tier: string
          triggered_by?: string
        }
        Update: {
          baseline_run_id?: string | null
          bugs_found?: number | null
          cost_actual_cents?: number
          cost_budgeted_cents?: number
          created_at?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          last_screenshot_url?: string | null
          log_summary?: string | null
          metadata?: Json
          mission_id?: string | null
          mission_name?: string
          started_at?: string
          status?: string
          steps_completed?: number | null
          steps_total?: number | null
          tier?: string
          triggered_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_test_runs_baseline_run_id_fkey"
            columns: ["baseline_run_id"]
            isOneToOne: false
            referencedRelation: "qa_test_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qa_test_runs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "qa_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_watchdog_runs: {
        Row: {
          anomalies_found: number
          bugs_created: number
          duration_ms: number | null
          id: string
          ran_at: string
          rows_auto_failed: number
          summary: Json
        }
        Insert: {
          anomalies_found?: number
          bugs_created?: number
          duration_ms?: number | null
          id?: string
          ran_at?: string
          rows_auto_failed?: number
          summary?: Json
        }
        Update: {
          anomalies_found?: number
          bugs_created?: number
          duration_ms?: number | null
          id?: string
          ran_at?: string
          rows_auto_failed?: number
          summary?: Json
        }
        Relationships: []
      }
      rate_limit_state: {
        Row: {
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          last_refill_at: string | null
          limit_type: string
          tokens_remaining: number
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          last_refill_at?: string | null
          limit_type: string
          tokens_remaining?: number
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          last_refill_at?: string | null
          limit_type?: string
          tokens_remaining?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
          request_count: number | null
          updated_at: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number | null
          updated_at?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      recurring_event_rules: {
        Row: {
          auto_render: boolean | null
          created_at: string | null
          id: string
          is_active: boolean | null
          last_execution: string | null
          name: string
          next_execution: string | null
          recurrence_pattern: string
          template_event: Json
          updated_at: string | null
          video_template_id: string | null
          workspace_id: string
        }
        Insert: {
          auto_render?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          name: string
          next_execution?: string | null
          recurrence_pattern: string
          template_event: Json
          updated_at?: string | null
          video_template_id?: string | null
          workspace_id: string
        }
        Update: {
          auto_render?: boolean | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          last_execution?: string | null
          name?: string
          next_execution?: string | null
          recurrence_pattern?: string
          template_event?: Json
          updated_at?: string | null
          video_template_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_event_rules_video_template_id_fkey"
            columns: ["video_template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_event_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_posts: {
        Row: {
          caption: string
          created_at: string
          frequency: string
          id: string
          image_url: string | null
          is_active: boolean
          last_posted_at: string | null
          next_scheduled_time: string
          platform: string
          tags: Json | null
          timezone: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          caption: string
          created_at?: string
          frequency: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_posted_at?: string | null
          next_scheduled_time: string
          platform: string
          tags?: Json | null
          timezone?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          frequency?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          last_posted_at?: string | null
          next_scheduled_time?: string
          platform?: string
          tags?: Json | null
          timezone?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_scripts: {
        Row: {
          ai_json: Json
          brand_kit_id: string | null
          created_at: string
          duration: string
          id: string
          idea: string
          language: string
          platform: string
          title: string | null
          tone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_json?: Json
          brand_kit_id?: string | null
          created_at?: string
          duration?: string
          id?: string
          idea: string
          language?: string
          platform: string
          title?: string | null
          tone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_json?: Json
          brand_kit_id?: string | null
          created_at?: string
          duration?: string
          id?: string
          idea?: string
          language?: string
          platform?: string
          title?: string | null
          tone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          affiliate_id: string
          customer_id: string
          ended_at: string | null
          id: string
          promo_code_id: string | null
          started_at: string
          status: string | null
          subscription_id: string
        }
        Insert: {
          affiliate_id: string
          customer_id: string
          ended_at?: string | null
          id?: string
          promo_code_id?: string | null
          started_at?: string
          status?: string | null
          subscription_id: string
        }
        Update: {
          affiliate_id?: string
          customer_id?: string
          ended_at?: string | null
          id?: string
          promo_code_id?: string | null
          started_at?: string
          status?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      remotion_templates: {
        Row: {
          component_name: string
          content_type: string
          created_at: string
          customizable_fields: Json
          default_props: Json
          duration_frames: number
          fps: number
          height: number
          id: string
          is_active: boolean
          preview_url: string | null
          updated_at: string
          width: number
        }
        Insert: {
          component_name: string
          content_type: string
          created_at?: string
          customizable_fields?: Json
          default_props?: Json
          duration_frames: number
          fps?: number
          height?: number
          id?: string
          is_active?: boolean
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Update: {
          component_name?: string
          content_type?: string
          created_at?: string
          customizable_fields?: Json
          default_props?: Json
          duration_frames?: number
          fps?: number
          height?: number
          id?: string
          is_active?: boolean
          preview_url?: string | null
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      render_asset_cache: {
        Row: {
          content_hash: string
          created_at: string | null
          duration_sec: number | null
          engine: string
          expires_at: string | null
          file_size_mb: number | null
          hit_count: number | null
          id: string
          last_accessed_at: string | null
          resolution: string | null
          storage_path: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string | null
          duration_sec?: number | null
          engine: string
          expires_at?: string | null
          file_size_mb?: number | null
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          resolution?: string | null
          storage_path: string
          template_id?: string | null
          user_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string | null
          duration_sec?: number | null
          engine?: string
          expires_at?: string | null
          file_size_mb?: number | null
          hit_count?: number | null
          id?: string
          last_accessed_at?: string | null
          resolution?: string | null
          storage_path?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_asset_cache_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_cost_factors: {
        Row: {
          base_cost: number
          complexity_multiplier: Json | null
          cost_per_mb: number
          cost_per_second: number
          created_at: string | null
          engine: string
          id: string
          is_active: boolean | null
          resolution_multiplier: Json | null
        }
        Insert: {
          base_cost: number
          complexity_multiplier?: Json | null
          cost_per_mb: number
          cost_per_second: number
          created_at?: string | null
          engine: string
          id?: string
          is_active?: boolean | null
          resolution_multiplier?: Json | null
        }
        Update: {
          base_cost?: number
          complexity_multiplier?: Json | null
          cost_per_mb?: number
          cost_per_second?: number
          created_at?: string | null
          engine?: string
          id?: string
          is_active?: boolean | null
          resolution_multiplier?: Json | null
        }
        Relationships: []
      }
      render_cost_history: {
        Row: {
          actual_cost: number | null
          complexity_score: number | null
          created_at: string | null
          duration_sec: number | null
          engine: string | null
          estimated_cost: number | null
          file_size_mb: number | null
          id: string
          render_id: string | null
          resolution: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          actual_cost?: number | null
          complexity_score?: number | null
          created_at?: string | null
          duration_sec?: number | null
          engine?: string | null
          estimated_cost?: number | null
          file_size_mb?: number | null
          id?: string
          render_id?: string | null
          resolution?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          actual_cost?: number | null
          complexity_score?: number | null
          created_at?: string | null
          duration_sec?: number | null
          engine?: string | null
          estimated_cost?: number | null
          file_size_mb?: number | null
          id?: string
          render_id?: string | null
          resolution?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_cost_history_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_queue: {
        Row: {
          completed_at: string | null
          config: Json | null
          created_at: string | null
          engine: string | null
          error_message: string | null
          estimated_cost: number
          estimated_duration_sec: number | null
          estimated_workers: number
          id: string
          is_founder: boolean
          max_retries: number | null
          output_url: string | null
          priority: number | null
          project_id: string | null
          render_data: Json | null
          render_id: string | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          template_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          engine?: string | null
          error_message?: string | null
          estimated_cost: number
          estimated_duration_sec?: number | null
          estimated_workers?: number
          id?: string
          is_founder?: boolean
          max_retries?: number | null
          output_url?: string | null
          priority?: number | null
          project_id?: string | null
          render_data?: Json | null
          render_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          config?: Json | null
          created_at?: string | null
          engine?: string | null
          error_message?: string | null
          estimated_cost?: number
          estimated_duration_sec?: number | null
          estimated_workers?: number
          id?: string
          is_founder?: boolean
          max_retries?: number | null
          output_url?: string | null
          priority?: number | null
          project_id?: string | null
          render_data?: Json | null
          render_id?: string | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          template_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_queue_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_queue_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      render_queue_stats: {
        Row: {
          avg_duration_sec: number | null
          completed_jobs: number | null
          created_at: string | null
          date: string
          engine: string
          failed_jobs: number | null
          id: string
          peak_queue_size: number | null
          total_credits_used: number | null
          total_jobs: number | null
        }
        Insert: {
          avg_duration_sec?: number | null
          completed_jobs?: number | null
          created_at?: string | null
          date: string
          engine: string
          failed_jobs?: number | null
          id?: string
          peak_queue_size?: number | null
          total_credits_used?: number | null
          total_jobs?: number | null
        }
        Update: {
          avg_duration_sec?: number | null
          completed_jobs?: number | null
          created_at?: string | null
          date?: string
          engine?: string
          failed_jobs?: number | null
          id?: string
          peak_queue_size?: number | null
          total_credits_used?: number | null
          total_jobs?: number | null
        }
        Relationships: []
      }
      replies: {
        Row: {
          comment_id: string
          created_at: string
          created_by: string | null
          id: string
          reply_text: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          reply_text: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reply_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          created_at: string
          date_range: string
          description: string | null
          id: string
          include_logo: boolean
          is_default: boolean
          metrics_json: Json
          name: string
          platforms: Json
          sections_json: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date_range?: string
          description?: string | null
          id?: string
          include_logo?: boolean
          is_default?: boolean
          metrics_json?: Json
          name: string
          platforms?: Json
          sections_json?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date_range?: string
          description?: string | null
          id?: string
          include_logo?: boolean
          is_default?: boolean
          metrics_json?: Json
          name?: string
          platforms?: Json
          sections_json?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rewrites_history: {
        Row: {
          created_at: string
          explanation: string
          id: string
          language: string
          original_text: string
          platform: string
          rewrite_goal: string
          rewritten_text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          explanation: string
          id?: string
          language: string
          original_text: string
          platform: string
          rewrite_goal: string
          rewritten_text: string
          user_id: string
        }
        Update: {
          created_at?: string
          explanation?: string
          id?: string
          language?: string
          original_text?: string
          platform?: string
          rewrite_goal?: string
          rewritten_text?: string
          user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_read: boolean
          can_update: boolean
          created_at: string
          id: string
          permission: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          permission: string
          resource: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_read?: boolean
          can_update?: boolean
          created_at?: string
          id?: string
          permission?: string
          resource?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      scene_anchor_cache: {
        Row: {
          composed_url: string
          created_at: string
          id: string
          portrait_hash: string
          prompt_hash: string
          scene_id: string
          user_id: string
        }
        Insert: {
          composed_url: string
          created_at?: string
          id?: string
          portrait_hash: string
          prompt_hash: string
          scene_id: string
          user_id: string
        }
        Update: {
          composed_url?: string
          created_at?: string
          id?: string
          portrait_hash?: string
          prompt_hash?: string
          scene_id?: string
          user_id?: string
        }
        Relationships: []
      }
      scene_audio_clips: {
        Row: {
          cost_credits: number
          created_at: string
          ducking_enabled: boolean
          duration: number
          id: string
          kind: string
          metadata: Json
          project_id: string | null
          prompt: string | null
          refunded: boolean
          scene_id: string | null
          source: string
          start_offset: number
          storage_path: string | null
          updated_at: string
          url: string
          user_id: string
          volume: number
        }
        Insert: {
          cost_credits?: number
          created_at?: string
          ducking_enabled?: boolean
          duration?: number
          id?: string
          kind: string
          metadata?: Json
          project_id?: string | null
          prompt?: string | null
          refunded?: boolean
          scene_id?: string | null
          source?: string
          start_offset?: number
          storage_path?: string | null
          updated_at?: string
          url: string
          user_id: string
          volume?: number
        }
        Update: {
          cost_credits?: number
          created_at?: string
          ducking_enabled?: boolean
          duration?: number
          id?: string
          kind?: string
          metadata?: Json
          project_id?: string | null
          prompt?: string | null
          refunded?: boolean
          scene_id?: string | null
          source?: string
          start_offset?: number
          storage_path?: string | null
          updated_at?: string
          url?: string
          user_id?: string
          volume?: number
        }
        Relationships: []
      }
      scene_director_cache: {
        Row: {
          cache_key: string
          created_at: string
          id: string
          payload: Json
          user_id: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          id?: string
          payload: Json
          user_id: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          id?: string
          payload?: Json
          user_id?: string
        }
        Relationships: []
      }
      scene_face_tracks: {
        Row: {
          character_id: string
          created_at: string
          face_embedding: string | null
          frames: Json
          id: string
          meta: Json
          pass_idx: number
          plate_url: string | null
          scene_id: string
          track_kind: string
          updated_at: string
        }
        Insert: {
          character_id: string
          created_at?: string
          face_embedding?: string | null
          frames?: Json
          id?: string
          meta?: Json
          pass_idx?: number
          plate_url?: string | null
          scene_id: string
          track_kind?: string
          updated_at?: string
        }
        Update: {
          character_id?: string
          created_at?: string
          face_embedding?: string | null
          frames?: Json
          id?: string
          meta?: Json
          pass_idx?: number
          plate_url?: string | null
          scene_id?: string
          track_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scene_face_tracks_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_face_tracks_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "composer_scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_still_frames: {
        Row: {
          created_at: string
          id: string
          prompt_hash: string
          scene_id: string
          selected_variant_url: string | null
          updated_at: string
          user_id: string
          variants: Json
        }
        Insert: {
          created_at?: string
          id?: string
          prompt_hash: string
          scene_id: string
          selected_variant_url?: string | null
          updated_at?: string
          user_id: string
          variants?: Json
        }
        Update: {
          created_at?: string
          id?: string
          prompt_hash?: string
          scene_id?: string
          selected_variant_url?: string | null
          updated_at?: string
          user_id?: string
          variants?: Json
        }
        Relationships: []
      }
      schedule_blocks: {
        Row: {
          caption_override: string | null
          content_id: string | null
          created_at: string | null
          end_at: string
          id: string
          meta: Json | null
          platform: string
          position: number | null
          start_at: string
          status: string
          title_override: string | null
          updated_at: string | null
          weekplan_id: string
          workspace_id: string
        }
        Insert: {
          caption_override?: string | null
          content_id?: string | null
          created_at?: string | null
          end_at: string
          id?: string
          meta?: Json | null
          platform: string
          position?: number | null
          start_at: string
          status?: string
          title_override?: string | null
          updated_at?: string | null
          weekplan_id: string
          workspace_id: string
        }
        Update: {
          caption_override?: string | null
          content_id?: string | null
          created_at?: string | null
          end_at?: string
          id?: string
          meta?: Json | null
          platform?: string
          position?: number | null
          start_at?: string
          status?: string
          title_override?: string | null
          updated_at?: string | null
          weekplan_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_blocks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_weekplan_id_fkey"
            columns: ["weekplan_id"]
            isOneToOne: false
            referencedRelation: "weekplans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "schedule_blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_publications: {
        Row: {
          caption: string | null
          created_at: string | null
          description: string | null
          error_message: string | null
          event_id: string | null
          hashtags: string[] | null
          id: string
          platform: string
          publish_at: string
          result_data: Json | null
          retry_count: number | null
          status: string | null
          title: string | null
          updated_at: string | null
          user_id: string
          video_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          event_id?: string | null
          hashtags?: string[] | null
          id?: string
          platform: string
          publish_at: string
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id: string
          video_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          description?: string | null
          error_message?: string | null
          event_id?: string | null
          hashtags?: string[] | null
          id?: string
          platform?: string
          publish_at?: string
          result_data?: Json | null
          retry_count?: number | null
          status?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string
          frequency: string
          id: string
          is_active: boolean
          last_sent_at: string | null
          name: string
          next_send_date: string
          recipients_json: Json
          template_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          frequency: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name: string
          next_send_date: string
          recipients_json?: Json
          template_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean
          last_sent_at?: string | null
          name?: string
          next_send_date?: string
          recipients_json?: Json
          template_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_reports_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      seats: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      sentry_issues_cache: {
        Row: {
          culprit: string | null
          event_count: number | null
          first_seen: string | null
          id: string
          last_seen: string | null
          level: string | null
          metadata: Json | null
          permalink: string | null
          platform: string | null
          sentry_issue_id: string
          short_id: string | null
          status: string | null
          synced_at: string
          title: string
          user_count: number | null
        }
        Insert: {
          culprit?: string | null
          event_count?: number | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          level?: string | null
          metadata?: Json | null
          permalink?: string | null
          platform?: string | null
          sentry_issue_id: string
          short_id?: string | null
          status?: string | null
          synced_at?: string
          title: string
          user_count?: number | null
        }
        Update: {
          culprit?: string | null
          event_count?: number | null
          first_seen?: string | null
          id?: string
          last_seen?: string | null
          level?: string | null
          metadata?: Json | null
          permalink?: string | null
          platform?: string | null
          sentry_issue_id?: string
          short_id?: string | null
          status?: string | null
          synced_at?: string
          title?: string
          user_count?: number | null
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string | null
          value_json: Json
        }
        Insert: {
          key: string
          updated_at?: string | null
          value_json: Json
        }
        Update: {
          key?: string
          updated_at?: string | null
          value_json?: Json
        }
        Relationships: []
      }
      sfx_library_cache: {
        Row: {
          cache_key: string
          category: string | null
          created_at: string
          expires_at: string
          id: string
          query: string
          result_count: number
          results: Json
          source: string
        }
        Insert: {
          cache_key: string
          category?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          query: string
          result_count?: number
          results?: Json
          source: string
        }
        Update: {
          cache_key?: string
          category?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          query?: string
          result_count?: number
          results?: Json
          source?: string
        }
        Relationships: []
      }
      smoke_test_runs: {
        Row: {
          error_message: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          response_data: Json | null
          run_at: string
          status: string
          test_name: string
          test_type: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          response_data?: Json | null
          run_at?: string
          status: string
          test_name: string
          test_type?: string
        }
        Update: {
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          response_data?: Json | null
          run_at?: string
          status?: string
          test_name?: string
          test_type?: string
        }
        Relationships: []
      }
      social_connections: {
        Row: {
          access_token_hash: string | null
          account_id: string
          account_metadata: Json | null
          account_name: string
          auto_sync_enabled: boolean | null
          created_at: string | null
          id: string
          last_sync_at: string | null
          provider: string
          provider_open_id: string | null
          refresh_token_hash: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token_hash?: string | null
          account_id: string
          account_metadata?: Json | null
          account_name: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider: string
          provider_open_id?: string | null
          refresh_token_hash?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token_hash?: string | null
          account_id?: string
          account_metadata?: Json | null
          account_name?: string
          auto_sync_enabled?: boolean | null
          created_at?: string | null
          id?: string
          last_sync_at?: string | null
          provider?: string
          provider_open_id?: string | null
          refresh_token_hash?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_goals: {
        Row: {
          ai_estimate: string | null
          created_at: string | null
          current_value: number | null
          end_date: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id: string
          platform: string
          progress_percent: number | null
          start_date: string
          status: Database["public"]["Enums"]["goal_status"] | null
          target_value: number
          unit: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_estimate?: string | null
          created_at?: string | null
          current_value?: number | null
          end_date?: string | null
          goal_type: Database["public"]["Enums"]["goal_type"]
          id?: string
          platform: string
          progress_percent?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_value: number
          unit: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_estimate?: string | null
          created_at?: string | null
          current_value?: number | null
          end_date?: string | null
          goal_type?: Database["public"]["Enums"]["goal_type"]
          id?: string
          platform?: string
          progress_percent?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["goal_status"] | null
          target_value?: number
          unit?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      social_media_publications: {
        Row: {
          caption: string | null
          created_at: string | null
          engagement_metrics: Json | null
          event_id: string | null
          external_id: string | null
          hashtags: string[] | null
          id: string
          metadata: Json | null
          platform: string
          post_url: string | null
          published_at: string | null
          scheduled_publication_id: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          engagement_metrics?: Json | null
          event_id?: string | null
          external_id?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json | null
          platform: string
          post_url?: string | null
          published_at?: string | null
          scheduled_publication_id?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          engagement_metrics?: Json | null
          event_id?: string | null
          external_id?: string | null
          hashtags?: string[] | null
          id?: string
          metadata?: Json | null
          platform?: string
          post_url?: string | null
          published_at?: string | null
          scheduled_publication_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_media_publications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "calendar_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_media_publications_scheduled_publication_id_fkey"
            columns: ["scheduled_publication_id"]
            isOneToOne: false
            referencedRelation: "scheduled_publications"
            referencedColumns: ["id"]
          },
        ]
      }
      social_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          follower_count: number | null
          following_count: number | null
          id: string
          like_count: number | null
          provider: string
          synced_at: string | null
          updated_at: string | null
          user_id: string
          username: string | null
          video_count: number | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          like_count?: number | null
          provider: string
          synced_at?: string | null
          updated_at?: string | null
          user_id: string
          username?: string | null
          video_count?: number | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          follower_count?: number | null
          following_count?: number | null
          id?: string
          like_count?: number | null
          provider?: string
          synced_at?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string | null
          video_count?: number | null
        }
        Relationships: []
      }
      sora_long_form_projects: {
        Row: {
          aspect_ratio: string
          created_at: string | null
          final_video_url: string | null
          id: string
          model: string
          name: string
          script: string | null
          status: string
          target_duration: number
          total_cost_euros: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          aspect_ratio?: string
          created_at?: string | null
          final_video_url?: string | null
          id?: string
          model?: string
          name?: string
          script?: string | null
          status?: string
          target_duration: number
          total_cost_euros?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          aspect_ratio?: string
          created_at?: string | null
          final_video_url?: string | null
          id?: string
          model?: string
          name?: string
          script?: string | null
          status?: string
          target_duration?: number
          total_cost_euros?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sora_long_form_scenes: {
        Row: {
          cost_euros: number | null
          created_at: string | null
          duration: number
          generated_video_url: string | null
          id: string
          project_id: string
          prompt: string
          reference_image_url: string | null
          replicate_prediction_id: string | null
          scene_order: number
          shot_director: Json
          status: string
          transition_duration: number | null
          transition_type: string | null
          updated_at: string | null
        }
        Insert: {
          cost_euros?: number | null
          created_at?: string | null
          duration: number
          generated_video_url?: string | null
          id?: string
          project_id: string
          prompt?: string
          reference_image_url?: string | null
          replicate_prediction_id?: string | null
          scene_order: number
          shot_director?: Json
          status?: string
          transition_duration?: number | null
          transition_type?: string | null
          updated_at?: string | null
        }
        Update: {
          cost_euros?: number | null
          created_at?: string | null
          duration?: number
          generated_video_url?: string | null
          id?: string
          project_id?: string
          prompt?: string
          reference_image_url?: string | null
          replicate_prediction_id?: string | null
          scene_order?: number
          shot_director?: Json
          status?: string
          transition_duration?: number | null
          transition_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sora_long_form_scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "sora_long_form_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      sora2_waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
          language: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          language?: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          language?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      spotlight_rotation: {
        Row: {
          channel_id: string
          current_post_id: string | null
          id: string
          rotated_at: string
          rotation_interval_days: number
        }
        Insert: {
          channel_id: string
          current_post_id?: string | null
          id?: string
          rotated_at?: string
          rotation_interval_days?: number
        }
        Update: {
          channel_id?: string
          current_post_id?: string | null
          id?: string
          rotated_at?: string
          rotation_interval_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "spotlight_rotation_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: true
            referencedRelation: "community_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spotlight_rotation_current_post_id_fkey"
            columns: ["current_post_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_wallet_accounts: {
        Row: {
          active: boolean
          created_at: string
          label: string
          min_balance: number
          top_up_to: number
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          label?: string
          min_balance?: number
          top_up_to?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          label?: string
          min_balance?: number
          top_up_to?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      starter_week_plans: {
        Row: {
          content_idea: string
          created_at: string
          day_of_week: number
          id: string
          platform: string
          status: string
          suggested_date: string
          suggested_time: string
          tips: string
          user_id: string
        }
        Insert: {
          content_idea: string
          created_at?: string
          day_of_week: number
          id?: string
          platform: string
          status?: string
          suggested_date: string
          suggested_time: string
          tips?: string
          user_id: string
        }
        Update: {
          content_idea?: string
          created_at?: string
          day_of_week?: number
          id?: string
          platform?: string
          status?: string
          suggested_date?: string
          suggested_time?: string
          tips?: string
          user_id?: string
        }
        Relationships: []
      }
      status_incidents: {
        Row: {
          affected_components: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_components?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity: string
          started_at?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_components?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_search_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          hit_count: number
          id: string
          media_type: string
          provider_counts: Json
          query: string
          results_json: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          media_type: string
          provider_counts?: Json
          query: string
          results_json: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          hit_count?: number
          id?: string
          media_type?: string
          provider_counts?: Json
          query?: string
          results_json?: Json
        }
        Relationships: []
      }
      stock_video_cache: {
        Row: {
          created_at: string
          expires_at: string
          filters: Json | null
          id: string
          payload: Json
          query: string | null
          query_hash: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          filters?: Json | null
          id?: string
          payload: Json
          query?: string | null
          query_hash: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          filters?: Json | null
          id?: string
          payload?: Json
          query?: string | null
          query_hash?: string
        }
        Relationships: []
      }
      storage_files: {
        Row: {
          bucket_name: string
          created_at: string
          file_path: string
          file_size_mb: number
          file_type: string | null
          id: string
          is_orphaned: boolean | null
          last_accessed_at: string | null
          project_id: string | null
          user_id: string
        }
        Insert: {
          bucket_name: string
          created_at?: string
          file_path: string
          file_size_mb?: number
          file_type?: string | null
          id?: string
          is_orphaned?: boolean | null
          last_accessed_at?: string | null
          project_id?: string | null
          user_id: string
        }
        Update: {
          bucket_name?: string
          created_at?: string
          file_path?: string
          file_size_mb?: number
          file_type?: string | null
          id?: string
          is_orphaned?: boolean | null
          last_accessed_at?: string | null
          project_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "storage_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_mode_pauses: {
        Row: {
          campaign_id: string | null
          created_at: string
          ends_at: string
          id: string
          reason: string
          starts_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          reason?: string
          starts_at: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          reason?: string
          starts_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_mode_pauses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      strategy_posts: {
        Row: {
          auto_publish: boolean | null
          caption_draft: string | null
          completed_event_id: string | null
          content_idea: string
          created_at: string
          generation_batch_id: string | null
          hashtags: Json | null
          id: string
          media_urls: string[] | null
          original_scheduled_at: string | null
          phase: string | null
          platform: string
          reasoning: string | null
          scheduled_at: string
          slot_reason: string[] | null
          slot_score: number | null
          status: string
          tips: string[] | null
          updated_at: string
          user_id: string
          week_start: string
          workspace_id: string | null
        }
        Insert: {
          auto_publish?: boolean | null
          caption_draft?: string | null
          completed_event_id?: string | null
          content_idea: string
          created_at?: string
          generation_batch_id?: string | null
          hashtags?: Json | null
          id?: string
          media_urls?: string[] | null
          original_scheduled_at?: string | null
          phase?: string | null
          platform: string
          reasoning?: string | null
          scheduled_at: string
          slot_reason?: string[] | null
          slot_score?: number | null
          status?: string
          tips?: string[] | null
          updated_at?: string
          user_id: string
          week_start: string
          workspace_id?: string | null
        }
        Update: {
          auto_publish?: boolean | null
          caption_draft?: string | null
          completed_event_id?: string | null
          content_idea?: string
          created_at?: string
          generation_batch_id?: string | null
          hashtags?: Json | null
          id?: string
          media_urls?: string[] | null
          original_scheduled_at?: string | null
          phase?: string | null
          platform?: string
          reasoning?: string | null
          scheduled_at?: string
          slot_reason?: string[] | null
          slot_score?: number | null
          status?: string
          tips?: string[] | null
          updated_at?: string
          user_id?: string
          week_start?: string
          workspace_id?: string | null
        }
        Relationships: []
      }
      strategy_seeds: {
        Row: {
          consumed_at: string | null
          created_at: string
          id: string
          insights: Json
          source_campaign_id: string | null
          user_id: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          insights?: Json
          source_campaign_id?: string | null
          user_id: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          id?: string
          insights?: Json
          source_campaign_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategy_seeds_source_campaign_id_fkey"
            columns: ["source_campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      streak_milestones: {
        Row: {
          id: string
          milestone_days: number
          reached_at: string
          reward_credits: number | null
          reward_dollars: number
          user_id: string
        }
        Insert: {
          id?: string
          milestone_days: number
          reached_at?: string
          reward_credits?: number | null
          reward_dollars?: number
          user_id: string
        }
        Update: {
          id?: string
          milestone_days?: number
          reached_at?: string
          reward_credits?: number | null
          reward_dollars?: number
          user_id?: string
        }
        Relationships: []
      }
      stream_clips: {
        Row: {
          clip_url: string | null
          created_at: string
          duration_seconds: number | null
          export_status: string | null
          exported_platforms: Json | null
          id: string
          session_id: string | null
          start_offset_seconds: number | null
          storage_path: string | null
          thumbnail_url: string | null
          title: string
          twitch_clip_id: string | null
          updated_at: string
          user_id: string
          view_count: number | null
        }
        Insert: {
          clip_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          export_status?: string | null
          exported_platforms?: Json | null
          id?: string
          session_id?: string | null
          start_offset_seconds?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title: string
          twitch_clip_id?: string | null
          updated_at?: string
          user_id: string
          view_count?: number | null
        }
        Update: {
          clip_url?: string | null
          created_at?: string
          duration_seconds?: number | null
          export_status?: string | null
          exported_platforms?: Json | null
          id?: string
          session_id?: string | null
          start_offset_seconds?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string
          twitch_clip_id?: string | null
          updated_at?: string
          user_id?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_clips_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "stream_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_schedules: {
        Row: {
          announce_platforms: Json | null
          auto_announce: boolean | null
          created_at: string
          duration_minutes: number | null
          game_name: string | null
          id: string
          platform: string
          scheduled_at: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          announce_platforms?: Json | null
          auto_announce?: boolean | null
          created_at?: string
          duration_minutes?: number | null
          game_name?: string | null
          id?: string
          platform?: string
          scheduled_at: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          announce_platforms?: Json | null
          auto_announce?: boolean | null
          created_at?: string
          duration_minutes?: number | null
          game_name?: string | null
          id?: string
          platform?: string
          scheduled_at?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stream_sessions: {
        Row: {
          avg_viewers: number | null
          created_at: string
          ended_at: string | null
          game_name: string | null
          id: string
          metadata: Json | null
          peak_viewers: number | null
          platform: string
          started_at: string | null
          stream_id: string | null
          thumbnail_url: string | null
          title: string | null
          total_chat_messages: number | null
          updated_at: string
          user_id: string
          vod_url: string | null
        }
        Insert: {
          avg_viewers?: number | null
          created_at?: string
          ended_at?: string | null
          game_name?: string | null
          id?: string
          metadata?: Json | null
          peak_viewers?: number | null
          platform?: string
          started_at?: string | null
          stream_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_chat_messages?: number | null
          updated_at?: string
          user_id: string
          vod_url?: string | null
        }
        Update: {
          avg_viewers?: number | null
          created_at?: string
          ended_at?: string | null
          game_name?: string | null
          id?: string
          metadata?: Json | null
          peak_viewers?: number | null
          platform?: string
          started_at?: string | null
          stream_id?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_chat_messages?: number | null
          updated_at?: string
          user_id?: string
          vod_url?: string | null
        }
        Relationships: []
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload_summary: Json | null
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload_summary?: Json | null
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload_summary?: Json | null
          processed_at?: string
        }
        Relationships: []
      }
      studio_albums: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          is_system: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_system?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      studio_images: {
        Row: {
          album_id: string | null
          aspect_ratio: string | null
          created_at: string
          id: string
          image_url: string
          metadata_json: Json | null
          model_used: string | null
          parent_id: string | null
          prompt: string | null
          source: string
          source_run_id: string | null
          style: string | null
          thumbnail_url: string | null
          upscale_factor: number | null
          user_id: string
          variation_index: number | null
          workflow_type: string
        }
        Insert: {
          album_id?: string | null
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          image_url: string
          metadata_json?: Json | null
          model_used?: string | null
          parent_id?: string | null
          prompt?: string | null
          source?: string
          source_run_id?: string | null
          style?: string | null
          thumbnail_url?: string | null
          upscale_factor?: number | null
          user_id: string
          variation_index?: number | null
          workflow_type: string
        }
        Update: {
          album_id?: string | null
          aspect_ratio?: string | null
          created_at?: string
          id?: string
          image_url?: string
          metadata_json?: Json | null
          model_used?: string | null
          parent_id?: string | null
          prompt?: string | null
          source?: string
          source_run_id?: string | null
          style?: string | null
          thumbnail_url?: string | null
          upscale_factor?: number | null
          user_id?: string
          variation_index?: number | null
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_images_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "studio_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_images_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "studio_images"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          actual_result: string | null
          affected_module: string | null
          ai_analyzed_at: string | null
          ai_category: string | null
          ai_confidence: number | null
          ai_eta_hours: number | null
          ai_language: string | null
          ai_root_cause: string | null
          ai_severity: string | null
          ai_suggested_reply: string | null
          attachments: Json
          browser_info: Json | null
          category: string
          contact_email: string | null
          contact_name: string | null
          conversation_id: string | null
          created_at: string | null
          description: string | null
          expected_result: string | null
          id: string
          linked_incident_id: string | null
          metadata: Json | null
          priority: string | null
          reproduction_steps: string | null
          resolved_notification_sent_at: string | null
          severity: string
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          actual_result?: string | null
          affected_module?: string | null
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_confidence?: number | null
          ai_eta_hours?: number | null
          ai_language?: string | null
          ai_root_cause?: string | null
          ai_severity?: string | null
          ai_suggested_reply?: string | null
          attachments?: Json
          browser_info?: Json | null
          category: string
          contact_email?: string | null
          contact_name?: string | null
          conversation_id?: string | null
          created_at?: string | null
          description?: string | null
          expected_result?: string | null
          id?: string
          linked_incident_id?: string | null
          metadata?: Json | null
          priority?: string | null
          reproduction_steps?: string | null
          resolved_notification_sent_at?: string | null
          severity?: string
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          actual_result?: string | null
          affected_module?: string | null
          ai_analyzed_at?: string | null
          ai_category?: string | null
          ai_confidence?: number | null
          ai_eta_hours?: number | null
          ai_language?: string | null
          ai_root_cause?: string | null
          ai_severity?: string | null
          ai_suggested_reply?: string | null
          attachments?: Json
          browser_info?: Json | null
          category?: string
          contact_email?: string | null
          contact_name?: string | null
          conversation_id?: string | null
          created_at?: string | null
          description?: string | null
          expected_result?: string | null
          id?: string
          linked_incident_id?: string | null
          metadata?: Json | null
          priority?: string | null
          reproduction_steps?: string | null
          resolved_notification_sent_at?: string | null
          severity?: string
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "companion_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_linked_incident_id_fkey"
            columns: ["linked_incident_id"]
            isOneToOne: false
            referencedRelation: "status_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      syncso_dispatch_log: {
        Row: {
          attempt: number
          audio_bytes: number | null
          audio_channels: number | null
          audio_content_type: string | null
          audio_dur_sec: number | null
          audio_lead_in_sec: number | null
          audio_peak_dbfs: number | null
          audio_sample_rate: number | null
          audio_url: string | null
          coords: Json | null
          created_at: string
          detector_used: string | null
          engine: string
          error_class: string | null
          error_message: string | null
          face_share_in_preclip: number | null
          frame_number: number | null
          http_status: number | null
          id: string
          job_id: string | null
          meta: Json | null
          meta_yavg_probe: Json | null
          mode: string | null
          motion_probe_meta: Json | null
          motion_score: number | null
          motion_verdict: string | null
          mouth_center_offset_px: number | null
          noop_mouth_yavg: number | null
          preflight_repairs: Json | null
          retry_count: number
          scene_id: string | null
          sync_source_kind: string | null
          sync_status: string | null
          turn_idx: number | null
          user_id: string | null
          video_bytes: number | null
          video_content_type: string | null
          video_url: string | null
          window_end_sec: number | null
          window_start_sec: number | null
        }
        Insert: {
          attempt?: number
          audio_bytes?: number | null
          audio_channels?: number | null
          audio_content_type?: string | null
          audio_dur_sec?: number | null
          audio_lead_in_sec?: number | null
          audio_peak_dbfs?: number | null
          audio_sample_rate?: number | null
          audio_url?: string | null
          coords?: Json | null
          created_at?: string
          detector_used?: string | null
          engine: string
          error_class?: string | null
          error_message?: string | null
          face_share_in_preclip?: number | null
          frame_number?: number | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          meta?: Json | null
          meta_yavg_probe?: Json | null
          mode?: string | null
          motion_probe_meta?: Json | null
          motion_score?: number | null
          motion_verdict?: string | null
          mouth_center_offset_px?: number | null
          noop_mouth_yavg?: number | null
          preflight_repairs?: Json | null
          retry_count?: number
          scene_id?: string | null
          sync_source_kind?: string | null
          sync_status?: string | null
          turn_idx?: number | null
          user_id?: string | null
          video_bytes?: number | null
          video_content_type?: string | null
          video_url?: string | null
          window_end_sec?: number | null
          window_start_sec?: number | null
        }
        Update: {
          attempt?: number
          audio_bytes?: number | null
          audio_channels?: number | null
          audio_content_type?: string | null
          audio_dur_sec?: number | null
          audio_lead_in_sec?: number | null
          audio_peak_dbfs?: number | null
          audio_sample_rate?: number | null
          audio_url?: string | null
          coords?: Json | null
          created_at?: string
          detector_used?: string | null
          engine?: string
          error_class?: string | null
          error_message?: string | null
          face_share_in_preclip?: number | null
          frame_number?: number | null
          http_status?: number | null
          id?: string
          job_id?: string | null
          meta?: Json | null
          meta_yavg_probe?: Json | null
          mode?: string | null
          motion_probe_meta?: Json | null
          motion_score?: number | null
          motion_verdict?: string | null
          mouth_center_offset_px?: number | null
          noop_mouth_yavg?: number | null
          preflight_repairs?: Json | null
          retry_count?: number
          scene_id?: string | null
          sync_source_kind?: string | null
          sync_status?: string | null
          turn_idx?: number | null
          user_id?: string | null
          video_bytes?: number | null
          video_content_type?: string | null
          video_url?: string | null
          window_end_sec?: number | null
          window_start_sec?: number | null
        }
        Relationships: []
      }
      syncso_inflight_jobs: {
        Row: {
          engine: string
          expires_at: string
          job_id: string
          scene_id: string | null
          started_at: string
          user_id: string | null
        }
        Insert: {
          engine: string
          expires_at?: string
          job_id: string
          scene_id?: string | null
          started_at?: string
          user_id?: string | null
        }
        Update: {
          engine?: string
          expires_at?: string
          job_id?: string
          scene_id?: string | null
          started_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      synthetic_probe_runs: {
        Row: {
          error_message: string | null
          id: string
          latency_ms: number
          metadata: Json | null
          probe_name: string
          run_at: string
          status: string
          threshold_ms: number | null
        }
        Insert: {
          error_message?: string | null
          id?: string
          latency_ms?: number
          metadata?: Json | null
          probe_name: string
          run_at?: string
          status: string
          threshold_ms?: number | null
        }
        Update: {
          error_message?: string | null
          id?: string
          latency_ms?: number
          metadata?: Json | null
          probe_name?: string
          run_at?: string
          status?: string
          threshold_ms?: number | null
        }
        Relationships: []
      }
      system_alerts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string
          payload: Json
          severity: string
          source: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message: string
          payload?: Json
          severity?: string
          source: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          payload?: Json
          severity?: string
          source?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      system_preset_avatars: {
        Row: {
          created_at: string
          default_voice_id: string | null
          description: string | null
          gender: string
          id: string
          is_active: boolean
          name: string
          portrait_url: string | null
          reference_image_url: string | null
          role_label: string
          sort_order: number
          updated_at: string
          visual_identity_json: Json | null
        }
        Insert: {
          created_at?: string
          default_voice_id?: string | null
          description?: string | null
          gender: string
          id?: string
          is_active?: boolean
          name: string
          portrait_url?: string | null
          reference_image_url?: string | null
          role_label: string
          sort_order?: number
          updated_at?: string
          visual_identity_json?: Json | null
        }
        Update: {
          created_at?: string
          default_voice_id?: string | null
          description?: string | null
          gender?: string
          id?: string
          is_active?: boolean
          name?: string
          portrait_url?: string | null
          reference_image_url?: string | null
          role_label?: string
          sort_order?: number
          updated_at?: string
          visual_identity_json?: Json | null
        }
        Relationships: []
      }
      team_comments: {
        Row: {
          comment_text: string
          content_id: string
          content_type: string
          created_at: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          comment_text: string
          content_id: string
          content_type: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          comment_text?: string
          content_id?: string
          content_type?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "team_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_ab_tests: {
        Row: {
          confidence_level: number | null
          created_at: string
          end_date: string | null
          id: string
          name: string
          start_date: string
          status: string
          template_a_id: string
          template_b_id: string
          traffic_split_a: number
          traffic_split_b: number
          updated_at: string
          winner_template_id: string | null
        }
        Insert: {
          confidence_level?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name: string
          start_date: string
          status?: string
          template_a_id: string
          template_b_id: string
          traffic_split_a?: number
          traffic_split_b?: number
          updated_at?: string
          winner_template_id?: string | null
        }
        Update: {
          confidence_level?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          template_a_id?: string
          template_b_id?: string
          traffic_split_a?: number
          traffic_split_b?: number
          updated_at?: string
          winner_template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_ab_tests_template_a_id_fkey"
            columns: ["template_a_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_ab_tests_template_b_id_fkey"
            columns: ["template_b_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_ab_tests_winner_template_id_fkey"
            columns: ["winner_template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_activity: {
        Row: {
          action: string
          changes_json: Json | null
          created_at: string
          id: string
          template_id: string
          user_id: string
        }
        Insert: {
          action: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          template_id: string
          user_id: string
        }
        Update: {
          action?: string
          changes_json?: Json | null
          created_at?: string
          id?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_activity_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_approvals: {
        Row: {
          approver_id: string | null
          comment: string | null
          id: string
          reviewed_at: string | null
          status: string
          submitted_at: string
          submitted_by: string
          template_id: string
          version_id: string | null
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by: string
          template_id: string
          version_id?: string | null
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string
          template_id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_approvals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_approvals_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "video_template_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      template_comments: {
        Row: {
          comment_text: string
          created_at: string
          id: string
          parent_comment_id: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string
          id?: string
          parent_comment_id?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "template_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_comments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_conversion_events: {
        Row: {
          created_at: string | null
          created_at_timestamp: string
          id: string
          platform: string[] | null
          published_at: string | null
          selected_at: string | null
          session_id: string
          source: string | null
          template_id: string
          time_to_create: number | null
          time_to_publish: number | null
          time_to_select: number | null
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_at_timestamp?: string
          id?: string
          platform?: string[] | null
          published_at?: string | null
          selected_at?: string | null
          session_id: string
          source?: string | null
          template_id: string
          time_to_create?: number | null
          time_to_publish?: number | null
          time_to_select?: number | null
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_at_timestamp?: string
          id?: string
          platform?: string[] | null
          published_at?: string | null
          selected_at?: string | null
          session_id?: string
          source?: string | null
          template_id?: string
          time_to_create?: number | null
          time_to_publish?: number | null
          time_to_select?: number | null
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_conversion_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_editing_sessions: {
        Row: {
          id: string
          is_active: boolean
          last_activity: string
          started_at: string
          template_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          last_activity?: string
          started_at?: string
          template_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean
          last_activity?: string
          started_at?: string
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_editing_sessions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_field_mappings: {
        Row: {
          created_at: string | null
          field_key: string
          id: string
          remotion_prop_name: string
          template_id: string
          transformation_function: string | null
        }
        Insert: {
          created_at?: string | null
          field_key: string
          id?: string
          remotion_prop_name: string
          template_id: string
          transformation_function?: string | null
        }
        Update: {
          created_at?: string | null
          field_key?: string
          id?: string
          remotion_prop_name?: string
          template_id?: string
          transformation_function?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_marketplace_ratings: {
        Row: {
          created_at: string
          id: string
          rating: number
          review_text: string | null
          template_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rating: number
          review_text?: string | null
          template_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rating?: number
          review_text?: string | null
          template_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_marketplace_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_performance_metrics: {
        Row: {
          avg_rating_in_period: number | null
          avg_view_duration_seconds: number | null
          conversion_to_create: number | null
          conversion_to_publish: number | null
          created_at: string
          date: string
          hour: number | null
          id: string
          projects_created: number
          projects_published: number
          ratings_submitted: number
          selection_rate: number | null
          template_id: string
          total_selections: number
          total_views: number
          unique_viewers: number
          updated_at: string
        }
        Insert: {
          avg_rating_in_period?: number | null
          avg_view_duration_seconds?: number | null
          conversion_to_create?: number | null
          conversion_to_publish?: number | null
          created_at?: string
          date: string
          hour?: number | null
          id?: string
          projects_created?: number
          projects_published?: number
          ratings_submitted?: number
          selection_rate?: number | null
          template_id: string
          total_selections?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
        }
        Update: {
          avg_rating_in_period?: number | null
          avg_view_duration_seconds?: number | null
          conversion_to_create?: number | null
          conversion_to_publish?: number | null
          created_at?: string
          date?: string
          hour?: number | null
          id?: string
          projects_created?: number
          projects_published?: number
          ratings_submitted?: number
          selection_rate?: number | null
          template_id?: string
          total_selections?: number
          total_views?: number
          unique_viewers?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_performance_metrics_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_purchases: {
        Row: {
          buyer_user_id: string
          creator_earned_credits: number
          creator_user_id: string | null
          id: string
          platform_fee_credits: number
          price_credits: number
          pricing_type: string
          purchased_at: string
          refunded_at: string | null
          template_id: string
        }
        Insert: {
          buyer_user_id: string
          creator_earned_credits?: number
          creator_user_id?: string | null
          id?: string
          platform_fee_credits?: number
          price_credits?: number
          pricing_type: string
          purchased_at?: string
          refunded_at?: string | null
          template_id: string
        }
        Update: {
          buyer_user_id?: string
          creator_earned_credits?: number
          creator_user_id?: string | null
          id?: string
          platform_fee_credits?: number
          price_credits?: number
          pricing_type?: string
          purchased_at?: string
          refunded_at?: string | null
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_purchases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "motion_studio_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_ratings: {
        Row: {
          created_at: string | null
          id: string
          rating: number
          review_text: string | null
          template_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          rating: number
          review_text?: string | null
          template_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          rating?: number
          review_text?: string | null
          template_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_ratings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      template_views: {
        Row: {
          id: string
          session_id: string | null
          template_id: string
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          session_id?: string | null
          template_id: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          session_id?: string | null
          template_id?: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_views_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      terminated_accounts_archive: {
        Row: {
          appeal_outcome: string | null
          appeal_received_at: string | null
          consent_snapshot: Json | null
          email: string | null
          evidence_json: Json
          hard_delete_at: string
          id: string
          original_user_id: string
          strikes_snapshot: Json | null
          terminated_at: string
          terminated_by: string | null
          termination_reason: string
        }
        Insert: {
          appeal_outcome?: string | null
          appeal_received_at?: string | null
          consent_snapshot?: Json | null
          email?: string | null
          evidence_json: Json
          hard_delete_at?: string
          id?: string
          original_user_id: string
          strikes_snapshot?: Json | null
          terminated_at?: string
          terminated_by?: string | null
          termination_reason: string
        }
        Update: {
          appeal_outcome?: string | null
          appeal_received_at?: string | null
          consent_snapshot?: Json | null
          email?: string | null
          evidence_json?: Json
          hard_delete_at?: string
          id?: string
          original_user_id?: string
          strikes_snapshot?: Json | null
          terminated_at?: string
          terminated_by?: string | null
          termination_reason?: string
        }
        Relationships: []
      }
      text_studio_comparisons: {
        Row: {
          created_at: string
          id: string
          prompt: string
          results: Json
          system_prompt: string | null
          total_cost_eur: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          prompt: string
          results?: Json
          system_prompt?: string | null
          total_cost_eur?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          prompt?: string
          results?: Json
          system_prompt?: string | null
          total_cost_eur?: number
          user_id?: string
        }
        Relationships: []
      }
      text_studio_conversations: {
        Row: {
          branch_label: string | null
          branched_from_message_id: string | null
          created_at: string
          creativity: string
          id: string
          is_private: boolean
          model: string
          parent_conversation_id: string | null
          persona_id: string | null
          reasoning_effort: string | null
          response_length: string
          title: string
          total_cost_eur: number
          total_input_tokens: number
          total_output_tokens: number
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_label?: string | null
          branched_from_message_id?: string | null
          created_at?: string
          creativity?: string
          id?: string
          is_private?: boolean
          model: string
          parent_conversation_id?: string | null
          persona_id?: string | null
          reasoning_effort?: string | null
          response_length?: string
          title?: string
          total_cost_eur?: number
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_label?: string | null
          branched_from_message_id?: string | null
          created_at?: string
          creativity?: string
          id?: string
          is_private?: boolean
          model?: string
          parent_conversation_id?: string | null
          persona_id?: string | null
          reasoning_effort?: string | null
          response_length?: string
          title?: string
          total_cost_eur?: number
          total_input_tokens?: number
          total_output_tokens?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "text_studio_conversations_parent_conversation_id_fkey"
            columns: ["parent_conversation_id"]
            isOneToOne: false
            referencedRelation: "text_studio_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "text_studio_conversations_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "text_studio_personas"
            referencedColumns: ["id"]
          },
        ]
      }
      text_studio_messages: {
        Row: {
          content: string
          conversation_id: string
          cost_eur: number | null
          created_at: string
          id: string
          input_tokens: number | null
          model: string | null
          output_tokens: number | null
          reasoning_effort: string | null
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          cost_eur?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          reasoning_effort?: string | null
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          cost_eur?: number | null
          created_at?: string
          id?: string
          input_tokens?: number | null
          model?: string | null
          output_tokens?: number | null
          reasoning_effort?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "text_studio_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "text_studio_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      text_studio_personas: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_system_preset: boolean
          name: string
          system_prompt: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_preset?: boolean
          name: string
          system_prompt: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_system_preset?: boolean
          name?: string
          system_prompt?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      tiktok_sync_logs: {
        Row: {
          error_details: Json | null
          id: number
          message: string | null
          status: string
          synced_at: string
          user_id: string
          videos_synced: number | null
        }
        Insert: {
          error_details?: Json | null
          id?: number
          message?: string | null
          status: string
          synced_at?: string
          user_id: string
          videos_synced?: number | null
        }
        Update: {
          error_details?: Json | null
          id?: number
          message?: string | null
          status?: string
          synced_at?: string
          user_id?: string
          videos_synced?: number | null
        }
        Relationships: []
      }
      tiktok_uploads: {
        Row: {
          duration_seconds: number | null
          error_message: string | null
          file_size_bytes: number | null
          id: number
          status: string
          thumbnail_url: string | null
          tiktok_share_url: string | null
          tiktok_video_id: string | null
          uploaded_at: string
          user_id: string
          video_description: string | null
          video_title: string
        }
        Insert: {
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: number
          status?: string
          thumbnail_url?: string | null
          tiktok_share_url?: string | null
          tiktok_video_id?: string | null
          uploaded_at?: string
          user_id: string
          video_description?: string | null
          video_title: string
        }
        Update: {
          duration_seconds?: number | null
          error_message?: string | null
          file_size_bytes?: number | null
          id?: number
          status?: string
          thumbnail_url?: string | null
          tiktok_share_url?: string | null
          tiktok_video_id?: string | null
          uploaded_at?: string
          user_id?: string
          video_description?: string | null
          video_title?: string
        }
        Relationships: []
      }
      translation_cache: {
        Row: {
          created_at: string
          hash: string
          source: string
          source_lang: string
          target: string
          target_lang: string
        }
        Insert: {
          created_at?: string
          hash: string
          source: string
          source_lang: string
          target: string
          target_lang: string
        }
        Update: {
          created_at?: string
          hash?: string
          source?: string
          source_lang?: string
          target?: string
          target_lang?: string
        }
        Relationships: []
      }
      trend_bookmarks: {
        Row: {
          id: string
          saved_at: string
          trend_id: string
          user_id: string
        }
        Insert: {
          id?: string
          saved_at?: string
          trend_id: string
          user_id: string
        }
        Update: {
          id?: string
          saved_at?: string
          trend_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trend_bookmarks_trend_id_fkey"
            columns: ["trend_id"]
            isOneToOne: false
            referencedRelation: "trend_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      trend_entries: {
        Row: {
          category: string | null
          created_at: string
          data_json: Json
          description: string | null
          id: string
          language: string
          name: string
          platform: string
          popularity_index: number
          region: string | null
          trend_type: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          data_json?: Json
          description?: string | null
          id?: string
          language?: string
          name: string
          platform: string
          popularity_index?: number
          region?: string | null
          trend_type: string
        }
        Update: {
          category?: string | null
          created_at?: string
          data_json?: Json
          description?: string | null
          id?: string
          language?: string
          name?: string
          platform?: string
          popularity_index?: number
          region?: string | null
          trend_type?: string
        }
        Relationships: []
      }
      trend_ideas: {
        Row: {
          created_at: string
          hashtags: Json
          id: string
          ideas_json: Json
          recommended_platforms: Json
          summary: string | null
          trend_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hashtags?: Json
          id?: string
          ideas_json?: Json
          recommended_platforms?: Json
          summary?: string | null
          trend_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          hashtags?: Json
          id?: string
          ideas_json?: Json
          recommended_platforms?: Json
          summary?: string | null
          trend_name?: string
          user_id?: string
        }
        Relationships: []
      }
      universal_audio_assets: {
        Row: {
          bpm: number | null
          created_at: string | null
          duration_sec: number | null
          effect_config: Json | null
          genre: string | null
          id: string
          mood: string | null
          original_audio_url: string | null
          processing_preset: string | null
          source: string | null
          stock_id: string | null
          stock_provider: string | null
          storage_path: string | null
          storage_url: string | null
          thumbnail_url: string | null
          title: string | null
          type: string
          updated_at: string | null
          url: string | null
          user_id: string
          waveform_data: Json | null
        }
        Insert: {
          bpm?: number | null
          created_at?: string | null
          duration_sec?: number | null
          effect_config?: Json | null
          genre?: string | null
          id?: string
          mood?: string | null
          original_audio_url?: string | null
          processing_preset?: string | null
          source?: string | null
          stock_id?: string | null
          stock_provider?: string | null
          storage_path?: string | null
          storage_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          url?: string | null
          user_id: string
          waveform_data?: Json | null
        }
        Update: {
          bpm?: number | null
          created_at?: string | null
          duration_sec?: number | null
          effect_config?: Json | null
          genre?: string | null
          id?: string
          mood?: string | null
          original_audio_url?: string | null
          processing_preset?: string | null
          source?: string | null
          stock_id?: string | null
          stock_provider?: string | null
          storage_path?: string | null
          storage_url?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
          waveform_data?: Json | null
        }
        Relationships: []
      }
      universal_background_assets: {
        Row: {
          color: string | null
          created_at: string | null
          duration_sec: number | null
          gradient_colors: Json | null
          id: string
          source: string | null
          storage_path: string | null
          thumbnail_url: string | null
          title: string | null
          type: string
          updated_at: string | null
          url: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          duration_sec?: number | null
          gradient_colors?: Json | null
          id?: string
          source?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type: string
          updated_at?: string | null
          url?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          duration_sec?: number | null
          gradient_colors?: Json | null
          id?: string
          source?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          title?: string | null
          type?: string
          updated_at?: string | null
          url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      universal_video_generation_progress: {
        Row: {
          assets_json: Json | null
          category: string
          consultation_result: Json | null
          created_at: string | null
          current_step: string | null
          error: string | null
          id: string
          message: string | null
          music_url: string | null
          progress: number | null
          project_data: Json | null
          render_results: Json | null
          script: Json | null
          status: string | null
          step_index: number | null
          updated_at: string | null
          user_id: string
          voiceover_url: string | null
        }
        Insert: {
          assets_json?: Json | null
          category: string
          consultation_result?: Json | null
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          id?: string
          message?: string | null
          music_url?: string | null
          progress?: number | null
          project_data?: Json | null
          render_results?: Json | null
          script?: Json | null
          status?: string | null
          step_index?: number | null
          updated_at?: string | null
          user_id: string
          voiceover_url?: string | null
        }
        Update: {
          assets_json?: Json | null
          category?: string
          consultation_result?: Json | null
          created_at?: string | null
          current_step?: string | null
          error?: string | null
          id?: string
          message?: string | null
          music_url?: string | null
          progress?: number | null
          project_data?: Json | null
          render_results?: Json | null
          script?: Json | null
          status?: string | null
          step_index?: number | null
          updated_at?: string | null
          user_id?: string
          voiceover_url?: string | null
        }
        Relationships: []
      }
      universal_video_progress: {
        Row: {
          briefing_json: Json | null
          category: string
          completed_at: string | null
          created_at: string
          current_step: string | null
          id: string
          progress_percent: number | null
          result_data: Json | null
          status: string
          status_message: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          briefing_json?: Json | null
          category: string
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          id?: string
          progress_percent?: number | null
          result_data?: Json | null
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          briefing_json?: Json | null
          category?: string
          completed_at?: string | null
          created_at?: string
          current_step?: string | null
          id?: string
          progress_percent?: number | null
          result_data?: Json | null
          status?: string
          status_message?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      universal_video_renders: {
        Row: {
          aspect_ratio: string | null
          category: string
          cold_start: boolean | null
          completed_at: string | null
          created_at: string
          duration_seconds: number | null
          error_message: string | null
          frames_per_lambda: number | null
          frames_total: number | null
          id: string
          input_props: Json | null
          lambda_duration_ms: number | null
          output_url: string | null
          preflight_ms: number | null
          render_id: string | null
          source: string | null
          started_at: string | null
          status: string
          total_duration_ms: number | null
          updated_at: string
          user_id: string
          workers_used: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          category: string
          cold_start?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          frames_per_lambda?: number | null
          frames_total?: number | null
          id?: string
          input_props?: Json | null
          lambda_duration_ms?: number | null
          output_url?: string | null
          preflight_ms?: number | null
          render_id?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          total_duration_ms?: number | null
          updated_at?: string
          user_id: string
          workers_used?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          category?: string
          cold_start?: boolean | null
          completed_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          error_message?: string | null
          frames_per_lambda?: number | null
          frames_total?: number | null
          id?: string
          input_props?: Json | null
          lambda_duration_ms?: number | null
          output_url?: string | null
          preflight_ms?: number | null
          render_id?: string | null
          source?: string | null
          started_at?: string | null
          status?: string
          total_duration_ms?: number | null
          updated_at?: string
          user_id?: string
          workers_used?: number | null
        }
        Relationships: []
      }
      usage: {
        Row: {
          count: number | null
          date: string | null
          id: string
          user_id: string
        }
        Insert: {
          count?: number | null
          date?: string | null
          id?: string
          user_id: string
        }
        Update: {
          count?: number | null
          date?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_logs: {
        Row: {
          created_at: string
          credits: number
          feature_code: string
          id: string
          latency_ms: number | null
          meta: Json
          request_id: string | null
          status: Database["public"]["Enums"]["usage_status"]
          units: number
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          credits: number
          feature_code: string
          id?: string
          latency_ms?: number | null
          meta?: Json
          request_id?: string | null
          status?: Database["public"]["Enums"]["usage_status"]
          units?: number
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          credits?: number
          feature_code?: string
          id?: string
          latency_ms?: number | null
          meta?: Json
          request_id?: string | null
          status?: Database["public"]["Enums"]["usage_status"]
          units?: number
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_audio_library: {
        Row: {
          artist: string | null
          bpm: number | null
          created_at: string
          duration_sec: number | null
          external_id: string | null
          genre: string | null
          id: string
          is_favorite: boolean
          mood: string | null
          preview_url: string | null
          source: string
          tags: string[]
          thumbnail_url: string | null
          title: string
          type: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          genre?: string | null
          id?: string
          is_favorite?: boolean
          mood?: string | null
          preview_url?: string | null
          source: string
          tags?: string[]
          thumbnail_url?: string | null
          title: string
          type: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          artist?: string | null
          bpm?: number | null
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          genre?: string | null
          id?: string
          is_favorite?: boolean
          mood?: string | null
          preview_url?: string | null
          source?: string
          tags?: string[]
          thumbnail_url?: string | null
          title?: string
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      user_behavior_events: {
        Row: {
          content_type: string | null
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          session_id: string | null
          template_id: string | null
          user_id: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          session_id?: string | null
          template_id?: string | null
          user_id: string
        }
        Update: {
          content_type?: string | null
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          session_id?: string | null
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_behavior_events_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_capacity: {
        Row: {
          available_minutes: number
          created_at: string
          id: string
          notes: string | null
          updated_at: string
          user_id: string
          week_start: string
          workspace_id: string
        }
        Insert: {
          available_minutes?: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id: string
          week_start: string
          workspace_id: string
        }
        Update: {
          available_minutes?: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_capacity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_credit_transactions: {
        Row: {
          amount: number
          created_at: string | null
          feature_code: string | null
          id: string
          metadata: Json | null
          reservation_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          feature_code?: string | null
          id?: string
          metadata?: Json | null
          reservation_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          feature_code?: string | null
          id?: string
          metadata?: Json | null
          reservation_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credit_transactions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "credit_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_legal_consents: {
        Row: {
          accepted_at: string
          consent_type: string
          consent_version: string
          id: string
          metadata: Json
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type: string
          consent_version: string
          id?: string
          metadata?: Json
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          consent_version?: string
          id?: string
          metadata?: Json
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_media_library: {
        Row: {
          author_name: string | null
          author_url: string | null
          category: string | null
          created_at: string
          duration_sec: number | null
          external_id: string | null
          height: number | null
          id: string
          is_favorite: boolean
          source: string
          tags: string[] | null
          thumbnail_url: string | null
          type: string
          url: string
          user_id: string
          width: number | null
        }
        Insert: {
          author_name?: string | null
          author_url?: string | null
          category?: string | null
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          source: string
          tags?: string[] | null
          thumbnail_url?: string | null
          type: string
          url: string
          user_id: string
          width?: number | null
        }
        Update: {
          author_name?: string | null
          author_url?: string | null
          category?: string | null
          created_at?: string
          duration_sec?: number | null
          external_id?: string | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          source?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          type?: string
          url?: string
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      user_metrics_daily: {
        Row: {
          auto_replies_sent: number
          avg_engagement: number | null
          captions_rewritten: number
          comments_imported: number
          created_at: string
          date: string
          goals_active: number
          goals_completed: number
          hooks_generated: number
          id: string
          posts_created: number
          posts_published: number
          posts_scheduled: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_replies_sent?: number
          avg_engagement?: number | null
          captions_rewritten?: number
          comments_imported?: number
          created_at?: string
          date: string
          goals_active?: number
          goals_completed?: number
          hooks_generated?: number
          id?: string
          posts_created?: number
          posts_published?: number
          posts_scheduled?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_replies_sent?: number
          avg_engagement?: number | null
          captions_rewritten?: number
          comments_imported?: number
          created_at?: string
          date?: string
          goals_active?: number
          goals_completed?: number
          hooks_generated?: number
          id?: string
          posts_created?: number
          posts_published?: number
          posts_scheduled?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          browser: string | null
          created_at: string | null
          device_info: string | null
          id: string
          ip_address: string | null
          is_current: boolean | null
          last_active: string | null
          location: string | null
          os: string | null
          session_token: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active?: string | null
          location?: string | null
          os?: string | null
          session_token?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_current?: boolean | null
          last_active?: string | null
          location?: string | null
          os?: string | null
          session_token?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_storage: {
        Row: {
          quota_mb: number
          updated_at: string | null
          used_mb: number
          user_id: string
        }
        Insert: {
          quota_mb?: number
          updated_at?: string | null
          used_mb?: number
          user_id: string
        }
        Update: {
          quota_mb?: number
          updated_at?: string | null
          used_mb?: number
          user_id?: string
        }
        Relationships: []
      }
      user_storage_quotas: {
        Row: {
          created_at: string
          last_calculated_at: string | null
          plan_tier: string
          quota_mb: number
          updated_at: string
          used_mb: number
          user_id: string
        }
        Insert: {
          created_at?: string
          last_calculated_at?: string | null
          plan_tier?: string
          quota_mb?: number
          updated_at?: string
          used_mb?: number
          user_id: string
        }
        Update: {
          created_at?: string
          last_calculated_at?: string | null
          plan_tier?: string
          quota_mb?: number
          updated_at?: string
          used_mb?: number
          user_id?: string
        }
        Relationships: []
      }
      user_streaks: {
        Row: {
          created_at: string
          current_streak: number
          freeze_tokens: number
          freeze_used_at: string | null
          last_activity_date: string | null
          longest_streak: number
          total_active_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          freeze_tokens?: number
          freeze_used_at?: string | null
          last_activity_date?: string | null
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          freeze_tokens?: number
          freeze_used_at?: string | null
          last_activity_date?: string | null
          longest_streak?: number
          total_active_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_video_library: {
        Row: {
          asset_type: string
          created_at: string
          download_url: string
          duration_sec: number | null
          external_id: string
          fps: number | null
          height: number | null
          id: string
          is_favorite: boolean
          metadata: Json | null
          preview_url: string | null
          source: string
          tags: string[] | null
          thumbnail_url: string | null
          title: string | null
          user_id: string
          width: number | null
        }
        Insert: {
          asset_type?: string
          created_at?: string
          download_url: string
          duration_sec?: number | null
          external_id: string
          fps?: number | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          metadata?: Json | null
          preview_url?: string | null
          source: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          user_id: string
          width?: number | null
        }
        Update: {
          asset_type?: string
          created_at?: string
          download_url?: string
          duration_sec?: number | null
          external_id?: string
          fps?: number | null
          height?: number | null
          id?: string
          is_favorite?: boolean
          metadata?: Json | null
          preview_url?: string | null
          source?: string
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string | null
          user_id?: string
          width?: number | null
        }
        Relationships: []
      }
      v434_artifact_pins: {
        Row: {
          attempt: number | null
          byte_size: number | null
          cell: string | null
          created_at: string
          generation: number | null
          id: string
          kind: string
          notes: Json | null
          object_key: string | null
          pass_idx: number | null
          pinned_url: string | null
          purpose: string
          run_id: string | null
          scene_id: string | null
          sha256: string | null
          source_url: string | null
          status: string
        }
        Insert: {
          attempt?: number | null
          byte_size?: number | null
          cell?: string | null
          created_at?: string
          generation?: number | null
          id?: string
          kind: string
          notes?: Json | null
          object_key?: string | null
          pass_idx?: number | null
          pinned_url?: string | null
          purpose?: string
          run_id?: string | null
          scene_id?: string | null
          sha256?: string | null
          source_url?: string | null
          status: string
        }
        Update: {
          attempt?: number | null
          byte_size?: number | null
          cell?: string | null
          created_at?: string
          generation?: number | null
          id?: string
          kind?: string
          notes?: Json | null
          object_key?: string | null
          pass_idx?: number | null
          pinned_url?: string | null
          purpose?: string
          run_id?: string | null
          scene_id?: string | null
          sha256?: string | null
          source_url?: string | null
          status?: string
        }
        Relationships: []
      }
      video_analytics: {
        Row: {
          created_at: string
          creation_id: string
          ctr: number | null
          engagement_rate: number | null
          id: string
          updated_at: string
          user_id: string
          views: number | null
          watch_time: number | null
        }
        Insert: {
          created_at?: string
          creation_id: string
          ctr?: number | null
          engagement_rate?: number | null
          id?: string
          updated_at?: string
          user_id: string
          views?: number | null
          watch_time?: number | null
        }
        Update: {
          created_at?: string
          creation_id?: string
          ctr?: number | null
          engagement_rate?: number | null
          id?: string
          updated_at?: string
          user_id?: string
          views?: number | null
          watch_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_analytics_creation_id_fkey"
            columns: ["creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_creations: {
        Row: {
          aspect_ratio: string | null
          batch_job_id: string | null
          brand_kit_id: string | null
          compressed_file_size_mb: number | null
          compression_ratio: number | null
          compression_settings: Json | null
          created_at: string | null
          credits_used: number | null
          custom_thumbnail_uploaded: boolean | null
          customizations: Json | null
          download_count: number | null
          error_message: string | null
          file_size: number | null
          format: string | null
          framerate: number | null
          id: string
          last_error_message: string | null
          max_retries: number | null
          media_assets: Json | null
          metadata: Json | null
          original_file_size_mb: number | null
          output_url: string | null
          parent_video_id: string | null
          progress_percentage: number | null
          progress_stage: string | null
          quality: string | null
          render_id: string | null
          retry_count: number | null
          share_count: number | null
          stage_details: Json | null
          status: string | null
          template_id: string | null
          thumbnail_timestamp_sec: number | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          version_number: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          batch_job_id?: string | null
          brand_kit_id?: string | null
          compressed_file_size_mb?: number | null
          compression_ratio?: number | null
          compression_settings?: Json | null
          created_at?: string | null
          credits_used?: number | null
          custom_thumbnail_uploaded?: boolean | null
          customizations?: Json | null
          download_count?: number | null
          error_message?: string | null
          file_size?: number | null
          format?: string | null
          framerate?: number | null
          id?: string
          last_error_message?: string | null
          max_retries?: number | null
          media_assets?: Json | null
          metadata?: Json | null
          original_file_size_mb?: number | null
          output_url?: string | null
          parent_video_id?: string | null
          progress_percentage?: number | null
          progress_stage?: string | null
          quality?: string | null
          render_id?: string | null
          retry_count?: number | null
          share_count?: number | null
          stage_details?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_timestamp_sec?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          version_number?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          batch_job_id?: string | null
          brand_kit_id?: string | null
          compressed_file_size_mb?: number | null
          compression_ratio?: number | null
          compression_settings?: Json | null
          created_at?: string | null
          credits_used?: number | null
          custom_thumbnail_uploaded?: boolean | null
          customizations?: Json | null
          download_count?: number | null
          error_message?: string | null
          file_size?: number | null
          format?: string | null
          framerate?: number | null
          id?: string
          last_error_message?: string | null
          max_retries?: number | null
          media_assets?: Json | null
          metadata?: Json | null
          original_file_size_mb?: number | null
          output_url?: string | null
          parent_video_id?: string | null
          progress_percentage?: number | null
          progress_stage?: string | null
          quality?: string | null
          render_id?: string | null
          retry_count?: number | null
          share_count?: number | null
          stage_details?: Json | null
          status?: string | null
          template_id?: string | null
          thumbnail_timestamp_sec?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "video_creations_batch_job_id_fkey"
            columns: ["batch_job_id"]
            isOneToOne: false
            referencedRelation: "batch_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_creations_brand_kit_id_fkey"
            columns: ["brand_kit_id"]
            isOneToOne: false
            referencedRelation: "brand_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_creations_parent_video_id_fkey"
            columns: ["parent_video_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_creations_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      video_enhance_admin_actions: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          run_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          run_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_enhance_admin_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_enhance_admin_actions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_topaz_drift_samples"
            referencedColumns: ["run_id"]
          },
        ]
      }
      video_enhance_cost_closure_audit: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          id: string
          reason: string
          run_id: string
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          id?: string
          reason: string
          run_id: string
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          reason?: string
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_enhance_cost_closure_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_enhance_cost_closure_audit_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_topaz_drift_samples"
            referencedColumns: ["run_id"]
          },
        ]
      }
      video_enhance_ledger: {
        Row: {
          amount_eur: number
          created_at: string
          id: string
          note: string | null
          operation: string
          operation_key: string
          run_id: string
          user_id: string
        }
        Insert: {
          amount_eur: number
          created_at?: string
          id?: string
          note?: string | null
          operation: string
          operation_key: string
          run_id: string
          user_id: string
        }
        Update: {
          amount_eur?: number
          created_at?: string
          id?: string
          note?: string | null
          operation?: string
          operation_key?: string
          run_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_enhance_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_enhance_ledger_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "video_enhance_topaz_drift_samples"
            referencedColumns: ["run_id"]
          },
        ]
      }
      video_enhance_runs: {
        Row: {
          account_discount_percent: number
          actual_contribution_eur: number | null
          actual_height: number | null
          actual_margin_pct: number | null
          actual_provider_credits: number | null
          actual_units: number | null
          actual_width: number | null
          calibration_reason: string | null
          calibration_status: string
          callback_token: string
          cancel_requested_at: string | null
          charged_price_eur: number | null
          contribution_eur: number | null
          cost_closed_at: string | null
          cost_closed_by: string | null
          cost_closure_reason: string | null
          cost_drift_ratio: number | null
          cost_estimator_version: string | null
          cost_uncertainty_buffer: number
          created_at: string
          credits_reserved: number
          currency: string
          delivery_strategy: string | null
          destination_object_path: string | null
          effective_multiple_after_discount: number | null
          effective_multiplier: number | null
          error_code: string | null
          error_message: string | null
          estimated_provider_credits: number | null
          estimated_units: number | null
          executing_topaz_model: string | null
          expected_content_length: number | null
          expected_content_type: string | null
          failure_stage: string | null
          fps: number
          fx_rate_used: number
          fx_safety_buffer_used: number
          id: string
          idempotency_key: string
          interpolation_model: string | null
          last_reconciled_at: string | null
          late_cost_attempts: number
          margin_pct: number | null
          mode: string
          model_id: string
          multiplier_band_max: number | null
          multiplier_band_min: number | null
          multiplier_cap: number | null
          multiplier_used: number | null
          net_revenue_eur: number | null
          next_late_check_at: string | null
          next_persist_at: string | null
          next_provider_poll_at: string | null
          next_reconcile_at: string | null
          output_asset_id: string | null
          output_bitrate_kbps: number | null
          output_codec: string | null
          output_container: string | null
          output_duration_seconds: number | null
          output_fps: number | null
          output_mime_type: string | null
          output_size_bytes: number | null
          output_url: string | null
          overcharge_refund_amount_eur: number | null
          overcharge_refund_at: string | null
          persist_attempts: number
          persist_last_error: string | null
          persist_lease_owner: string | null
          persist_lease_until: string | null
          pricing_gate: string | null
          pricing_gate_reason: string | null
          pricing_version: string
          processing_seconds: number | null
          profitability_class: string | null
          projected_height: number | null
          projected_width: number | null
          projection_confidence: string | null
          projection_matched: boolean | null
          projection_strategy: string | null
          provider_completed_at: string | null
          provider_cost_eur_buffered: number
          provider_cost_source: string
          provider_cost_usd_actual: number | null
          provider_cost_usd_estimated: number
          provider_credit_drift_flagged: boolean
          provider_credit_drift_pct: number | null
          provider_output_expires_at: string | null
          provider_output_url: string | null
          provider_prediction_id: string | null
          provider_pricing_version: string
          provider_retry_count: number
          provider_status: string | null
          provider_submitted_at: string | null
          rate_card_version: string
          reconciliation_attempts: number
          requested_model_id: string | null
          requested_output_quality: string | null
          resolution: string
          resumable_upload_expires_at: string | null
          resumable_upload_offset: number
          resumable_upload_url: string | null
          source_asset_id: string | null
          source_container: string | null
          source_duration_seconds: number
          source_fps: number
          source_height: number
          source_model: string | null
          source_size_bytes: number | null
          source_url: string
          source_width: number
          staging_key: string | null
          status: string
          submit_lease_expires_at: string | null
          submit_lease_owner: string | null
          subsidy_eur: number
          target_height: number | null
          target_width: number | null
          test_fail_persist_once: boolean
          tier: string
          unit_rate_checked_at: string | null
          unit_rate_source: string | null
          unit_rate_usd: number | null
          updated_at: string
          user_id: string
          user_price_eur: number
          verified_effective_multiplier: number | null
        }
        Insert: {
          account_discount_percent?: number
          actual_contribution_eur?: number | null
          actual_height?: number | null
          actual_margin_pct?: number | null
          actual_provider_credits?: number | null
          actual_units?: number | null
          actual_width?: number | null
          calibration_reason?: string | null
          calibration_status?: string
          callback_token: string
          cancel_requested_at?: string | null
          charged_price_eur?: number | null
          contribution_eur?: number | null
          cost_closed_at?: string | null
          cost_closed_by?: string | null
          cost_closure_reason?: string | null
          cost_drift_ratio?: number | null
          cost_estimator_version?: string | null
          cost_uncertainty_buffer?: number
          created_at?: string
          credits_reserved?: number
          currency?: string
          delivery_strategy?: string | null
          destination_object_path?: string | null
          effective_multiple_after_discount?: number | null
          effective_multiplier?: number | null
          error_code?: string | null
          error_message?: string | null
          estimated_provider_credits?: number | null
          estimated_units?: number | null
          executing_topaz_model?: string | null
          expected_content_length?: number | null
          expected_content_type?: string | null
          failure_stage?: string | null
          fps: number
          fx_rate_used: number
          fx_safety_buffer_used: number
          id?: string
          idempotency_key: string
          interpolation_model?: string | null
          last_reconciled_at?: string | null
          late_cost_attempts?: number
          margin_pct?: number | null
          mode: string
          model_id: string
          multiplier_band_max?: number | null
          multiplier_band_min?: number | null
          multiplier_cap?: number | null
          multiplier_used?: number | null
          net_revenue_eur?: number | null
          next_late_check_at?: string | null
          next_persist_at?: string | null
          next_provider_poll_at?: string | null
          next_reconcile_at?: string | null
          output_asset_id?: string | null
          output_bitrate_kbps?: number | null
          output_codec?: string | null
          output_container?: string | null
          output_duration_seconds?: number | null
          output_fps?: number | null
          output_mime_type?: string | null
          output_size_bytes?: number | null
          output_url?: string | null
          overcharge_refund_amount_eur?: number | null
          overcharge_refund_at?: string | null
          persist_attempts?: number
          persist_last_error?: string | null
          persist_lease_owner?: string | null
          persist_lease_until?: string | null
          pricing_gate?: string | null
          pricing_gate_reason?: string | null
          pricing_version: string
          processing_seconds?: number | null
          profitability_class?: string | null
          projected_height?: number | null
          projected_width?: number | null
          projection_confidence?: string | null
          projection_matched?: boolean | null
          projection_strategy?: string | null
          provider_completed_at?: string | null
          provider_cost_eur_buffered: number
          provider_cost_source?: string
          provider_cost_usd_actual?: number | null
          provider_cost_usd_estimated: number
          provider_credit_drift_flagged?: boolean
          provider_credit_drift_pct?: number | null
          provider_output_expires_at?: string | null
          provider_output_url?: string | null
          provider_prediction_id?: string | null
          provider_pricing_version: string
          provider_retry_count?: number
          provider_status?: string | null
          provider_submitted_at?: string | null
          rate_card_version: string
          reconciliation_attempts?: number
          requested_model_id?: string | null
          requested_output_quality?: string | null
          resolution: string
          resumable_upload_expires_at?: string | null
          resumable_upload_offset?: number
          resumable_upload_url?: string | null
          source_asset_id?: string | null
          source_container?: string | null
          source_duration_seconds: number
          source_fps: number
          source_height: number
          source_model?: string | null
          source_size_bytes?: number | null
          source_url: string
          source_width: number
          staging_key?: string | null
          status?: string
          submit_lease_expires_at?: string | null
          submit_lease_owner?: string | null
          subsidy_eur?: number
          target_height?: number | null
          target_width?: number | null
          test_fail_persist_once?: boolean
          tier: string
          unit_rate_checked_at?: string | null
          unit_rate_source?: string | null
          unit_rate_usd?: number | null
          updated_at?: string
          user_id: string
          user_price_eur: number
          verified_effective_multiplier?: number | null
        }
        Update: {
          account_discount_percent?: number
          actual_contribution_eur?: number | null
          actual_height?: number | null
          actual_margin_pct?: number | null
          actual_provider_credits?: number | null
          actual_units?: number | null
          actual_width?: number | null
          calibration_reason?: string | null
          calibration_status?: string
          callback_token?: string
          cancel_requested_at?: string | null
          charged_price_eur?: number | null
          contribution_eur?: number | null
          cost_closed_at?: string | null
          cost_closed_by?: string | null
          cost_closure_reason?: string | null
          cost_drift_ratio?: number | null
          cost_estimator_version?: string | null
          cost_uncertainty_buffer?: number
          created_at?: string
          credits_reserved?: number
          currency?: string
          delivery_strategy?: string | null
          destination_object_path?: string | null
          effective_multiple_after_discount?: number | null
          effective_multiplier?: number | null
          error_code?: string | null
          error_message?: string | null
          estimated_provider_credits?: number | null
          estimated_units?: number | null
          executing_topaz_model?: string | null
          expected_content_length?: number | null
          expected_content_type?: string | null
          failure_stage?: string | null
          fps?: number
          fx_rate_used?: number
          fx_safety_buffer_used?: number
          id?: string
          idempotency_key?: string
          interpolation_model?: string | null
          last_reconciled_at?: string | null
          late_cost_attempts?: number
          margin_pct?: number | null
          mode?: string
          model_id?: string
          multiplier_band_max?: number | null
          multiplier_band_min?: number | null
          multiplier_cap?: number | null
          multiplier_used?: number | null
          net_revenue_eur?: number | null
          next_late_check_at?: string | null
          next_persist_at?: string | null
          next_provider_poll_at?: string | null
          next_reconcile_at?: string | null
          output_asset_id?: string | null
          output_bitrate_kbps?: number | null
          output_codec?: string | null
          output_container?: string | null
          output_duration_seconds?: number | null
          output_fps?: number | null
          output_mime_type?: string | null
          output_size_bytes?: number | null
          output_url?: string | null
          overcharge_refund_amount_eur?: number | null
          overcharge_refund_at?: string | null
          persist_attempts?: number
          persist_last_error?: string | null
          persist_lease_owner?: string | null
          persist_lease_until?: string | null
          pricing_gate?: string | null
          pricing_gate_reason?: string | null
          pricing_version?: string
          processing_seconds?: number | null
          profitability_class?: string | null
          projected_height?: number | null
          projected_width?: number | null
          projection_confidence?: string | null
          projection_matched?: boolean | null
          projection_strategy?: string | null
          provider_completed_at?: string | null
          provider_cost_eur_buffered?: number
          provider_cost_source?: string
          provider_cost_usd_actual?: number | null
          provider_cost_usd_estimated?: number
          provider_credit_drift_flagged?: boolean
          provider_credit_drift_pct?: number | null
          provider_output_expires_at?: string | null
          provider_output_url?: string | null
          provider_prediction_id?: string | null
          provider_pricing_version?: string
          provider_retry_count?: number
          provider_status?: string | null
          provider_submitted_at?: string | null
          rate_card_version?: string
          reconciliation_attempts?: number
          requested_model_id?: string | null
          requested_output_quality?: string | null
          resolution?: string
          resumable_upload_expires_at?: string | null
          resumable_upload_offset?: number
          resumable_upload_url?: string | null
          source_asset_id?: string | null
          source_container?: string | null
          source_duration_seconds?: number
          source_fps?: number
          source_height?: number
          source_model?: string | null
          source_size_bytes?: number | null
          source_url?: string
          source_width?: number
          staging_key?: string | null
          status?: string
          submit_lease_expires_at?: string | null
          submit_lease_owner?: string | null
          subsidy_eur?: number
          target_height?: number | null
          target_width?: number | null
          test_fail_persist_once?: boolean
          tier?: string
          unit_rate_checked_at?: string | null
          unit_rate_source?: string | null
          unit_rate_usd?: number | null
          updated_at?: string
          user_id?: string
          user_price_eur?: number
          verified_effective_multiplier?: number | null
        }
        Relationships: []
      }
      video_mirror_errors: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          operation: string
          source_user_id: string
          source_video_id: string
          target_user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          operation: string
          source_user_id: string
          source_video_id: string
          target_user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          operation?: string
          source_user_id?: string
          source_video_id?: string
          target_user_id?: string
        }
        Relationships: []
      }
      video_model_tier_parity: {
        Row: {
          api_route: string
          consecutive_mismatches: number
          last_verdict: string | null
          mode: string
          model_id: string
          parity_status: string
          provider_model_slug: string | null
          provider_slug_key: string
          region: string
          resolution_label: string
          tier_disabled: boolean
          updated_at: string
        }
        Insert: {
          api_route?: string
          consecutive_mismatches?: number
          last_verdict?: string | null
          mode?: string
          model_id: string
          parity_status?: string
          provider_model_slug?: string | null
          provider_slug_key?: string
          region?: string
          resolution_label: string
          tier_disabled?: boolean
          updated_at?: string
        }
        Update: {
          api_route?: string
          consecutive_mismatches?: number
          last_verdict?: string | null
          mode?: string
          model_id?: string
          parity_status?: string
          provider_model_slug?: string | null
          provider_slug_key?: string
          region?: string
          resolution_label?: string
          tier_disabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      video_quality_presets: {
        Row: {
          config: Json
          created_at: string | null
          description: string | null
          estimated_quality_score: number | null
          id: string
          is_default: boolean | null
          is_global: boolean | null
          name: string
          target_file_size_mb: number | null
          user_id: string | null
        }
        Insert: {
          config: Json
          created_at?: string | null
          description?: string | null
          estimated_quality_score?: number | null
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name: string
          target_file_size_mb?: number | null
          user_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string | null
          description?: string | null
          estimated_quality_score?: number | null
          id?: string
          is_default?: boolean | null
          is_global?: boolean | null
          name?: string
          target_file_size_mb?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      video_renders: {
        Row: {
          bucket_name: string | null
          completed_at: string | null
          content_config: Json
          created_at: string | null
          error_message: string | null
          format_config: Json
          id: string
          project_id: string | null
          render_id: string
          source: string | null
          started_at: string | null
          status: string
          subtitle_config: Json
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          bucket_name?: string | null
          completed_at?: string | null
          content_config: Json
          created_at?: string | null
          error_message?: string | null
          format_config: Json
          id?: string
          project_id?: string | null
          render_id: string
          source?: string | null
          started_at?: string | null
          status?: string
          subtitle_config: Json
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          bucket_name?: string | null
          completed_at?: string | null
          content_config?: Json
          created_at?: string | null
          error_message?: string | null
          format_config?: Json
          id?: string
          project_id?: string | null
          render_id?: string
          source?: string | null
          started_at?: string | null
          status?: string
          subtitle_config?: Json
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
      }
      video_shares: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          share_url: string | null
          user_id: string
          video_creation_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform: string
          share_url?: string | null
          user_id: string
          video_creation_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          share_url?: string | null
          user_id?: string
          video_creation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_shares_video_creation_id_fkey"
            columns: ["video_creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      video_stream_probe_cache: {
        Row: {
          codec: string | null
          duration_sec: number | null
          fps: number | null
          has_audio_track: boolean | null
          height: number | null
          id: string
          probed_at: string
          raw_meta: Json | null
          video_url: string
          width: number | null
        }
        Insert: {
          codec?: string | null
          duration_sec?: number | null
          fps?: number | null
          has_audio_track?: boolean | null
          height?: number | null
          id?: string
          probed_at?: string
          raw_meta?: Json | null
          video_url: string
          width?: number | null
        }
        Update: {
          codec?: string | null
          duration_sec?: number | null
          fps?: number | null
          has_audio_track?: boolean | null
          height?: number | null
          id?: string
          probed_at?: string
          raw_meta?: Json | null
          video_url?: string
          width?: number | null
        }
        Relationships: []
      }
      video_template_versions: {
        Row: {
          change_notes: string | null
          created_at: string
          created_by: string | null
          customizable_fields: Json
          description: string | null
          id: string
          is_published: boolean | null
          name: string
          shotstack_template: Json
          template_id: string
          thumbnail_url: string | null
          version_number: number
        }
        Insert: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json
          description?: string | null
          id?: string
          is_published?: boolean | null
          name: string
          shotstack_template: Json
          template_id: string
          thumbnail_url?: string | null
          version_number: number
        }
        Update: {
          change_notes?: string | null
          created_at?: string
          created_by?: string | null
          customizable_fields?: Json
          description?: string | null
          id?: string
          is_published?: boolean | null
          name?: string
          shotstack_template?: Json
          template_id?: string
          thumbnail_url?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "video_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      video_templates: {
        Row: {
          aspect_ratio: string
          available_transitions: string[] | null
          category: string
          created_at: string | null
          current_version: number | null
          customizable_fields: Json
          default_transition_style: string | null
          description: string | null
          duration: number
          has_audio: boolean | null
          id: string
          is_featured: boolean | null
          is_public: boolean | null
          max_image_count: number | null
          max_video_count: number | null
          name: string
          platforms: string[] | null
          preview_url: string | null
          preview_video_url: string | null
          supports_multiple_images: boolean | null
          supports_multiple_videos: boolean | null
          supports_video: boolean | null
          tags: string[] | null
          template_config: Json
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          aspect_ratio: string
          available_transitions?: string[] | null
          category: string
          created_at?: string | null
          current_version?: number | null
          customizable_fields?: Json
          default_transition_style?: string | null
          description?: string | null
          duration: number
          has_audio?: boolean | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          max_image_count?: number | null
          max_video_count?: number | null
          name: string
          platforms?: string[] | null
          preview_url?: string | null
          preview_video_url?: string | null
          supports_multiple_images?: boolean | null
          supports_multiple_videos?: boolean | null
          supports_video?: boolean | null
          tags?: string[] | null
          template_config: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          aspect_ratio?: string
          available_transitions?: string[] | null
          category?: string
          created_at?: string | null
          current_version?: number | null
          customizable_fields?: Json
          default_transition_style?: string | null
          description?: string | null
          duration?: number
          has_audio?: boolean | null
          id?: string
          is_featured?: boolean | null
          is_public?: boolean | null
          max_image_count?: number | null
          max_video_count?: number | null
          name?: string
          platforms?: string[] | null
          preview_url?: string | null
          preview_video_url?: string | null
          supports_multiple_images?: boolean | null
          supports_multiple_videos?: boolean | null
          supports_video?: boolean | null
          tags?: string[] | null
          template_config?: Json
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      video_translations: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          original_transcript: string | null
          output_video_url: string | null
          source_language: string | null
          source_video_url: string
          status: string
          target_language: string
          translated_transcript: string | null
          updated_at: string
          user_id: string
          voiceover_url: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          original_transcript?: string | null
          output_video_url?: string | null
          source_language?: string | null
          source_video_url: string
          status?: string
          target_language: string
          translated_transcript?: string | null
          updated_at?: string
          user_id: string
          voiceover_url?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          original_transcript?: string | null
          output_video_url?: string | null
          source_language?: string | null
          source_video_url?: string
          status?: string
          target_language?: string
          translated_transcript?: string | null
          updated_at?: string
          user_id?: string
          voiceover_url?: string | null
        }
        Relationships: []
      }
      video_variants: {
        Row: {
          aspect_ratio: string | null
          created_at: string | null
          duration_sec: number | null
          file_size_mb: number | null
          file_url: string
          format: string | null
          id: string
          resolution: string | null
          updated_at: string | null
          variant_type: string
          video_creation_id: string
        }
        Insert: {
          aspect_ratio?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          file_url: string
          format?: string | null
          id?: string
          resolution?: string | null
          updated_at?: string | null
          variant_type: string
          video_creation_id: string
        }
        Update: {
          aspect_ratio?: string | null
          created_at?: string | null
          duration_sec?: number | null
          file_size_mb?: number | null
          file_url?: string
          format?: string | null
          id?: string
          resolution?: string | null
          updated_at?: string | null
          variant_type?: string
          video_creation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_variants_video_creation_id_fkey"
            columns: ["video_creation_id"]
            isOneToOne: false
            referencedRelation: "video_creations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_favorites: {
        Row: {
          created_at: string
          id: string
          language: string | null
          user_id: string
          voice_id: string
          voice_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          user_id: string
          voice_id: string
          voice_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          user_id?: string
          voice_id?: string
          voice_name?: string | null
        }
        Relationships: []
      }
      voice_library_cache: {
        Row: {
          accent: string | null
          age: string | null
          category: string | null
          description: string | null
          descriptive: string | null
          gender: string | null
          is_native: boolean
          labels: Json
          language: string
          locale: string | null
          name: string
          popularity: number
          preview_url: string | null
          quality: string | null
          search_tsv: unknown
          supported_languages: string[]
          tier: string
          updated_at: string
          use_case: string | null
          voice_id: string
        }
        Insert: {
          accent?: string | null
          age?: string | null
          category?: string | null
          description?: string | null
          descriptive?: string | null
          gender?: string | null
          is_native?: boolean
          labels?: Json
          language: string
          locale?: string | null
          name: string
          popularity?: number
          preview_url?: string | null
          quality?: string | null
          search_tsv?: unknown
          supported_languages?: string[]
          tier?: string
          updated_at?: string
          use_case?: string | null
          voice_id: string
        }
        Update: {
          accent?: string | null
          age?: string | null
          category?: string | null
          description?: string | null
          descriptive?: string | null
          gender?: string | null
          is_native?: boolean
          labels?: Json
          language?: string
          locale?: string | null
          name?: string
          popularity?: number
          preview_url?: string | null
          quality?: string | null
          search_tsv?: unknown
          supported_languages?: string[]
          tier?: string
          updated_at?: string
          use_case?: string | null
          voice_id?: string
        }
        Relationships: []
      }
      voice_library_sync_runs: {
        Row: {
          error: string | null
          fetched: number
          finished_at: string | null
          id: string
          languages: string[]
          started_at: string
          status: string
          trigger_source: string | null
          upserted: number
        }
        Insert: {
          error?: string | null
          fetched?: number
          finished_at?: string | null
          id?: string
          languages?: string[]
          started_at?: string
          status?: string
          trigger_source?: string | null
          upserted?: number
        }
        Update: {
          error?: string | null
          fetched?: number
          finished_at?: string | null
          id?: string
          languages?: string[]
          started_at?: string
          status?: string
          trigger_source?: string | null
          upserted?: number
        }
        Relationships: []
      }
      voice_translations: {
        Row: {
          created_at: string | null
          duration_sec: number | null
          id: string
          original_language: string
          original_text: string
          target_language: string
          translated_text: string
          user_id: string
          voice_id: string | null
          voiceover_url: string | null
        }
        Insert: {
          created_at?: string | null
          duration_sec?: number | null
          id?: string
          original_language: string
          original_text: string
          target_language: string
          translated_text: string
          user_id: string
          voice_id?: string | null
          voiceover_url?: string | null
        }
        Update: {
          created_at?: string | null
          duration_sec?: number | null
          id?: string
          original_language?: string
          original_text?: string
          target_language?: string
          translated_text?: string
          user_id?: string
          voice_id?: string | null
          voiceover_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_translations_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "custom_voices"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet: {
        Row: {
          balance_credits: number
          id: string
          last_top_up_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance_credits?: number
          id?: string
          last_top_up_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance_credits?: number
          id?: string
          last_top_up_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      wallets: {
        Row: {
          balance: number
          created_at: string | null
          id: string
          last_reset_at: string | null
          monthly_credits: number
          plan_code: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          monthly_credits?: number
          plan_code?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string | null
          id?: string
          last_reset_at?: string | null
          monthly_credits?: number
          plan_code?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wardrobe_catalog_previews: {
        Row: {
          created_at: string
          gender: string
          id: string
          image_url: string
          outfit_id: string
          outfit_label: string
          storage_path: string
          theme_pack: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          gender: string
          id?: string
          image_url: string
          outfit_id: string
          outfit_label: string
          storage_path: string
          theme_pack: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          gender?: string
          id?: string
          image_url?: string
          outfit_id?: string
          outfit_label?: string
          storage_path?: string
          theme_pack?: string
          updated_at?: string
        }
        Relationships: []
      }
      wardrobe_catalog_seed_jobs: {
        Row: {
          completed_slots: number
          created_at: string
          error_log: Json
          failed_slots: number
          id: string
          status: string
          total_slots: number
          triggered_by: string | null
          updated_at: string
        }
        Insert: {
          completed_slots?: number
          created_at?: string
          error_log?: Json
          failed_slots?: number
          id?: string
          status?: string
          total_slots?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Update: {
          completed_slots?: number
          created_at?: string
          error_log?: Json
          failed_slots?: number
          id?: string
          status?: string
          total_slots?: number
          triggered_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      wardrobe_perspective_renders: {
        Row: {
          avatar_id: string
          created_at: string
          id: string
          image_url: string
          outfit_id: string
          outfit_label: string
          perspective: string
          storage_path: string
          theme_pack: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_id: string
          created_at?: string
          id?: string
          image_url: string
          outfit_id: string
          outfit_label: string
          perspective: string
          storage_path: string
          theme_pack: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_id?: string
          created_at?: string
          id?: string
          image_url?: string
          outfit_id?: string
          outfit_label?: string
          perspective?: string
          storage_path?: string
          theme_pack?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wardrobe_perspective_renders_avatar_id_fkey"
            columns: ["avatar_id"]
            isOneToOne: false
            referencedRelation: "brand_characters"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          secret: string
          url: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret: string
          url: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          secret?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      weekplans: {
        Row: {
          created_at: string | null
          created_by: string | null
          default_platforms: Json | null
          id: string
          name: string
          start_date: string
          status: string
          timezone: string
          updated_at: string | null
          weeks: number
          workspace_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          default_platforms?: Json | null
          id?: string
          name: string
          start_date: string
          status?: string
          timezone?: string
          updated_at?: string | null
          weeks: number
          workspace_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          default_platforms?: Json | null
          id?: string
          name?: string
          start_date?: string
          status?: string
          timezone?: string
          updated_at?: string | null
          weeks?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekplans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_settings: {
        Row: {
          accent_color: string | null
          brand_name: string | null
          created_at: string
          custom_css: string | null
          custom_domain: string | null
          favicon_url: string | null
          id: string
          login_background_url: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          show_powered_by: boolean
          updated_at: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          custom_css?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_powered_by?: boolean
          updated_at?: string
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          accent_color?: string | null
          brand_name?: string | null
          created_at?: string
          custom_css?: string | null
          custom_domain?: string | null
          favicon_url?: string | null
          id?: string
          login_background_url?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          show_powered_by?: boolean
          updated_at?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      winback_email_log: {
        Row: {
          email_message_id: string | null
          id: string
          metadata: Json | null
          sent_at: string
          stage: string
          user_id: string
        }
        Insert: {
          email_message_id?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          stage: string
          user_id: string
        }
        Update: {
          email_message_id?: string | null
          id?: string
          metadata?: Json | null
          sent_at?: string
          stage?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["team_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["team_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["team_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_workspace_members_user_id"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscription: {
        Row: {
          created_at: string
          id: string
          low_balance_threshold: number
          overage_enabled: boolean
          plan_id: string
          renew_day: number
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          low_balance_threshold?: number
          overage_enabled?: boolean
          plan_id: string
          renew_day?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          low_balance_threshold?: number
          overage_enabled?: boolean
          plan_id?: string
          renew_day?: number
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscription_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_subscription_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_subscriptions: {
        Row: {
          additional_seats: number | null
          base_seats: number | null
          created_at: string | null
          currency: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_type: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          total_amount: number
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          additional_seats?: number | null
          base_seats?: number | null
          created_at?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          total_amount: number
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          additional_seats?: number | null
          base_seats?: number | null
          created_at?: string | null
          currency?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_type?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          total_amount?: number
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          ai_paused: boolean
          created_at: string
          description: string | null
          id: string
          is_enterprise: boolean | null
          max_members: number | null
          member_currency: string | null
          member_seat_price: number | null
          name: string
          owner_id: string
          owner_user_id: string | null
          settings_json: Json | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_enterprise?: boolean | null
          max_members?: number | null
          member_currency?: string | null
          member_seat_price?: number | null
          name: string
          owner_id: string
          owner_user_id?: string | null
          settings_json?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_paused?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_enterprise?: boolean | null
          max_members?: number | null
          member_currency?: string | null
          member_seat_price?: number | null
          name?: string
          owner_id?: string
          owner_user_id?: string | null
          settings_json?: Json | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      cache_stats_recent: {
        Row: {
          avg_latency_ms: number | null
          cache_type: string | null
          endpoint: string | null
          hit_rate_pct: number | null
          hits: number | null
          last_recorded_at: string | null
          misses: number | null
          total_requests: number | null
        }
        Relationships: []
      }
      lambda_health_recent: {
        Row: {
          avg_duration_ms: number | null
          avg_memory_mb: number | null
          failed: number | null
          failure_rate: number | null
          oom_count: number | null
          peak_memory_mb: number | null
          successful: number | null
          total_renders: number | null
        }
        Relationships: []
      }
      provider_quota_stats_recent: {
        Row: {
          avg_response_time_ms: number | null
          failed_requests: number | null
          last_call_at: string | null
          provider: string | null
          rate_limit_remaining_min: number | null
          rate_limit_total: number | null
          requests_last_minute: number | null
          successful_requests: number | null
        }
        Relationships: []
      }
      v_active_publishes: {
        Row: {
          active_count: number | null
          oldest_started: string | null
          user_id: string | null
        }
        Relationships: []
      }
      v_avg_duration: {
        Row: {
          avg_duration_ms: number | null
          provider: string | null
          total_count: number | null
        }
        Relationships: []
      }
      v_cron_summary: {
        Row: {
          avg_duration_ms: number | null
          error_runs: number | null
          hour: string | null
          success_runs: number | null
          total_runs: number | null
        }
        Relationships: []
      }
      v_metrics_summary: {
        Row: {
          avg_engagement: number | null
          comments: number | null
          day: string | null
          impressions: number | null
          likes: number | null
          provider: string | null
          shares: number | null
          user_id: string | null
          views: number | null
        }
        Relationships: []
      }
      v_quota_usage: {
        Row: {
          quota_mb: number | null
          usage_percent: number | null
          used_mb: number | null
          user_id: string | null
        }
        Insert: {
          quota_mb?: number | null
          usage_percent?: never
          used_mb?: number | null
          user_id?: string | null
        }
        Update: {
          quota_mb?: number | null
          usage_percent?: never
          used_mb?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      v_success_rate: {
        Row: {
          error_count: number | null
          provider: string | null
          success_count: number | null
          success_ratio: number | null
          total_count: number | null
        }
        Relationships: []
      }
      v_top_posts: {
        Row: {
          caption_text: string | null
          comments: number | null
          engagement_rate: number | null
          external_id: string | null
          likes: number | null
          permalink: string | null
          posted_at: string | null
          provider: string | null
          shares: number | null
          user_id: string | null
          views: number | null
        }
        Insert: {
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: never
          external_id?: never
          likes?: number | null
          permalink?: string | null
          posted_at?: string | null
          provider?: string | null
          shares?: number | null
          user_id?: string | null
          views?: never
        }
        Update: {
          caption_text?: string | null
          comments?: number | null
          engagement_rate?: never
          external_id?: never
          likes?: number | null
          permalink?: string | null
          posted_at?: string | null
          provider?: string | null
          shares?: number | null
          user_id?: string | null
          views?: never
        }
        Relationships: []
      }
      video_enhance_topaz_drift_groups: {
        Row: {
          avg_drift_pct: number | null
          avg_effective_multiple: number | null
          cost_estimator_version: string | null
          duration_bucket: string | null
          flagged_samples: number | null
          interpolation_model: string | null
          max_drift_pct: number | null
          min_drift_pct: number | null
          samples: number | null
          subsidized_samples: number | null
          target_fps: number | null
          target_resolution: string | null
        }
        Relationships: []
      }
      video_enhance_topaz_drift_samples: {
        Row: {
          actual_provider_credits: number | null
          charged_price_eur: number | null
          cost_estimator_version: string | null
          created_at: string | null
          duration_bucket: string | null
          effective_multiple_after_discount: number | null
          estimated_provider_credits: number | null
          interpolation_model: string | null
          mode: string | null
          profitability_class: string | null
          provider_credit_drift_flagged: boolean | null
          provider_credit_drift_pct: number | null
          run_id: string | null
          source_duration_seconds: number | null
          source_fps: number | null
          target_fps: number | null
          target_resolution: string | null
          user_id: string | null
        }
        Insert: {
          actual_provider_credits?: number | null
          charged_price_eur?: number | null
          cost_estimator_version?: string | null
          created_at?: string | null
          duration_bucket?: never
          effective_multiple_after_discount?: number | null
          estimated_provider_credits?: number | null
          interpolation_model?: never
          mode?: string | null
          profitability_class?: string | null
          provider_credit_drift_flagged?: boolean | null
          provider_credit_drift_pct?: number | null
          run_id?: string | null
          source_duration_seconds?: never
          source_fps?: number | null
          target_fps?: number | null
          target_resolution?: string | null
          user_id?: string | null
        }
        Update: {
          actual_provider_credits?: number | null
          charged_price_eur?: number | null
          cost_estimator_version?: string | null
          created_at?: string | null
          duration_bucket?: never
          effective_multiple_after_discount?: number | null
          estimated_provider_credits?: number | null
          interpolation_model?: never
          mode?: string | null
          profitability_class?: string | null
          provider_credit_drift_flagged?: boolean | null
          provider_credit_drift_pct?: number | null
          run_id?: string | null
          source_duration_seconds?: never
          source_fps?: number | null
          target_fps?: number | null
          target_resolution?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_ai_video_credits: {
        Args: {
          p_base_amount: number
          p_bonus_amount: number
          p_bonus_percent: number
          p_currency: string
          p_pack_size: string
          p_stripe_session_id: string
          p_user_id: string
        }
        Returns: number
      }
      archive_composer_scene_to_library: {
        Args: { _scene_id: string }
        Returns: undefined
      }
      break_stale_streaks: { Args: never; Returns: number }
      calculate_template_conversion_rates: {
        Args: { p_date_from: string; p_date_to: string; p_template_id: string }
        Returns: {
          create_rate: number
          publish_rate: number
          selection_rate: number
          total_creates: number
          total_publishes: number
          total_selections: number
          total_views: number
        }[]
      }
      calculate_test_significance: {
        Args: { test_id_param: string }
        Returns: {
          better_variant: string
          is_significant: boolean
          metric_name: string
          p_value: number
          variant_a_id: string
          variant_b_id: string
        }[]
      }
      campaign_ledger_actual_spent: {
        Args: { _approval_id: string }
        Returns: number
      }
      campaign_ledger_entry: {
        Args: {
          _amount: number
          _approval_id: string
          _entry_type: string
          _generation_id: string
          _key: string
          _shot_id: string
        }
        Returns: boolean
      }
      campaign_ledger_outstanding_reserved: {
        Args: { _approval_id: string }
        Returns: number
      }
      can_access_composer_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_edit_composer_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      check_and_increment_rate_limit: {
        Args: {
          p_endpoint: string
          p_identifier: string
          p_max: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          current_count: number
          reset_at: string
        }[]
      }
      claim_agent_tasks: {
        Args: { _limit?: number }
        Returns: {
          approval_id: string | null
          claimed_at: string | null
          conversation_id: string
          created_at: string
          error: string | null
          finished_at: string | null
          generation_id: string
          id: string
          intent: string | null
          language: string | null
          lease_until: string | null
          result: Json | null
          slow_since: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_tasks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_founders_slot: {
        Args: {
          _founders_coupon?: string
          _launch_coupon?: string
          _max_slots?: number
          _stripe_customer_id: string
          _user_id: string
        }
        Returns: {
          coupon_id: string
          is_founder: boolean
          slot_number: number
        }[]
      }
      claim_included_allowance: {
        Args: {
          _job_key: string
          _kind: string
          _limit: number
          _period_end: string
          _period_start: string
          _user_id: string
        }
        Returns: Json
      }
      claim_shot_qa: {
        Args: {
          _lease_minutes?: number
          _limit?: number
          _max_attempts?: number
          _shot_id?: string
        }
        Returns: {
          claim_id: string
          generation_id: string
          shot_id: string
          user_id: string
        }[]
      }
      cleanup_expired_ai_cache: { Args: never; Returns: number }
      cleanup_expired_oauth_states: { Args: never; Returns: undefined }
      cleanup_expired_verification_tokens: { Args: never; Returns: undefined }
      cleanup_inactive_sessions: { Args: never; Returns: undefined }
      cleanup_old_active_publishes: { Args: never; Returns: undefined }
      cleanup_old_ai_jobs: { Args: never; Returns: undefined }
      cleanup_old_alerts: { Args: never; Returns: undefined }
      cleanup_old_rate_limit_states: { Args: never; Returns: undefined }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cleanup_old_user_sessions: { Args: never; Returns: undefined }
      cleanup_stale_active_jobs: { Args: never; Returns: undefined }
      cleanup_superuser_runs: {
        Args: { keep_per_scenario?: number }
        Returns: number
      }
      cleanup_synthetic_probe_runs: { Args: never; Returns: undefined }
      composer_acquire_lipsync_attempt_serialized: {
        Args: {
          _metadata: Json
          _plate_generation: number
          _provider: string
          _run_id: string
          _scene_id: string
          _segment_id: string
          _stage: string
        }
        Returns: {
          attempt_no: number
          job_id: string
          outcome: string
          rs3_outcome: string
          status: string
        }[]
      }
      composer_acquire_pipeline_attempt: {
        Args: {
          p_metadata?: Json
          p_plate_generation: number
          p_provider?: string
          p_run_contract_version?: number
          p_run_id: string
          p_scene_id: string
          p_segment_id?: string
          p_speaker_id?: string
          p_stage: string
        }
        Returns: {
          attempt_no: number
          job_id: string
          outcome: string
          status: string
        }[]
      }
      composer_acquire_reset_rearmed_attempt: {
        Args: {
          _metadata: Json
          _plate_generation: number
          _provider: string
          _run_id: string
          _scene_id: string
          _segment_id: string
          _stage: string
        }
        Returns: {
          attempt_no: number
          job_id: string
          outcome: string
          rs3_outcome: string
          status: string
        }[]
      }
      composer_adopt_sync_callback_binding: {
        Args: {
          _external_job_id: string
          _pipeline_job_id: string
          _scene_id: string
        }
        Returns: Json
      }
      composer_apply_sync_segment_result: {
        Args: {
          _error_text: string
          _external_job_id: string
          _output_url: string
          _pipeline_job_id: string
          _provider_status: string
          _write_id: string
        }
        Returns: Json
      }
      composer_apply_sync_segment_result_core: {
        Args: {
          _error_text: string
          _external_job_id: string
          _output_url: string
          _pipeline_job_id: string
          _provider_status: string
          _write_id: string
        }
        Returns: Json
      }
      composer_bind_plate_attempt: {
        Args: {
          _external_job_id: string
          _pipeline_job_id: string
          _plate_generation: number
          _run_id: string
          _scene_id: string
        }
        Returns: string
      }
      composer_bind_sync_pass_attempt: {
        Args: {
          _external_job_id: string
          _pass_idx: number
          _pipeline_job_id: string
          _scene_id: string
        }
        Returns: string
      }
      composer_fail_callback_scene: {
        Args: {
          _dialog_patch?: Json
          _error_text: string
          _external_job_id: string
          _pipeline_job_id: string
          _write_id: string
        }
        Returns: Json
      }
      composer_fail_hybrid_extend_scene: {
        Args: {
          _error_text: string
          _generation: number
          _run_id: string
          _scene_id: string
          _write_id: string
        }
        Returns: Json
      }
      composer_fail_post_plate_handoff: {
        Args: {
          _error_text: string
          _plate_generation: number
          _run_id: string
          _scene_id: string
          _write_id: string
        }
        Returns: Json
      }
      composer_fail_scene_with_mirrors: {
        Args: {
          _clear_lip_sync_fields?: boolean
          _clip_status?: string
          _error_text: string
          _generation: number
          _lip_sync_status?: string
          _run_id: string
          _scene_id: string
          _substate?: string
          _twoshot_stage?: string
          _write_id: string
        }
        Returns: Json
      }
      composer_finalize_lipsync_scene: {
        Args: {
          _external_job_id: string
          _final_url: string
          _pipeline_job_id: string
          _scene_id: string
          _write_id: string
        }
        Returns: Json
      }
      composer_finalize_plate_scene: {
        Args: {
          _base_url: string
          _clip_source_hint?: string
          _external_job_id: string
          _extra?: Json
          _pipeline_job_id: string
          _write_id: string
        }
        Returns: Json
      }
      composer_finalize_talking_head: {
        Args: {
          _base_url?: string
          _character_audio_url?: string
          _character_image_url?: string
          _character_script?: string
          _character_voice_id?: string
          _error_text?: string
          _generation: number
          _mentioned_character_ids?: string[]
          _mode: string
          _replicate_prediction_id?: string
          _run_id: string
          _scene_id: string
          _talking_head_aspect?: string
          _talking_head_resolution?: string
          _write_id: string
        }
        Returns: Json
      }
      composer_finalize_upload_scene: {
        Args: {
          _generation: number
          _run_id: string
          _scene_id: string
          _upload_url: string
          _write_id: string
        }
        Returns: Json
      }
      composer_log_sync_segment_audit: {
        Args: {
          _applied: boolean
          _detail: Json
          _from_state: Database["public"]["Enums"]["composer_scene_state"]
          _generation: number
          _project_id: string
          _reason: string
          _run_id: string
          _scene_id: string
          _to_state: Database["public"]["Enums"]["composer_scene_state"]
          _write_id: string
        }
        Returns: undefined
      }
      composer_mark_sync_refund_applied: {
        Args: { _amount: number; _scene_id: string }
        Returns: boolean
      }
      composer_pipeline_jobs_g31_deployment_ts: { Args: never; Returns: string }
      composer_reap_cron_tick: {
        Args: { p_older_than_minutes?: number }
        Returns: undefined
      }
      composer_reap_orphaned_dispatches: {
        Args: { p_older_than_minutes?: number }
        Returns: number
      }
      composer_reconcile_terminal_sync_result: {
        Args: {
          _error_text: string
          _external_job_id: string
          _output_url: string
          _pipeline_job_id: string
          _provider_status: string
        }
        Returns: Json
      }
      composer_record_callback_observation: {
        Args: {
          p_details?: Json
          p_external_job_id?: string
          p_handler: string
          p_pipeline_job_id?: string
          p_plate_generation?: number
          p_run_id?: string
          p_scene_id?: string
          p_stage?: string
          p_verdict: string
        }
        Returns: string
      }
      composer_recover_scene: {
        Args: {
          _expected_plate_generation: number
          _expected_run_id: string
          _reason: string
          _scene_id: string
          _to: Database["public"]["Enums"]["composer_scene_state"]
          _write_id: string
        }
        Returns: {
          applied: boolean
          reason: string
          state: Database["public"]["Enums"]["composer_scene_state"]
        }[]
      }
      composer_refund_charge: {
        Args: { p_charge_id: string; p_refund_reason: string; p_run_id: string }
        Returns: Json
      }
      composer_refund_scene_run: {
        Args: {
          p_amount_euros: number
          p_reason?: string
          p_run_id: string
          p_scene_id: string
          p_user_id: string
        }
        Returns: Json
      }
      composer_release_run_reservation: {
        Args: { p_reason?: string; p_reservation_id: string }
        Returns: number
      }
      composer_replace_pipeline_attempt: {
        Args: {
          p_expected_plate_generation: number
          p_expected_run_id: string
          p_expected_scene_id: string
          p_expected_stage: string
          p_metadata?: Json
          p_previous_job_id: string
          p_provider?: string
        }
        Returns: {
          attempt_no: number
          job_id: string
        }[]
      }
      composer_reserve_run_credits: {
        Args: {
          p_amount: number
          p_metadata?: Json
          p_project_id?: string
          p_run_ids?: string[]
          p_scene_ids?: string[]
          p_user_id: string
        }
        Returns: string
      }
      composer_reset_lipsync_full: {
        Args: {
          _expected_generation: number
          _expected_run_id?: string
          _scene_id: string
        }
        Returns: Json
      }
      composer_reset_lipsync_with_attempt_cancellation: {
        Args: {
          _expected_plate_generation: number
          _expected_run_id: string
          _force: boolean
          _scene_id: string
        }
        Returns: Json
      }
      composer_reset_sync_pass_for_watchdog_retry: {
        Args: {
          _expected_external_job_id: string
          _expected_pipeline_job_id: string
          _pass_idx: number
          _pass_patch: Json
          _plate_generation: number
          _run_id: string
          _scene_id: string
        }
        Returns: Json
      }
      composer_retryable_failure_reasons: { Args: never; Returns: string[] }
      composer_rs3_acquire_core: {
        Args: {
          _metadata: Json
          _plate_generation: number
          _provider: string
          _rearm_only: boolean
          _run_id: string
          _scene_id: string
          _segment_id: string
          _stage: string
        }
        Returns: {
          attempt_no: number
          job_id: string
          outcome: string
          rs3_outcome: string
          status: string
        }[]
      }
      composer_rs3_fence_verdict: {
        Args: { _pipeline_job_id: string; _scene_id: string }
        Returns: Json
      }
      composer_rs3_is_pre_reset_attempt: {
        Args: {
          _job_metadata: Json
          _job_plate_generation: number
          _job_run_id: string
          _scene_audio_plan: Json
          _scene_plate_generation: number
          _scene_run_id: string
        }
        Returns: boolean
      }
      composer_rs3_reset_cancellable_statuses: {
        Args: never
        Returns: string[]
      }
      composer_scene_transition:
        | {
            Args: {
              _detail?: string
              _from?: Database["public"]["Enums"]["composer_scene_state"][]
              _generation?: number
              _run_id?: string
              _scene_id: string
              _to: Database["public"]["Enums"]["composer_scene_state"]
            }
            Returns: {
              applied: boolean
              reason: string
              state: Database["public"]["Enums"]["composer_scene_state"]
            }[]
          }
        | {
            Args: {
              _detail?: string
              _from?: Database["public"]["Enums"]["composer_scene_state"][]
              _generation?: number
              _run_id?: string
              _scene_id: string
              _substate?: string
              _to: Database["public"]["Enums"]["composer_scene_state"]
            }
            Returns: {
              applied: boolean
              reason: string
              state: Database["public"]["Enums"]["composer_scene_state"]
            }[]
          }
      composer_scene_transition_core: {
        Args: {
          _caller_class?: string
          _clear_detail?: boolean
          _clear_error?: boolean
          _clear_substate?: boolean
          _detail?: string
          _error_text?: string
          _from?: Database["public"]["Enums"]["composer_scene_state"][]
          _generation: number
          _guard_mode: string
          _run_id: string
          _runless_reason: string
          _scene_id: string
          _source_signature?: string
          _substate?: string
          _to: Database["public"]["Enums"]["composer_scene_state"]
          _write_id: string
        }
        Returns: {
          applied: boolean
          path: Database["public"]["Enums"]["composer_scene_state"][]
          reason: string
          state: Database["public"]["Enums"]["composer_scene_state"]
          substate: string
        }[]
      }
      composer_scene_transition_v2: {
        Args: {
          _clear_detail?: boolean
          _clear_error?: boolean
          _clear_substate?: boolean
          _detail?: string
          _error_text?: string
          _from?: Database["public"]["Enums"]["composer_scene_state"][]
          _generation?: number
          _guard_mode: string
          _run_id?: string
          _runless_reason?: string
          _scene_id: string
          _substate?: string
          _to: Database["public"]["Enums"]["composer_scene_state"]
          _write_id?: string
        }
        Returns: {
          applied: boolean
          path: Database["public"]["Enums"]["composer_scene_state"][]
          reason: string
          state: Database["public"]["Enums"]["composer_scene_state"]
          substate: string
        }[]
      }
      composer_settle_run_reservation: {
        Args: { p_actual: number; p_reservation_id: string }
        Returns: number
      }
      composer_start_scene_run: {
        Args: { _scene_id: string }
        Returns: {
          generation: number
          project_id: string
          run_id: string
        }[]
      }
      composer_state_from_legacy: {
        Args: {
          _active_run_id: string
          _audio_plan: Json
          _clip_status: string
          _clip_url: string
          _lip_sync_status: string
          _plate_generation: number
          _plate_ready_generation: number
          _twoshot_stage: string
        }
        Returns: Database["public"]["Enums"]["composer_scene_state"]
      }
      composer_substate_from_legacy: {
        Args: {
          _clip_status: string
          _clip_url: string
          _lip_sync_status: string
          _plate_generation: number
          _plate_ready_generation: number
          _twoshot_stage: string
        }
        Returns: string
      }
      composer_terminalize_dialog_run: {
        Args: {
          _pass_idx: number
          _pass_patch: Json
          _root_patch: Json
          _run_id: string
          _scene_id: string
          _scene_patch: Json
          _terminal_reason: string
        }
        Returns: Json
      }
      composer_touch_dialog_run_progress: {
        Args: {
          _root_patch: Json
          _run_id: string
          _scene_id: string
          _scene_patch: Json
        }
        Returns: Json
      }
      composer_touch_lipsync_progress: {
        Args: {
          _dialog_shots: Json
          _done: number
          _scene_id: string
          _total: number
        }
        Returns: undefined
      }
      compute_content_hash: {
        Args: {
          p_caption: string
          p_media_urls: string[]
          p_platforms: string[]
        }
        Returns: string
      }
      count_founders_claimed: { Args: never; Returns: number }
      decrement_model_qa_stats: {
        Args: {
          _category: string
          _client_ready: boolean
          _issues: Json
          _mode: string
          _model: string
          _score: number
        }
        Returns: undefined
      }
      deduct_ai_video_credits: {
        Args: { p_amount: number; p_generation_id: string; p_user_id: string }
        Returns: number
      }
      deduct_credits: {
        Args: { p_amount: number; p_user_id: string }
        Returns: {
          new_balance: number
          success: boolean
        }[]
      }
      deduct_text_studio_credits: {
        Args: { p_amount: number; p_conversation_id: string; p_user_id: string }
        Returns: number
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enforce_user_video_library_limits:
        | {
            Args: {
              _max_storage_mb?: number
              _max_videos?: number
              _user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _max_storage_mb?: number
              _max_videos?: number
              _user_id: string
            }
            Returns: undefined
          }
      enforce_video_creations_limit_for_user: {
        Args: { _max_videos?: number; _user_id: string }
        Returns: number
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      fail_shot_qa: {
        Args: {
          _claim_id: string
          _error: string
          _max_attempts?: number
          _shot_id: string
        }
        Returns: string
      }
      finalize_shot_qa: {
        Args: {
          _analysis_source?: string
          _claim_id: string
          _client_ready: boolean
          _issues: Json
          _overall: number
          _scores: Json
          _shot_id: string
          _verdict: string
        }
        Returns: boolean
      }
      founder_status_details: {
        Args: { _user_id: string }
        Returns: {
          claimed_at: string
          expires_at: string
          is_active: boolean
          revoked_at: string
          revoked_reason: string
        }[]
      }
      get_ai_discount_factor: { Args: { p_user_id: string }; Returns: number }
      get_ai_superuser_id: { Args: never; Returns: string }
      get_conversion_funnel: { Args: { days?: number }; Returns: Json }
      get_shared_brand_kit: {
        Args: { p_token: string }
        Returns: {
          accent_color: string
          brand_name: string
          brand_tone: string
          brand_values: Json
          color_palette: Json
          id: string
          primary_color: string
          secondary_color: string
          target_audience: string
        }[]
      }
      get_template_performance_summary: {
        Args: { p_days?: number; p_template_id: string }
        Returns: {
          avg_rating: number
          conversion_rate: number
          publish_rate: number
          selection_rate: number
          template_id: string
          total_projects: number
          total_publishes: number
          total_ratings: number
          total_selections: number
          total_views: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      get_workspace_role: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: Database["public"]["Enums"]["team_role"]
      }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
              _workspace_id: string
            }
            Returns: boolean
          }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["team_role"]
          _user_id: string
          _workspace_id: string
        }
        Returns: boolean
      }
      increment_balance: {
        Args: { p_amount: number; p_user_id: string }
        Returns: number
      }
      increment_daily_metric: {
        Args: {
          p_amount?: number
          p_date: string
          p_metric: string
          p_user_id: string
        }
        Returns: undefined
      }
      increment_feature_usage: {
        Args: { p_feature_key: string; p_user_id: string }
        Returns: number
      }
      increment_model_qa_stats: {
        Args: {
          _category: string
          _client_ready: boolean
          _issues: Json
          _mode: string
          _model: string
          _score: number
        }
        Returns: undefined
      }
      increment_template_usage: {
        Args: { template_id: string }
        Returns: undefined
      }
      increment_trending_template_use: {
        Args: { p_template_id: string }
        Returns: number
      }
      increment_usage: {
        Args: { date_param: string; user_id_param: string }
        Returns: number
      }
      invalidate_shot_qa: {
        Args: { _generation_id: string; _reason: string; _shot_id: string }
        Returns: boolean
      }
      is_active_founder: { Args: { _user_id: string }; Returns: boolean }
      is_founder_active: { Args: { _user_id: string }; Returns: boolean }
      is_workspace_admin: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_member_func: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      is_workspace_owner: {
        Args: { _user_id: string; _workspace_id: string }
        Returns: boolean
      }
      lipsync_watchdog_15min: { Args: never; Returns: undefined }
      match_ai_cache: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
          query_endpoint: string
          query_language?: string
        }
        Returns: {
          hit_count: number
          id: string
          response_data: Json
          similarity: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      owns_composer_project: { Args: { _project_id: string }; Returns: boolean }
      propagate_continuity_staleness: {
        Args: { _effective_url: string; _scene_id: string }
        Returns: number
      }
      purchase_character: {
        Args: {
          _character_id: string
          _license_ip_hash?: string
          _license_version: string
        }
        Returns: Json
      }
      purchase_template: { Args: { _template_id: string }; Returns: Json }
      qa_check_budget: {
        Args: { _amount_cents: number; _category: string }
        Returns: boolean
      }
      qa_record_spend: {
        Args: { _amount_cents: number; _category: string }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_streak_activity: {
        Args: { p_user_id: string }
        Returns: {
          current_streak: number
          freeze_tokens: number
          longest_streak: number
          milestone_reached: number
        }[]
      }
      refresh_streak_freeze_tokens: { Args: never; Returns: number }
      refund_ai_video_credits: {
        Args: {
          p_amount_euros: number
          p_generation_id: string
          p_refund_key?: string
          p_user_id: string
        }
        Returns: number
      }
      refund_text_studio_credits: {
        Args: { p_amount: number; p_conversation_id: string; p_user_id: string }
        Returns: number
      }
      release_dialog_lock: {
        Args: { _holder: string; _pass_idx?: number; _scene_id: string }
        Returns: undefined
      }
      release_included_allowance: {
        Args: { _job_key: string; _kind: string; _user_id: string }
        Returns: boolean
      }
      render_queue_running_workers: { Args: never; Returns: number }
      render_queue_stats: {
        Args: never
        Returns: {
          founder_queued: number
          queued_count: number
          slots_used: number
        }[]
      }
      replace_composer_scene_with_children: {
        Args: {
          p_children: Json
          p_parent_scene_id: string
          p_remove_parent?: boolean
        }
        Returns: string[]
      }
      reserve_campaign_spend: {
        Args: {
          _amount: number
          _approval_id: string
          _key: string
          _shot_id: string
        }
        Returns: boolean
      }
      reset_monthly_credits: { Args: never; Returns: undefined }
      revoke_founder_status: {
        Args: { _reason: string; _user_id: string }
        Returns: boolean
      }
      scene_lipsync_intentional: {
        Args: {
          _dialog_mode: boolean
          _engine_override: string
          _lip_sync_with_voiceover: boolean
        }
        Returns: boolean
      }
      scene_output_is_final: {
        Args: {
          _clip_url: string
          _dialog_mode: boolean
          _engine_override: string
          _lip_sync_with_voiceover: boolean
          _processed_video_url: string
        }
        Returns: boolean
      }
      seed_ai_superuser_demo_data: {
        Args: { _user_id: string }
        Returns: undefined
      }
      set_shot_analysis_copy: {
        Args: { _copy_url: string; _generation_id: string; _shot_id: string }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      staff_wallet_topup: { Args: never; Returns: number }
      stripe_revoke_ai_video_credits_for_refund: {
        Args: {
          p_charge_amount_minor: number
          p_refund_amount_minor: number
          p_refund_id: string
          p_stripe_session_id: string
        }
        Returns: Json
      }
      syncso_recent_failure_count: {
        Args: { _window_min?: number }
        Returns: number
      }
      tmp_storage_migration_counts: {
        Args: never
        Returns: {
          bucket_id: string
          bytes: number
          objects: number
        }[]
      }
      tmp_storage_migration_list: {
        Args: { _after: string; _bucket: string; _limit: number }
        Returns: {
          cache_control: string
          mimetype: string
          name: string
          size: number
        }[]
      }
      try_acquire_dialog_lock: {
        Args: {
          _holder: string
          _pass_idx?: number
          _scene_id: string
          _ttl_seconds?: number
        }
        Returns: boolean
      }
      try_claim_mux_dispatch: { Args: { _scene_id: string }; Returns: boolean }
      update_asset_reference_image: {
        Args: {
          p_asset_id: string
          p_kind: string
          p_storage_path?: string
          p_url: string
        }
        Returns: undefined
      }
      update_dialog_pass_slot: {
        Args: { _pass_idx: number; _patch: Json; _scene_id: string }
        Returns: Json
      }
      update_dialog_shots_root_merge: {
        Args: { _patch: Json; _scene_id: string }
        Returns: Json
      }
      user_owns_comment: { Args: { _comment_id: string }; Returns: boolean }
      v459_deduct_ai_video_credits: {
        Args: {
          p_amount: number
          p_generation_id: string
          p_metadata?: Json
          p_user_id: string
        }
        Returns: Json
      }
      v459_refund_lipsync_euros: {
        Args: {
          p_reason?: string
          p_run_id?: string
          p_scene_id: string
          p_source_transaction_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      verify_license_certificate: {
        Args: { _token: string }
        Returns: {
          asset_thumbnail_url: string
          asset_title: string
          asset_type: string
          attribution_required: boolean
          certificate_number: string
          issued_at: string
          license_tier: string
          licensee_initials: string
          permitted_uses: string[]
          provider_license_name: string
          provider_license_url: string
          restrictions: string[]
          revoked_at: string
          source_provider: string
        }[]
      }
      video_enhance_claim_persist_run: {
        Args: {
          p_lease_seconds?: number
          p_max_global?: number
          p_max_per_user?: number
          p_worker: string
        }
        Returns: {
          account_discount_percent: number
          actual_contribution_eur: number | null
          actual_height: number | null
          actual_margin_pct: number | null
          actual_provider_credits: number | null
          actual_units: number | null
          actual_width: number | null
          calibration_reason: string | null
          calibration_status: string
          callback_token: string
          cancel_requested_at: string | null
          charged_price_eur: number | null
          contribution_eur: number | null
          cost_closed_at: string | null
          cost_closed_by: string | null
          cost_closure_reason: string | null
          cost_drift_ratio: number | null
          cost_estimator_version: string | null
          cost_uncertainty_buffer: number
          created_at: string
          credits_reserved: number
          currency: string
          delivery_strategy: string | null
          destination_object_path: string | null
          effective_multiple_after_discount: number | null
          effective_multiplier: number | null
          error_code: string | null
          error_message: string | null
          estimated_provider_credits: number | null
          estimated_units: number | null
          executing_topaz_model: string | null
          expected_content_length: number | null
          expected_content_type: string | null
          failure_stage: string | null
          fps: number
          fx_rate_used: number
          fx_safety_buffer_used: number
          id: string
          idempotency_key: string
          interpolation_model: string | null
          last_reconciled_at: string | null
          late_cost_attempts: number
          margin_pct: number | null
          mode: string
          model_id: string
          multiplier_band_max: number | null
          multiplier_band_min: number | null
          multiplier_cap: number | null
          multiplier_used: number | null
          net_revenue_eur: number | null
          next_late_check_at: string | null
          next_persist_at: string | null
          next_provider_poll_at: string | null
          next_reconcile_at: string | null
          output_asset_id: string | null
          output_bitrate_kbps: number | null
          output_codec: string | null
          output_container: string | null
          output_duration_seconds: number | null
          output_fps: number | null
          output_mime_type: string | null
          output_size_bytes: number | null
          output_url: string | null
          overcharge_refund_amount_eur: number | null
          overcharge_refund_at: string | null
          persist_attempts: number
          persist_last_error: string | null
          persist_lease_owner: string | null
          persist_lease_until: string | null
          pricing_gate: string | null
          pricing_gate_reason: string | null
          pricing_version: string
          processing_seconds: number | null
          profitability_class: string | null
          projected_height: number | null
          projected_width: number | null
          projection_confidence: string | null
          projection_matched: boolean | null
          projection_strategy: string | null
          provider_completed_at: string | null
          provider_cost_eur_buffered: number
          provider_cost_source: string
          provider_cost_usd_actual: number | null
          provider_cost_usd_estimated: number
          provider_credit_drift_flagged: boolean
          provider_credit_drift_pct: number | null
          provider_output_expires_at: string | null
          provider_output_url: string | null
          provider_prediction_id: string | null
          provider_pricing_version: string
          provider_retry_count: number
          provider_status: string | null
          provider_submitted_at: string | null
          rate_card_version: string
          reconciliation_attempts: number
          requested_model_id: string | null
          requested_output_quality: string | null
          resolution: string
          resumable_upload_expires_at: string | null
          resumable_upload_offset: number
          resumable_upload_url: string | null
          source_asset_id: string | null
          source_container: string | null
          source_duration_seconds: number
          source_fps: number
          source_height: number
          source_model: string | null
          source_size_bytes: number | null
          source_url: string
          source_width: number
          staging_key: string | null
          status: string
          submit_lease_expires_at: string | null
          submit_lease_owner: string | null
          subsidy_eur: number
          target_height: number | null
          target_width: number | null
          test_fail_persist_once: boolean
          tier: string
          unit_rate_checked_at: string | null
          unit_rate_source: string | null
          unit_rate_usd: number | null
          updated_at: string
          user_id: string
          user_price_eur: number
          verified_effective_multiplier: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "video_enhance_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      video_model_runtime_stats: {
        Args: never
        Returns: {
          model: string
          p50_seconds: number
          p90_seconds: number
          sample_size: number
        }[]
      }
      voice_library_facets: {
        Args: { _language?: string; _native_only?: boolean; _search?: string }
        Returns: Json
      }
    }
    Enums: {
      app_event_type:
        | "caption.created"
        | "caption.rewritten"
        | "hook.generated"
        | "reel.script.created"
        | "calendar.post.scheduled"
        | "calendar.post.published"
        | "comment.imported"
        | "comment.replied"
        | "faq.updated"
        | "performance.synced"
        | "trend.bookmarked"
        | "goal.created"
        | "goal.progress.updated"
        | "goal.completed"
        | "brandkit.created"
        | "post.generated"
        | "background.generated"
        | "carousel.created"
        | "bio.generated"
        | "audit.completed"
        | "campaign.created"
        | "performance.account.disconnected"
        | "performance.csv.uploaded"
        | "performance.insights.generated"
        | "edge_fn.call"
        | "edge_fn.error"
        | "edge_fn.timeout"
      app_role: "owner" | "admin" | "editor" | "viewer"
      approval_status:
        | "draft"
        | "pending_review"
        | "approved"
        | "rejected"
        | "published"
      calendar_event_status:
        | "briefing"
        | "in_progress"
        | "review"
        | "pending_approval"
        | "approved"
        | "scheduled"
        | "published"
        | "cancelled"
        | "failed"
        | "queued"
        | "expired"
      calendar_role:
        | "owner"
        | "account_manager"
        | "editor"
        | "approver"
        | "viewer"
      calendar_view_type: "month" | "week" | "list" | "kanban" | "timeline"
      composer_scene_state:
        | "idle"
        | "plate_queued"
        | "plate_rendering"
        | "plate_ready"
        | "audio_prep"
        | "audio_ready"
        | "lipsync_dispatched"
        | "lipsync_running"
        | "lipsync_muxing"
        | "complete"
        | "failed"
        | "canceled"
      goal_status: "active" | "completed" | "paused" | "failed"
      goal_type:
        | "followers"
        | "posts_per_month"
        | "engagement_rate"
        | "content_created"
        | "revenue"
      ig_media_type: "IMAGE" | "VIDEO" | "REEL" | "CAROUSEL_ALBUM"
      invitation_status: "pending" | "accepted" | "declined" | "expired"
      notification_type: "low_balance" | "paused" | "threshold_hit"
      post_status: "draft" | "scheduled" | "posted"
      remotion_component_type:
        | "ProductAd"
        | "InstagramStory"
        | "TikTokReel"
        | "Testimonial"
        | "Tutorial"
        | "UniversalVideo"
      subscription_status: "active" | "paused" | "canceled"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status: "todo" | "in_progress" | "review" | "done"
      team_role: "owner" | "admin" | "editor" | "viewer"
      template_category:
        | "social_media"
        | "advertising"
        | "explainer"
        | "tutorial"
        | "testimonial"
        | "product_showcase"
        | "event"
        | "educational"
        | "entertainment"
        | "other"
      transaction_reason:
        | "monthly_topup"
        | "addon"
        | "debit"
        | "refund"
        | "adjustment"
        | "overage"
      usage_status: "success" | "failed" | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_event_type: [
        "caption.created",
        "caption.rewritten",
        "hook.generated",
        "reel.script.created",
        "calendar.post.scheduled",
        "calendar.post.published",
        "comment.imported",
        "comment.replied",
        "faq.updated",
        "performance.synced",
        "trend.bookmarked",
        "goal.created",
        "goal.progress.updated",
        "goal.completed",
        "brandkit.created",
        "post.generated",
        "background.generated",
        "carousel.created",
        "bio.generated",
        "audit.completed",
        "campaign.created",
        "performance.account.disconnected",
        "performance.csv.uploaded",
        "performance.insights.generated",
        "edge_fn.call",
        "edge_fn.error",
        "edge_fn.timeout",
      ],
      app_role: ["owner", "admin", "editor", "viewer"],
      approval_status: [
        "draft",
        "pending_review",
        "approved",
        "rejected",
        "published",
      ],
      calendar_event_status: [
        "briefing",
        "in_progress",
        "review",
        "pending_approval",
        "approved",
        "scheduled",
        "published",
        "cancelled",
        "failed",
        "queued",
        "expired",
      ],
      calendar_role: [
        "owner",
        "account_manager",
        "editor",
        "approver",
        "viewer",
      ],
      calendar_view_type: ["month", "week", "list", "kanban", "timeline"],
      composer_scene_state: [
        "idle",
        "plate_queued",
        "plate_rendering",
        "plate_ready",
        "audio_prep",
        "audio_ready",
        "lipsync_dispatched",
        "lipsync_running",
        "lipsync_muxing",
        "complete",
        "failed",
        "canceled",
      ],
      goal_status: ["active", "completed", "paused", "failed"],
      goal_type: [
        "followers",
        "posts_per_month",
        "engagement_rate",
        "content_created",
        "revenue",
      ],
      ig_media_type: ["IMAGE", "VIDEO", "REEL", "CAROUSEL_ALBUM"],
      invitation_status: ["pending", "accepted", "declined", "expired"],
      notification_type: ["low_balance", "paused", "threshold_hit"],
      post_status: ["draft", "scheduled", "posted"],
      remotion_component_type: [
        "ProductAd",
        "InstagramStory",
        "TikTokReel",
        "Testimonial",
        "Tutorial",
        "UniversalVideo",
      ],
      subscription_status: ["active", "paused", "canceled"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: ["todo", "in_progress", "review", "done"],
      team_role: ["owner", "admin", "editor", "viewer"],
      template_category: [
        "social_media",
        "advertising",
        "explainer",
        "tutorial",
        "testimonial",
        "product_showcase",
        "event",
        "educational",
        "entertainment",
        "other",
      ],
      transaction_reason: [
        "monthly_topup",
        "addon",
        "debit",
        "refund",
        "adjustment",
        "overage",
      ],
      usage_status: ["success", "failed", "canceled"],
    },
  },
} as const
