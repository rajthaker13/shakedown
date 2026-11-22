export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          hash: string
          id: string
          last_used_at: string | null
          name: string
          prefix: string
          project_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hash: string
          id?: string
          last_used_at?: string | null
          name: string
          prefix: string
          project_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hash?: string
          id?: string
          last_used_at?: string | null
          name?: string
          prefix?: string
          project_id?: string
          revoked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          condition_id: string
          contacts: Json
          duration_s: number | null
          error: string | null
          failure_label: string | null
          first_divergence_step: number | null
          id: string
          max_reward: number
          nominal_success: boolean | null
          project_id: string
          run_id: string
          seed: number
          steps: number
          success: boolean
          trace_path: string | null
          video_path: string | null
        }
        Insert: {
          condition_id: string
          contacts?: Json
          duration_s?: number | null
          error?: string | null
          failure_label?: string | null
          first_divergence_step?: number | null
          id?: string
          max_reward?: number
          nominal_success?: boolean | null
          project_id: string
          run_id: string
          seed: number
          steps: number
          success: boolean
          trace_path?: string | null
          video_path?: string | null
        }
        Update: {
          condition_id?: string
          contacts?: Json
          duration_s?: number | null
          error?: string | null
          failure_label?: string | null
          first_divergence_step?: number | null
          id?: string
          max_reward?: number
          nominal_success?: boolean | null
          project_id?: string
          run_id?: string
          seed?: number
          steps?: number
          success?: boolean
          trace_path?: string | null
          video_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "episodes_condition_id_fkey"
            columns: ["condition_id"]
            isOneToOne: false
            referencedRelation: "run_conditions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episodes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      field_episodes: {
        Row: {
          created_at: string
          duration_s: number | null
          external_id: string
          id: string
          intervention: boolean
          intervention_reason: string
          measured: Json
          note: string
          policy_label: string
          project_id: string
          release_id: string | null
          robot: string
          simulated: boolean
          site: string
          started_at: string
          steps: number | null
          success: boolean
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          external_id: string
          id?: string
          intervention?: boolean
          intervention_reason?: string
          measured?: Json
          note?: string
          policy_label: string
          project_id: string
          release_id?: string | null
          robot?: string
          simulated?: boolean
          site?: string
          started_at?: string
          steps?: number | null
          success: boolean
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          external_id?: string
          id?: string
          intervention?: boolean
          intervention_reason?: string
          measured?: Json
          note?: string
          policy_label?: string
          project_id?: string
          release_id?: string | null
          robot?: string
          simulated?: boolean
          site?: string
          started_at?: string
          steps?: number | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "field_episodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_episodes_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      hosted_jobs: {
        Row: {
          conditions: number
          created_at: string
          episodes: number
          error: string | null
          finished_at: string | null
          id: string
          ingested: string[]
          label: string
          policy: string
          project_id: string
          requested_by: string | null
          state: Database["public"]["Enums"]["job_state"]
          suite: string
        }
        Insert: {
          conditions?: number
          created_at?: string
          episodes: number
          error?: string | null
          finished_at?: string | null
          id?: string
          ingested?: string[]
          label: string
          policy: string
          project_id: string
          requested_by?: string | null
          state?: Database["public"]["Enums"]["job_state"]
          suite: string
        }
        Update: {
          conditions?: number
          created_at?: string
          episodes?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          ingested?: string[]
          label?: string
          policy?: string
          project_id?: string
          requested_by?: string | null
          state?: Database["public"]["Enums"]["job_state"]
          suite?: string
        }
        Relationships: [
          {
            foreignKeyName: "hosted_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          source: string
        }
        Insert: {
          company?: string
          created_at?: string
          email: string
          id?: string
          message?: string
          name?: string
          source?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          source?: string
        }
        Relationships: []
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          default_branch: string
          description: string
          id: string
          is_public: boolean
          name: string
          org_id: string
          repo_url: string | null
          settings: Json
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_branch?: string
          description?: string
          id?: string
          is_public?: boolean
          name: string
          org_id: string
          repo_url?: string | null
          settings?: Json
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_branch?: string
          description?: string
          id?: string
          is_public?: boolean
          name?: string
          org_id?: string
          repo_url?: string | null
          settings?: Json
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      real_trials: {
        Row: {
          condition_key: string
          created_at: string
          id: string
          notes: string
          operator: string
          policy_label: string
          project_id: string
          recorded_at: string
          robot: string
          success: boolean
          suite: string
          trial: number
        }
        Insert: {
          condition_key: string
          created_at?: string
          id?: string
          notes?: string
          operator?: string
          policy_label: string
          project_id: string
          recorded_at?: string
          robot?: string
          success: boolean
          suite: string
          trial: number
        }
        Update: {
          condition_key?: string
          created_at?: string
          id?: string
          notes?: string
          operator?: string
          policy_label?: string
          project_id?: string
          recorded_at?: string
          robot?: string
          success?: boolean
          suite?: string
          trial?: number
        }
        Relationships: [
          {
            foreignKeyName: "real_trials_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      release_events: {
        Row: {
          actor: string | null
          created_at: string
          from_stage: Database["public"]["Enums"]["release_stage"] | null
          gate: Json
          id: string
          overridden: boolean
          project_id: string
          reason: string
          release_id: string
          to_stage: Database["public"]["Enums"]["release_stage"]
        }
        Insert: {
          actor?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["release_stage"] | null
          gate?: Json
          id?: string
          overridden?: boolean
          project_id: string
          reason?: string
          release_id: string
          to_stage: Database["public"]["Enums"]["release_stage"]
        }
        Update: {
          actor?: string | null
          created_at?: string
          from_stage?: Database["public"]["Enums"]["release_stage"] | null
          gate?: Json
          id?: string
          overridden?: boolean
          project_id?: string
          reason?: string
          release_id?: string
          to_stage?: Database["public"]["Enums"]["release_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "release_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "release_events_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string
          number: number
          policy_label: string
          policy_spec: string
          project_id: string
          run_id: string | null
          runtime_config: Json
          stage: Database["public"]["Enums"]["release_stage"]
          stage_changed_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          number?: number
          policy_label: string
          policy_spec?: string
          project_id: string
          run_id?: string | null
          runtime_config?: Json
          stage?: Database["public"]["Enums"]["release_stage"]
          stage_changed_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string
          number?: number
          policy_label?: string
          policy_spec?: string
          project_id?: string
          run_id?: string | null
          runtime_config?: Json
          stage?: Database["public"]["Enums"]["release_stage"]
          stage_changed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      run_conditions: {
        Row: {
          backend: string
          checks: Json
          ci_high: number
          ci_low: number
          comparison: Json | null
          contacts: Json
          created_at: string
          description: string
          duration_s: number | null
          env: string
          episodes: number
          error: string | null
          failure_labels: Json
          fingerprint: string
          id: string
          key: string
          label: string
          mean_steps_success: number | null
          outcomes: Json
          perturbation_summary: string[]
          perturbations: Json
          position: number
          project_id: string
          run_id: string
          scenario: string
          scenario_source: string
          success_rate: number
          successes: number
          sweep_name: string | null
          sweep_value: string | null
          tags: string[]
          verdict: Database["public"]["Enums"]["verdict"]
        }
        Insert: {
          backend?: string
          checks?: Json
          ci_high: number
          ci_low: number
          comparison?: Json | null
          contacts?: Json
          created_at?: string
          description?: string
          duration_s?: number | null
          env: string
          episodes: number
          error?: string | null
          failure_labels?: Json
          fingerprint: string
          id?: string
          key: string
          label: string
          mean_steps_success?: number | null
          outcomes?: Json
          perturbation_summary?: string[]
          perturbations?: Json
          position?: number
          project_id: string
          run_id: string
          scenario: string
          scenario_source?: string
          success_rate: number
          successes: number
          sweep_name?: string | null
          sweep_value?: string | null
          tags?: string[]
          verdict: Database["public"]["Enums"]["verdict"]
        }
        Update: {
          backend?: string
          checks?: Json
          ci_high?: number
          ci_low?: number
          comparison?: Json | null
          contacts?: Json
          created_at?: string
          description?: string
          duration_s?: number | null
          env?: string
          episodes?: number
          error?: string | null
          failure_labels?: Json
          fingerprint?: string
          id?: string
          key?: string
          label?: string
          mean_steps_success?: number | null
          outcomes?: Json
          perturbation_summary?: string[]
          perturbations?: Json
          position?: number
          project_id?: string
          run_id?: string
          scenario?: string
          scenario_source?: string
          success_rate?: number
          successes?: number
          sweep_name?: string | null
          sweep_value?: string | null
          tags?: string[]
          verdict?: Database["public"]["Enums"]["verdict"]
        }
        Relationships: [
          {
            foreignKeyName: "run_conditions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "run_conditions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          baseline_label: string | null
          baseline_run_id: string | null
          created_at: string
          duration_s: number | null
          engine_version: string | null
          finished_at: string | null
          git_branch: string | null
          git_dirty: boolean | null
          git_message: string | null
          git_sha: string | null
          host: Json
          id: string
          number: number
          planned: Json
          policy_info: Json
          policy_label: string
          policy_spec: string
          project_id: string
          pull_request: number | null
          repository: string | null
          started_at: string
          status: Database["public"]["Enums"]["run_status"]
          suite: string
          summary: Json
          verdict: Database["public"]["Enums"]["verdict"] | null
        }
        Insert: {
          baseline_label?: string | null
          baseline_run_id?: string | null
          created_at?: string
          duration_s?: number | null
          engine_version?: string | null
          finished_at?: string | null
          git_branch?: string | null
          git_dirty?: boolean | null
          git_message?: string | null
          git_sha?: string | null
          host?: Json
          id?: string
          number?: number
          planned?: Json
          policy_info?: Json
          policy_label: string
          policy_spec?: string
          project_id: string
          pull_request?: number | null
          repository?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          suite: string
          summary?: Json
          verdict?: Database["public"]["Enums"]["verdict"] | null
        }
        Update: {
          baseline_label?: string | null
          baseline_run_id?: string | null
          created_at?: string
          duration_s?: number | null
          engine_version?: string | null
          finished_at?: string | null
          git_branch?: string | null
          git_dirty?: boolean | null
          git_message?: string | null
          git_sha?: string | null
          host?: Json
          id?: string
          number?: number
          planned?: Json
          policy_info?: Json
          policy_label?: string
          policy_spec?: string
          project_id?: string
          pull_request?: number | null
          repository?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["run_status"]
          suite?: string
          summary?: Json
          verdict?: Database["public"]["Enums"]["verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_baseline_run_id_fkey"
            columns: ["baseline_run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scenario_suggestions: {
        Row: {
          created_at: string
          evidence: Json
          fingerprint: string
          id: string
          project_id: string
          rationale: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["suggestion_status"]
          title: string
          yaml: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          fingerprint: string
          id?: string
          project_id: string
          rationale: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          title: string
          yaml: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          project_id?: string
          rationale?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["suggestion_status"]
          title?: string
          yaml?: string
        }
        Relationships: [
          {
            foreignKeyName: "scenario_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_project: { Args: { target_project: string }; Returns: boolean }
      can_write_project: { Args: { target_project: string }; Returns: boolean }
      hit_rate_limit: {
        Args: {
          max_hits: number
          target_bucket: string
          window_seconds: number
        }
        Returns: boolean
      }
      is_org_admin: { Args: { target_org: string }; Returns: boolean }
      is_org_member: { Args: { target_org: string }; Returns: boolean }
    }
    Enums: {
      job_state: "queued" | "running" | "completed" | "failed"
      member_role: "owner" | "admin" | "member"
      release_stage:
        | "candidate"
        | "canary"
        | "fleet"
        | "retired"
        | "rolled_back"
      run_status: "running" | "completed" | "failed" | "cancelled"
      suggestion_status: "open" | "accepted" | "dismissed"
      verdict: "PASS" | "WARN" | "FAIL" | "SKIP" | "ERROR"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      job_state: ["queued", "running", "completed", "failed"],
      member_role: ["owner", "admin", "member"],
      release_stage: ["candidate", "canary", "fleet", "retired", "rolled_back"],
      run_status: ["running", "completed", "failed", "cancelled"],
      suggestion_status: ["open", "accepted", "dismissed"],
      verdict: ["PASS", "WARN", "FAIL", "SKIP", "ERROR"],
    },
  },
} as const

