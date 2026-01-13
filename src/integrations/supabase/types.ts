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
      audit_logs: {
        Row: {
          created_at: string
          description: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      budget_movements: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          division_budget_id: string
          id: string
          movement_type: string
          performed_by: string
          request_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          division_budget_id: string
          id?: string
          movement_type: string
          performed_by: string
          request_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          division_budget_id?: string
          id?: string
          movement_type?: string
          performed_by?: string
          request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_movements_division_budget_id_fkey"
            columns: ["division_budget_id"]
            isOneToOne: false
            referencedRelation: "division_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_movements_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_periods: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          is_closed: boolean
          name: string
          start_date: string
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          name: string
          start_date: string
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          is_closed?: boolean
          name?: string
          start_date?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      budget_transfers: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          division_id: string
          from_budget_id: string
          id: string
          reason: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requester_id: string
          status: string
          submitted_at: string | null
          to_budget_id: string
          transfer_number: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          division_id: string
          from_budget_id: string
          id?: string
          reason: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requester_id: string
          status?: string
          submitted_at?: string | null
          to_budget_id: string
          transfer_number: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          division_id?: string
          from_budget_id?: string
          id?: string
          reason?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requester_id?: string
          status?: string
          submitted_at?: string | null
          to_budget_id?: string
          transfer_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_transfers_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_from_budget_id_fkey"
            columns: ["from_budget_id"]
            isOneToOne: false
            referencedRelation: "division_budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budget_transfers_to_budget_id_fkey"
            columns: ["to_budget_id"]
            isOneToOne: false
            referencedRelation: "division_budgets"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          funding_source_id: string
          id: string
          notes: string | null
          physical_balance: number
          reconciled_by: string
          reconciliation_date: string
          status: string
          system_balance: number
          variance: number
          variance_reason: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          funding_source_id: string
          id?: string
          notes?: string | null
          physical_balance: number
          reconciled_by: string
          reconciliation_date?: string
          status?: string
          system_balance: number
          variance: number
          variance_reason?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          funding_source_id?: string
          id?: string
          notes?: string | null
          physical_balance?: number
          reconciled_by?: string
          reconciliation_date?: string
          status?: string
          system_balance?: number
          variance?: number
          variance_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_reconciliations_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_source_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_reconciliations_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      division_budgets: {
        Row: {
          allocated_amount: number
          category_id: string
          created_at: string
          division_id: string
          id: string
          period_id: string
          updated_at: string
          used_amount: number
        }
        Insert: {
          allocated_amount?: number
          category_id: string
          created_at?: string
          division_id: string
          id?: string
          period_id: string
          updated_at?: string
          used_amount?: number
        }
        Update: {
          allocated_amount?: number
          category_id?: string
          created_at?: string
          division_id?: string
          id?: string
          period_id?: string
          updated_at?: string
          used_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "division_budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "division_budgets_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "division_budgets_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      divisions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      funding_sources: {
        Row: {
          account_holder: string | null
          account_number: string | null
          balance: number
          bank_name: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          balance?: number
          bank_name?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          balance?: number
          bank_name?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_logs: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          recipients: string[]
          request_id: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          recipients: string[]
          request_id?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          recipients?: string[]
          request_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          notify_on_approve: boolean
          notify_on_pay: boolean
          notify_on_reject: boolean
          notify_on_settle: boolean
          notify_on_submit: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notify_on_approve?: boolean
          notify_on_pay?: boolean
          notify_on_reject?: boolean
          notify_on_settle?: boolean
          notify_on_submit?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notify_on_approve?: boolean
          notify_on_pay?: boolean
          notify_on_reject?: boolean
          notify_on_settle?: boolean
          notify_on_submit?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      otp_secrets: {
        Row: {
          created_at: string
          secret: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          secret: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          secret?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "otp_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "otp_secrets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_secure"
            referencedColumns: ["id"]
          },
        ]
      }
      petty_cash_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          funding_source_id: string
          id: string
          performed_by: string
          reference_number: string | null
          request_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          funding_source_id: string
          id?: string
          performed_by: string
          reference_number?: string | null
          request_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          funding_source_id?: string
          id?: string
          performed_by?: string
          reference_number?: string | null
          request_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "petty_cash_transactions_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_source_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "petty_cash_transactions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          division_id: string | null
          email: string
          full_name: string
          id: string
          is_active: boolean
          otp_secret: string | null
          phone: string | null
          requires_otp: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          division_id?: string | null
          email: string
          full_name: string
          id: string
          is_active?: boolean
          otp_secret?: string | null
          phone?: string | null
          requires_otp?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          division_id?: string | null
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          otp_secret?: string | null
          phone?: string | null
          requires_otp?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          attachment_type: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id: string
          request_id: string
          uploaded_by: string
        }
        Insert: {
          attachment_type: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          file_type: string
          id?: string
          request_id: string
          uploaded_by: string
        }
        Update: {
          attachment_type?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          file_type?: string
          id?: string
          request_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          metadata: Json | null
          performed_by: string
          request_id: string
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
          performed_by: string
          request_id: string
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          beneficiary_account: string | null
          beneficiary_bank: string | null
          beneficiary_email: string | null
          beneficiary_name: string | null
          category_id: string
          created_at: string
          description: string
          division_id: string
          funding_source_id: string | null
          id: string
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          needed_date: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          payment_method: string | null
          period_id: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          request_number: string
          requester_id: string
          settled_at: string | null
          settled_by: string | null
          status: Database["public"]["Enums"]["request_status"]
          submitted_at: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_account?: string | null
          beneficiary_bank?: string | null
          beneficiary_email?: string | null
          beneficiary_name?: string | null
          category_id: string
          created_at?: string
          description: string
          division_id: string
          funding_source_id?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          needed_date: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          period_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_number: string
          requester_id: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          beneficiary_account?: string | null
          beneficiary_bank?: string | null
          beneficiary_email?: string | null
          beneficiary_name?: string | null
          category_id?: string
          created_at?: string
          description?: string
          division_id?: string
          funding_source_id?: string | null
          id?: string
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          needed_date?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          payment_method?: string | null
          period_id?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          request_number?: string
          requester_id?: string
          settled_at?: string | null
          settled_by?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          submitted_at?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_source_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_funding_source_id_fkey"
            columns: ["funding_source_id"]
            isOneToOne: false
            referencedRelation: "funding_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "budget_periods"
            referencedColumns: ["id"]
          },
        ]
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
      user_sessions: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          ip_address: string | null
          is_revoked: boolean
          last_active_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_revoked?: boolean
          last_active_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          ip_address?: string | null
          is_revoked?: boolean
          last_active_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      funding_source_options: {
        Row: {
          code: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          type: string | null
        }
        Insert: {
          code?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          type?: string | null
        }
        Update: {
          code?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          type?: string | null
        }
        Relationships: []
      }
      profiles_secure: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          division_id: string | null
          email: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
          phone: string | null
          requires_otp: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          division_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          requires_otp?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          division_id?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
          phone?: string | null
          requires_otp?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "divisions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_create_user: {
        Args: {
          p_division_id: string
          p_email: string
          p_full_name: string
          p_phone?: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: Json
      }
      approve_budget_transfer: {
        Args: { p_transfer_id: string }
        Returns: Json
      }
      approve_request: {
        Args: { p_approval_note?: string; p_request_id: string }
        Returns: Json
      }
      can_access_division: {
        Args: { _division_id: string; _user_id: string }
        Returns: boolean
      }
      create_reconciliation: {
        Args: {
          p_funding_source_id: string
          p_notes?: string
          p_physical_balance: number
        }
        Returns: Json
      }
      get_user_division_id: { Args: { _user_id: string }; Returns: string }
      get_user_otp_secret: { Args: { p_user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pay_request: {
        Args: { p_payment_note?: string; p_request_id: string }
        Returns: Json
      }
      reject_budget_transfer: {
        Args: { p_rejection_reason: string; p_transfer_id: string }
        Returns: Json
      }
      reject_request: {
        Args: { p_rejection_reason: string; p_request_id: string }
        Returns: Json
      }
      set_user_otp_secret: {
        Args: { p_secret: string; p_user_id: string }
        Returns: boolean
      }
      settle_request: { Args: { p_request_id: string }; Returns: Json }
      topup_petty_cash: {
        Args: {
          p_amount: number
          p_description?: string
          p_funding_source_id: string
          p_reference_number?: string
        }
        Returns: Json
      }
      verify_user_otp: {
        Args: { p_otp_code: string; p_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "finance" | "admin" | "user"
      request_status:
        | "draft"
        | "submitted"
        | "under_review"
        | "approved"
        | "rejected"
        | "paid"
        | "settled"
        | "cancelled"
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
      app_role: ["super_admin", "finance", "admin", "user"],
      request_status: [
        "draft",
        "submitted",
        "under_review",
        "approved",
        "rejected",
        "paid",
        "settled",
        "cancelled",
      ],
    },
  },
} as const
