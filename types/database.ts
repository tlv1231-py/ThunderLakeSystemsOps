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
      activity_events: {
        Row: {
          client_id: string | null
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          invoice_id: string | null
          project_id: string | null
          user_id: string | null
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          client_id?: string | null
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          user_id?: string | null
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          name: string
          portal_access_enabled: boolean
        }
        Insert: {
          client_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          portal_access_enabled?: boolean
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          portal_access_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_address: string | null
          company_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          default_hourly_rate: number | null
          id: string
          invoice_terms_days: number
          is_active: boolean
          notes: string | null
          reminder_schedule_id: string | null
          timezone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_address?: string | null
          company_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          default_hourly_rate?: number | null
          id?: string
          invoice_terms_days?: number
          is_active?: boolean
          notes?: string | null
          reminder_schedule_id?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_address?: string | null
          company_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          default_hourly_rate?: number | null
          id?: string
          invoice_terms_days?: number
          is_active?: boolean
          notes?: string | null
          reminder_schedule_id?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_reminder_schedule_id_fkey"
            columns: ["reminder_schedule_id"]
            isOneToOne: false
            referencedRelation: "reminder_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          client_id: string | null
          error_message: string | null
          id: string
          invoice_id: string | null
          opened_at: string | null
          provider_message_id: string | null
          recipient_email: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_status_type"]
          subject: string
          template_id: string | null
        }
        Insert: {
          client_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status_type"]
          subject: string
          template_id?: string | null
        }
        Update: {
          client_id?: string | null
          error_message?: string | null
          id?: string
          invoice_id?: string | null
          opened_at?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_status_type"]
          subject?: string
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_template: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          subject_template: string
          type: Database["public"]["Enums"]["email_template_type"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          body_template: string
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          subject_template: string
          type: Database["public"]["Enums"]["email_template_type"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          body_template?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          subject_template?: string
          type?: Database["public"]["Enums"]["email_template_type"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_entries: {
        Row: {
          amount: number
          billable: boolean
          client_id: string
          created_at: string
          currency: string
          date_incurred: string
          description: string
          id: string
          invoice_id: string | null
          project_id: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["entry_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          billable?: boolean
          client_id: string
          created_at?: string
          currency?: string
          date_incurred: string
          description: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          billable?: boolean
          client_id?: string
          created_at?: string
          currency?: string
          date_incurred?: string
          description?: string
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          client_id: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          project_id: string | null
          uploaded_at: string
          uploaded_by: string | null
          user_id: string
          visibility: Database["public"]["Enums"]["file_visibility"]
        }
        Insert: {
          client_id?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          project_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
        }
        Update: {
          client_id?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          project_id?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
          user_id?: string
          visibility?: Database["public"]["Enums"]["file_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_line_items: {
        Row: {
          description: string
          expense_entry_id: string | null
          id: string
          invoice_id: string
          line_total: number
          quantity: number
          sort_order: number
          time_entry_id: string | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_rate: number
        }
        Insert: {
          description: string
          expense_entry_id?: string | null
          id?: string
          invoice_id: string
          line_total?: number
          quantity?: number
          sort_order?: number
          time_entry_id?: string | null
          type: Database["public"]["Enums"]["line_item_type"]
          unit_rate?: number
        }
        Update: {
          description?: string
          expense_entry_id?: string | null
          id?: string
          invoice_id?: string
          line_total?: number
          quantity?: number
          sort_order?: number
          time_entry_id?: string | null
          type?: Database["public"]["Enums"]["line_item_type"]
          unit_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_expense_entry_id_fkey"
            columns: ["expense_entry_id"]
            isOneToOne: false
            referencedRelation: "expense_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          balance_due: number
          client_id: string
          created_at: string
          currency: string
          discount_amount: number
          due_date: string
          email_sent_at: string | null
          id: string
          invoice_number: string
          issue_date: string
          last_reminder_at: string | null
          notes: string | null
          pdf_url: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          total_amount: number
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          amount_paid?: number
          balance_due?: number
          client_id: string
          created_at?: string
          currency?: string
          discount_amount?: number
          due_date: string
          email_sent_at?: string | null
          id?: string
          invoice_number: string
          issue_date: string
          last_reminder_at?: string | null
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          amount_paid?: number
          balance_due?: number
          client_id?: string
          created_at?: string
          currency?: string
          discount_amount?: number
          due_date?: string
          email_sent_at?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          last_reminder_at?: string | null
          notes?: string | null
          pdf_url?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method_type"]
          reference_number: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date: string
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          reference_number?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method_type"]
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"]
          client_id: string
          created_at: string
          description: string | null
          estimated_hours: number | null
          hourly_rate_override: number | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          client_id: string
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          hourly_rate_override?: number | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"]
          client_id?: string
          created_at?: string
          description?: string | null
          estimated_hours?: number | null
          hourly_rate_override?: number | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_schedule_rules: {
        Row: {
          active: boolean
          days_after_due: number
          email_template_id: string | null
          id: string
          reminder_schedule_id: string
        }
        Insert: {
          active?: boolean
          days_after_due: number
          email_template_id?: string | null
          id?: string
          reminder_schedule_id: string
        }
        Update: {
          active?: boolean
          days_after_due?: number
          email_template_id?: string | null
          id?: string
          reminder_schedule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_schedule_rules_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminder_schedule_rules_reminder_schedule_id_fkey"
            columns: ["reminder_schedule_id"]
            isOneToOne: false
            referencedRelation: "reminder_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_schedules: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_schedules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      taxes: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          rate: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          billable: boolean
          client_id: string
          created_at: string
          date_worked: string
          description: string | null
          hours_decimal: number
          id: string
          invoice_id: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["entry_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          billable?: boolean
          client_id: string
          created_at?: string
          date_worked: string
          description?: string | null
          hours_decimal: number
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          billable?: boolean
          client_id?: string
          created_at?: string
          date_worked?: string
          description?: string | null
          hours_decimal?: number
          id?: string
          invoice_id?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["entry_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          billing_address: string | null
          company_logo_url: string | null
          company_name: string | null
          created_at: string
          default_currency: string
          default_invoice_terms_days: number
          default_tax_rate: number
          email: string
          id: string
          invoice_number_prefix: string
          invoice_number_sequence: number
          name: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string
          default_currency?: string
          default_invoice_terms_days?: number
          default_tax_rate?: number
          email: string
          id: string
          invoice_number_prefix?: string
          invoice_number_sequence?: number
          name?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          created_at?: string
          default_currency?: string
          default_invoice_terms_days?: number
          default_tax_rate?: number
          email?: string
          id?: string
          invoice_number_prefix?: string
          invoice_number_sequence?: number
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_invoice_number: { Args: { p_user_id: string }; Returns: string }
      is_portal_user_for_client: {
        Args: { p_client_id: string }
        Returns: boolean
      }
    }
    Enums: {
      billing_type: "hourly" | "fixed" | "retainer"
      email_status_type: "pending" | "sent" | "failed" | "bounced" | "opened"
      email_template_type: "invoice_send" | "reminder" | "overdue"
      entry_status: "uninvoiced" | "invoiced" | "paid" | "written_off"
      event_visibility: "internal" | "client_visible"
      file_visibility: "internal" | "client_visible"
      invoice_status:
        | "draft"
        | "sent"
        | "viewed"
        | "partial"
        | "paid"
        | "overdue"
        | "void"
      line_item_type: "time" | "fixed" | "expense" | "adjustment"
      payment_method_type:
        | "ach"
        | "wire"
        | "check"
        | "venmo"
        | "paypal"
        | "cash"
        | "other"
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
      billing_type: ["hourly", "fixed", "retainer"],
      email_status_type: ["pending", "sent", "failed", "bounced", "opened"],
      email_template_type: ["invoice_send", "reminder", "overdue"],
      entry_status: ["uninvoiced", "invoiced", "paid", "written_off"],
      event_visibility: ["internal", "client_visible"],
      file_visibility: ["internal", "client_visible"],
      invoice_status: [
        "draft",
        "sent",
        "viewed",
        "partial",
        "paid",
        "overdue",
        "void",
      ],
      line_item_type: ["time", "fixed", "expense", "adjustment"],
      payment_method_type: [
        "ach",
        "wire",
        "check",
        "venmo",
        "paypal",
        "cash",
        "other",
      ],
    },
  },
} as const
