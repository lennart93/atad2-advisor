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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      atad2_answers: {
        Row: {
          answer: string
          answered_at: string
          created_at: string
          difficult_term: string | null
          explanation: string
          id: string
          question_id: string
          question_text: string
          risk_points: number
          session_id: string
          term_explanation: string | null
        }
        Insert: {
          answer: string
          answered_at?: string
          created_at?: string
          difficult_term?: string | null
          explanation: string
          id?: string
          question_id: string
          question_text: string
          risk_points?: number
          session_id: string
          term_explanation?: string | null
        }
        Update: {
          answer?: string
          answered_at?: string
          created_at?: string
          difficult_term?: string | null
          explanation?: string
          id?: string
          question_id?: string
          question_text?: string
          risk_points?: number
          session_id?: string
          term_explanation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atad2_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "fk_atad2_answers_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_context_questions: {
        Row: {
          answer_trigger: string
          context_question: string
          created_at: string | null
          id: string
          question_id: string
        }
        Insert: {
          answer_trigger: string
          context_question: string
          created_at?: string | null
          id?: string
          question_id: string
        }
        Update: {
          answer_trigger?: string
          context_question?: string
          created_at?: string | null
          id?: string
          question_id?: string
        }
        Relationships: []
      }
      // Manually added — no Supabase CLI available for self-hosted VM (feat/document-prefill)
      atad2_document_summaries: {
        Row: {
          created_at: string
          document_id: string
          id: string
          prompt_version: number
          summary_json: Json
          token_usage: Json
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          prompt_version: number
          summary_json: Json
          token_usage: Json
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          prompt_version?: number
          summary_json?: Json
          token_usage?: Json
        }
        Relationships: [
          {
            foreignKeyName: "atad2_document_summaries_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "atad2_session_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_prefill_jobs: {
        Row: {
          created_at: string
          error_message: string | null
          failed_at: string | null
          id: string
          locked_at: string | null
          session_id: string
          stage1_finished_at: string | null
          stage1_prompt_version: number | null
          stage2_finished_at: string | null
          stage2_prompt_version: number | null
          started_at: string | null
          status: string
          total_token_usage: Json | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          session_id: string
          stage1_finished_at?: string | null
          stage1_prompt_version?: number | null
          stage2_finished_at?: string | null
          stage2_prompt_version?: number | null
          started_at?: string | null
          status?: string
          total_token_usage?: Json | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          failed_at?: string | null
          id?: string
          locked_at?: string | null
          session_id?: string
          stage1_finished_at?: string | null
          stage1_prompt_version?: number | null
          stage2_finished_at?: string | null
          stage2_prompt_version?: number | null
          started_at?: string | null
          status?: string
          total_token_usage?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "atad2_prefill_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_prompts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          key: string
          max_tokens: number
          model: string
          notes: string | null
          system_prompt: string
          temperature: number
          user_prompt_template: string | null
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key: string
          max_tokens: number
          model?: string
          notes?: string | null
          system_prompt: string
          temperature?: number
          user_prompt_template?: string | null
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          key?: string
          max_tokens?: number
          model?: string
          notes?: string | null
          system_prompt?: string
          temperature?: number
          user_prompt_template?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "atad2_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_question_prefills: {
        Row: {
          actioned_at: string | null
          created_at: string
          id: string
          question_id: string
          session_id: string
          source_refs: Json
          suggested_toelichting: string
          user_action: string
          verbatim_quote: string | null
        }
        Insert: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id: string
          session_id: string
          source_refs: Json
          suggested_toelichting: string
          user_action?: string
          verbatim_quote?: string | null
        }
        Update: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id?: string
          session_id?: string
          source_refs?: Json
          suggested_toelichting?: string
          user_action?: string
          verbatim_quote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atad2_question_prefills_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_questions: {
        Row: {
          answer_option: string
          created_at: string
          difficult_term: string | null
          id: string
          next_question_id: string | null
          question: string
          question_explanation: string | null
          question_id: string
          question_title: string | null
          requires_explanation: boolean
          risk_points: number
          term_explanation: string | null
          updated_at: string
        }
        Insert: {
          answer_option: string
          created_at?: string
          difficult_term?: string | null
          id?: string
          next_question_id?: string | null
          question: string
          question_explanation?: string | null
          question_id: string
          question_title?: string | null
          requires_explanation?: boolean
          risk_points?: number
          term_explanation?: string | null
          updated_at?: string
        }
        Update: {
          answer_option?: string
          created_at?: string
          difficult_term?: string | null
          id?: string
          next_question_id?: string | null
          question?: string
          question_explanation?: string | null
          question_id?: string
          question_title?: string | null
          requires_explanation?: boolean
          risk_points?: number
          term_explanation?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      atad2_session_documents: {
        Row: {
          category: string
          created_at: string
          doc_label: string
          error_message: string | null
          filename: string
          id: string
          mime_type: string
          session_id: string
          size_bytes: number
          status: string
          storage_path: string
        }
        Insert: {
          category: string
          created_at?: string
          doc_label: string
          error_message?: string | null
          filename: string
          id?: string
          mime_type: string
          session_id: string
          size_bytes: number
          status?: string
          storage_path: string
        }
        Update: {
          category?: string
          created_at?: string
          doc_label?: string
          error_message?: string | null
          filename?: string
          id?: string
          mime_type?: string
          session_id?: string
          size_bytes?: number
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_reports: {
        Row: {
          answers_count: number | null
          generated_at: string
          id: string
          model: string | null
          report_json: Json | null
          report_md: string
          report_title: string | null
          risk_category: string | null
          session_id: string
          total_risk: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          answers_count?: number | null
          generated_at?: string
          id?: string
          model?: string | null
          report_json?: Json | null
          report_md: string
          report_title?: string | null
          risk_category?: string | null
          session_id: string
          total_risk?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          answers_count?: number | null
          generated_at?: string
          id?: string
          model?: string | null
          report_json?: Json | null
          report_md?: string
          report_title?: string | null
          risk_category?: string | null
          session_id?: string
          total_risk?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_atad2_reports_session"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_sessions: {
        Row: {
          additional_context: string | null
          completed: boolean | null
          confirmed_at: string | null
          created_at: string
          date_filled: string
          docx_downloaded_at: string | null
          entity_name: string | null
          final_score: number | null
          fiscal_year: string
          id: string
          is_custom_period: boolean
          outcome_confirmed: boolean | null
          outcome_overridden: boolean | null
          override_outcome: string | null
          override_reason: string | null
          period_end_date: string | null
          period_start_date: string | null
          preliminary_outcome: string | null
          session_id: string
          status: string
          taxpayer_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          additional_context?: string | null
          completed?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          date_filled?: string
          docx_downloaded_at?: string | null
          entity_name?: string | null
          final_score?: number | null
          fiscal_year: string
          id?: string
          is_custom_period?: boolean
          outcome_confirmed?: boolean | null
          outcome_overridden?: boolean | null
          override_outcome?: string | null
          override_reason?: string | null
          period_end_date?: string | null
          period_start_date?: string | null
          preliminary_outcome?: string | null
          session_id: string
          status?: string
          taxpayer_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          additional_context?: string | null
          completed?: boolean | null
          confirmed_at?: string | null
          created_at?: string
          date_filled?: string
          docx_downloaded_at?: string | null
          entity_name?: string | null
          final_score?: number | null
          fiscal_year?: string
          id?: string
          is_custom_period?: boolean
          outcome_confirmed?: boolean | null
          outcome_overridden?: boolean | null
          override_outcome?: string | null
          override_reason?: string | null
          period_end_date?: string | null
          period_start_date?: string | null
          preliminary_outcome?: string | null
          session_id?: string
          status?: string
          taxpayer_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          full_name: string | null
          id: string
          last_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          full_name?: string | null
          id?: string
          last_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_old_sessions: { Args: never; Returns: undefined }
      can_modify_admin_role: {
        Args: { action: string; target_user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
