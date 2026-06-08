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
      atad2_appendix: {
        Row: {
          id: string
          session_id: string
          review_status: string
          generation_status: string
          rows: Json
          model: string | null
          prompt_version: number | null
          error_message: string | null
          generated_at: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          review_status?: string
          generation_status?: string
          rows?: Json
          model?: string | null
          prompt_version?: number | null
          error_message?: string | null
          generated_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          review_status?: string
          generation_status?: string
          rows?: Json
          model?: string | null
          prompt_version?: number | null
          error_message?: string | null
          generated_at?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_appendix_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_appendix_edits: {
        Row: {
          id: string
          appendix_id: string
          row_id: string
          field: string
          old_value: string | null
          new_value: string | null
          edited_by: string | null
          edited_at: string
        }
        Insert: {
          id?: string
          appendix_id: string
          row_id: string
          field: string
          old_value?: string | null
          new_value?: string | null
          edited_by?: string | null
          edited_at?: string
        }
        Update: {
          id?: string
          appendix_id?: string
          row_id?: string
          field?: string
          old_value?: string | null
          new_value?: string | null
          edited_by?: string | null
          edited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_appendix_edits_appendix_id_fkey"
            columns: ["appendix_id"]
            isOneToOne: false
            referencedRelation: "atad2_appendix"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_appendix_skeleton: {
        Row: {
          id: string
          row_id: string
          section_id: string
          section_title: string
          legal_basis: string
          condition_tested: string
          kind: string | null
          related_parties_view: boolean | null
          related_view: string | null
          legal_framework: string | null
          effect: string | null
          allowed_states: Json
          driven_by_question_ids: Json
          render_if: Json | null
          flags: Json | null
          sort_order: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          row_id: string
          section_id: string
          section_title: string
          legal_basis: string
          condition_tested: string
          kind?: string | null
          related_parties_view?: boolean | null
          related_view?: string | null
          legal_framework?: string | null
          effect?: string | null
          allowed_states?: Json
          driven_by_question_ids?: Json
          render_if?: Json | null
          flags?: Json | null
          sort_order: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          row_id?: string
          section_id?: string
          section_title?: string
          legal_basis?: string
          condition_tested?: string
          kind?: string | null
          related_parties_view?: boolean | null
          related_view?: string | null
          legal_framework?: string | null
          effect?: string | null
          allowed_states?: Json
          driven_by_question_ids?: Json
          render_if?: Json | null
          flags?: Json | null
          sort_order?: number
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      atad2_assessment_log: {
        Row: {
          id: string
          session_uuid: string
          session_id: string
          user_id: string | null
          user_email: string | null
          user_full_name: string | null
          taxpayer_name: string | null
          entity_name: string | null
          fiscal_year: string | null
          status: string | null
          final_score: number | null
          preliminary_outcome: string | null
          outcome_confirmed: boolean | null
          session_created_at: string | null
          session_updated_at: string | null
          confirmed_at: string | null
          event_type: "created" | "completed" | "deleted" | "backfill"
          event_at: string
        }
        Insert: {
          id?: string
          session_uuid: string
          session_id: string
          user_id?: string | null
          user_email?: string | null
          user_full_name?: string | null
          taxpayer_name?: string | null
          entity_name?: string | null
          fiscal_year?: string | null
          status?: string | null
          final_score?: number | null
          preliminary_outcome?: string | null
          outcome_confirmed?: boolean | null
          session_created_at?: string | null
          session_updated_at?: string | null
          confirmed_at?: string | null
          event_type: "created" | "completed" | "deleted" | "backfill"
          event_at?: string
        }
        Update: {
          id?: string
          session_uuid?: string
          session_id?: string
          user_id?: string | null
          user_email?: string | null
          user_full_name?: string | null
          taxpayer_name?: string | null
          entity_name?: string | null
          fiscal_year?: string | null
          status?: string | null
          final_score?: number | null
          preliminary_outcome?: string | null
          outcome_confirmed?: boolean | null
          session_created_at?: string | null
          session_updated_at?: string | null
          confirmed_at?: string | null
          event_type?: "created" | "completed" | "deleted" | "backfill"
          event_at?: string
        }
        Relationships: []
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
      atad2_feedback: {
        Row: {
          id: string
          user_id: string
          user_email: string
          category: "bug" | "idea" | "question" | "other"
          message: string
          page_url: string | null
          user_agent: string | null
          status: "new" | "triaged" | "done"
          admin_notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          user_email: string
          category: "bug" | "idea" | "question" | "other"
          message: string
          page_url?: string | null
          user_agent?: string | null
          status?: "new" | "triaged" | "done"
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          user_email?: string
          category?: "bug" | "idea" | "question" | "other"
          message?: string
          page_url?: string | null
          user_agent?: string | null
          status?: "new" | "triaged" | "done"
          admin_notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // Manually added — no Supabase CLI available for self-hosted VM (feat/document-prefill)
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
          suggested_additional_context: string | null
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
          suggested_additional_context?: string | null
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
          suggested_additional_context?: string | null
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
          suggested_toelichting: string | null
          user_action: string
          verbatim_quote: string | null
          suggested_answer: "yes" | "no" | "unknown" | null
          confidence_pct: number | null
          answer_rationale: string | null
          contextual_hint: string | null
          suggested_toelichting_unknown: string | null
          committed_text: string | null
        }
        Insert: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id: string
          session_id: string
          source_refs: Json
          suggested_toelichting?: string | null
          user_action?: string
          verbatim_quote?: string | null
          suggested_answer?: "yes" | "no" | "unknown" | null
          confidence_pct?: number | null
          answer_rationale?: string | null
          contextual_hint?: string | null
          suggested_toelichting_unknown?: string | null
          committed_text?: string | null
        }
        Update: {
          actioned_at?: string | null
          created_at?: string
          id?: string
          question_id?: string
          session_id?: string
          source_refs?: Json
          suggested_toelichting?: string | null
          user_action?: string
          verbatim_quote?: string | null
          suggested_answer?: "yes" | "no" | "unknown" | null
          confidence_pct?: number | null
          answer_rationale?: string | null
          contextual_hint?: string | null
          suggested_toelichting_unknown?: string | null
          committed_text?: string | null
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
          category_source: string
          created_at: string
          doc_label: string
          error_message: string | null
          filename: string
          id: string
          is_thin: boolean
          mime_type: string
          relevance_note: string | null
          session_id: string
          size_bytes: number
          status: string
          storage_path: string
        }
        Insert: {
          category: string
          category_source?: string
          created_at?: string
          doc_label: string
          error_message?: string | null
          filename: string
          id?: string
          is_thin?: boolean
          mime_type: string
          relevance_note?: string | null
          session_id: string
          size_bytes: number
          status?: string
          storage_path: string
        }
        Update: {
          category?: string
          category_source?: string
          created_at?: string
          doc_label?: string
          error_message?: string | null
          filename?: string
          id?: string
          is_thin?: boolean
          mime_type?: string
          relevance_note?: string | null
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
          archived_at: string | null
          archived_by: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          archived_at?: string | null
          archived_by?: string | null
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
          revenue_eur: number | null
          revenue_updated_at: string | null
          revenue_updated_by: string | null
          session_id: string
          sold: boolean
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
          revenue_eur?: number | null
          revenue_updated_at?: string | null
          revenue_updated_by?: string | null
          session_id: string
          sold?: boolean
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
          revenue_eur?: number | null
          revenue_updated_at?: string | null
          revenue_updated_by?: string | null
          session_id?: string
          sold?: boolean
          status?: string
          taxpayer_name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      atad2_structure_charts: {
        Row: {
          canvas_height: number
          canvas_width: number
          created_at: string
          draft_extracted_at: string | null
          finalized_at: string | null
          heartbeat_at: string | null
          id: string
          session_id: string
          snapshot_captured_at: string | null
          snapshot_png: string | null
          status: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          draft_extracted_at?: string | null
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          session_id: string
          snapshot_captured_at?: string | null
          snapshot_png?: string | null
          status?: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          canvas_height?: number
          canvas_width?: number
          created_at?: string
          draft_extracted_at?: string | null
          finalized_at?: string | null
          heartbeat_at?: string | null
          id?: string
          session_id?: string
          snapshot_captured_at?: string | null
          snapshot_png?: string | null
          status?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "atad2_structure_charts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "atad2_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      atad2_structure_edges: {
        Row: {
          amount_eur: number | null
          chart_id: string
          created_at: string
          from_entity_id: string
          id: string
          is_mismatch: boolean
          kind: string
          label: string | null
          label_dx: number | null
          label_dy: number | null
          label_hidden: boolean
          label_t: number | null
          mismatch_atad2_article: string | null
          mismatch_classification: string | null
          ownership_pct: number | null
          ownership_voting_only: boolean | null
          source: string
          to_entity_id: string
          transaction_type: string | null
          updated_at: string
        }
        Insert: {
          amount_eur?: number | null
          chart_id: string
          created_at?: string
          from_entity_id: string
          id?: string
          is_mismatch?: boolean
          kind: string
          label?: string | null
          label_dx?: number | null
          label_dy?: number | null
          label_hidden?: boolean
          label_t?: number | null
          mismatch_atad2_article?: string | null
          mismatch_classification?: string | null
          ownership_pct?: number | null
          ownership_voting_only?: boolean | null
          source?: string
          to_entity_id: string
          transaction_type?: string | null
          updated_at?: string
        }
        Update: {
          amount_eur?: number | null
          chart_id?: string
          created_at?: string
          from_entity_id?: string
          id?: string
          is_mismatch?: boolean
          kind?: string
          label?: string | null
          label_dx?: number | null
          label_dy?: number | null
          label_hidden?: boolean
          label_t?: number | null
          mismatch_atad2_article?: string | null
          mismatch_classification?: string | null
          ownership_pct?: number | null
          ownership_voting_only?: boolean | null
          source?: string
          to_entity_id?: string
          transaction_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_structure_edges_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atad2_structure_edges_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atad2_structure_edges_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_structure_entities: {
        Row: {
          chart_id: string
          created_at: string
          entity_type: Database["public"]["Enums"]["entity_type_enum"]
          id: string
          is_taxpayer: boolean
          jurisdiction_iso: string
          legal_form: string | null
          name: string
          position_x: number
          position_y: number
          source: string
          updated_at: string
        }
        Insert: {
          chart_id: string
          created_at?: string
          entity_type: Database["public"]["Enums"]["entity_type_enum"]
          id?: string
          is_taxpayer?: boolean
          jurisdiction_iso: string
          legal_form?: string | null
          name: string
          position_x?: number
          position_y?: number
          source?: string
          updated_at?: string
        }
        Update: {
          chart_id?: string
          created_at?: string
          entity_type?: Database["public"]["Enums"]["entity_type_enum"]
          id?: string
          is_taxpayer?: boolean
          jurisdiction_iso?: string
          legal_form?: string | null
          name?: string
          position_x?: number
          position_y?: number
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atad2_structure_entities_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_charts"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_structure_flow_routing: {
        Row: {
          chart_id: string
          created_at: string
          from_entity_id: string
          id: string
          label_position: Json | null
          routing_mode: string
          to_entity_id: string
          updated_at: string
          waypoints: Json
        }
        Insert: {
          chart_id: string
          created_at?: string
          from_entity_id: string
          id?: string
          label_position?: Json | null
          routing_mode?: string
          to_entity_id: string
          updated_at?: string
          waypoints?: Json
        }
        Update: {
          chart_id?: string
          created_at?: string
          from_entity_id?: string
          id?: string
          label_position?: Json | null
          routing_mode?: string
          to_entity_id?: string
          updated_at?: string
          waypoints?: Json
        }
        Relationships: [
          {
            foreignKeyName: "atad2_structure_flow_routing_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atad2_structure_flow_routing_from_entity_id_fkey"
            columns: ["from_entity_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atad2_structure_flow_routing_to_entity_id_fkey"
            columns: ["to_entity_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_entities"
            referencedColumns: ["id"]
          },
        ]
      }
      atad2_structure_groupings: {
        Row: {
          bounds_override: Json | null
          chart_id: string
          created_at: string
          id: string
          kind: string
          label: string
          member_ids: string[]
        }
        Insert: {
          bounds_override?: Json | null
          chart_id: string
          created_at?: string
          id?: string
          kind: string
          label: string
          member_ids: string[]
        }
        Update: {
          bounds_override?: Json | null
          chart_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string
          member_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "atad2_structure_groupings_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "atad2_structure_charts"
            referencedColumns: ["id"]
          },
        ]
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
          before_you_start_dismissed: boolean
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
          before_you_start_dismissed?: boolean
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
          before_you_start_dismissed?: boolean
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
      admin_reset_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      admin_set_session_revenue: {
        Args: {
          p_revenue_eur: number | null
          p_session_id: string
          p_sold: boolean
        }
        Returns: Json
      }
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
      entity_type_enum:
        | "corporation"
        | "partnership"
        | "dh_entity"
        | "hybrid_partnership"
        | "reverse_hybrid"
        | "individual"
        | "trust_or_non_entity"
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
      entity_type_enum: [
        "corporation",
        "partnership",
        "dh_entity",
        "hybrid_partnership",
        "reverse_hybrid",
        "individual",
        "trust_or_non_entity",
      ],
    },
  },
} as const
