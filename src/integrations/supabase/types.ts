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
    PostgrestVersion: "13.0.4"
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
      atad2_questions: {
        Row: {
          answer_option: string
          created_at: string
          difficult_term: string | null
          id: string
          next_question_id: string | null
          question: string
          question_id: string
          question_title: string | null
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
          question_id: string
          question_title?: string | null
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
          question_id?: string
          question_title?: string | null
          risk_points?: number
          term_explanation?: string | null
          updated_at?: string
        }
        Relationships: []
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
          completed: boolean | null
          created_at: string
          date_filled: string
          entity_name: string | null
          final_score: number | null
          fiscal_year: string
          id: string
          is_custom_period: boolean
          period_end_date: string | null
          period_start_date: string | null
          session_id: string
          status: string
          taxpayer_name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          date_filled?: string
          entity_name?: string | null
          final_score?: number | null
          fiscal_year: string
          id?: string
          is_custom_period?: boolean
          period_end_date?: string | null
          period_start_date?: string | null
          session_id: string
          status?: string
          taxpayer_name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          date_filled?: string
          entity_name?: string | null
          final_score?: number | null
          fiscal_year?: string
          id?: string
          is_custom_period?: boolean
          period_end_date?: string | null
          period_start_date?: string | null
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
          ip_address: unknown | null
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
          ip_address?: unknown | null
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
          ip_address?: unknown | null
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
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
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
      anonymize_old_sessions: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
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
