// Auto-generated placeholder — run `npm run db:types` after migration to regenerate.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          company_name: string | null;
          company_logo_url: string | null;
          default_currency: string;
          default_tax_rate: number;
          default_invoice_terms_days: number;
          invoice_number_prefix: string;
          invoice_number_sequence: number;
          billing_address: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string | null;
          company_name?: string | null;
          company_logo_url?: string | null;
          default_currency?: string;
          default_tax_rate?: number;
          default_invoice_terms_days?: number;
          invoice_number_prefix?: string;
          invoice_number_sequence?: number;
          billing_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          company_name?: string | null;
          company_logo_url?: string | null;
          default_currency?: string;
          default_tax_rate?: number;
          default_invoice_terms_days?: number;
          invoice_number_prefix?: string;
          invoice_number_sequence?: number;
          billing_address?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      clients: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          contact_name: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          billing_address: string | null;
          timezone: string | null;
          currency: string;
          default_hourly_rate: number | null;
          invoice_terms_days: number;
          reminder_schedule_id: string | null;
          notes: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          billing_address?: string | null;
          timezone?: string | null;
          currency?: string;
          default_hourly_rate?: number | null;
          invoice_terms_days?: number;
          reminder_schedule_id?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          contact_name?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          billing_address?: string | null;
          timezone?: string | null;
          currency?: string;
          default_hourly_rate?: number | null;
          invoice_terms_days?: number;
          reminder_schedule_id?: string | null;
          notes?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "clients_reminder_schedule_id_fkey";
            columns: ["reminder_schedule_id"];
            isOneToOne: false;
            referencedRelation: "reminder_schedules";
            referencedColumns: ["id"];
          },
        ];
      };
      client_users: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          email: string;
          portal_access_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          email: string;
          portal_access_enabled?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          email?: string;
          portal_access_enabled?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          client_id: string;
          name: string;
          description: string | null;
          billing_type: "hourly" | "fixed" | "retainer";
          hourly_rate_override: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          name: string;
          description?: string | null;
          billing_type?: "hourly" | "fixed" | "retainer";
          hourly_rate_override?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          name?: string;
          description?: string | null;
          billing_type?: "hourly" | "fixed" | "retainer";
          hourly_rate_override?: number | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      time_entries: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          project_id: string | null;
          date_worked: string;
          hours_decimal: number;
          description: string | null;
          billable: boolean;
          invoice_id: string | null;
          status: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          project_id?: string | null;
          date_worked: string;
          hours_decimal: number;
          description?: string | null;
          billable?: boolean;
          invoice_id?: string | null;
          status?: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          project_id?: string | null;
          date_worked?: string;
          hours_decimal?: number;
          description?: string | null;
          billable?: boolean;
          invoice_id?: string | null;
          status?: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "time_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "time_entries_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      expense_entries: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          project_id: string | null;
          date_incurred: string;
          description: string;
          amount: number;
          currency: string;
          billable: boolean;
          receipt_url: string | null;
          invoice_id: string | null;
          status: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          project_id?: string | null;
          date_incurred: string;
          description: string;
          amount: number;
          currency?: string;
          billable?: boolean;
          receipt_url?: string | null;
          invoice_id?: string | null;
          status?: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          project_id?: string | null;
          date_incurred?: string;
          description?: string;
          amount?: number;
          currency?: string;
          billable?: boolean;
          receipt_url?: string | null;
          invoice_id?: string | null;
          status?: "uninvoiced" | "invoiced" | "paid" | "written_off";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expense_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_entries_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_entries_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expense_entries_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
      invoices: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          invoice_number: string;
          status: "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void";
          issue_date: string;
          due_date: string;
          currency: string;
          subtotal: number;
          tax_rate: number;
          tax_amount: number;
          discount_amount: number;
          total_amount: number;
          amount_paid: number;
          balance_due: number;
          email_sent_at: string | null;
          viewed_at: string | null;
          last_reminder_at: string | null;
          pdf_url: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          invoice_number: string;
          status?: "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void";
          issue_date: string;
          due_date: string;
          currency?: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          amount_paid?: number;
          balance_due?: number;
          email_sent_at?: string | null;
          viewed_at?: string | null;
          last_reminder_at?: string | null;
          pdf_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string;
          invoice_number?: string;
          status?: "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void";
          issue_date?: string;
          due_date?: string;
          currency?: string;
          subtotal?: number;
          tax_rate?: number;
          tax_amount?: number;
          discount_amount?: number;
          total_amount?: number;
          amount_paid?: number;
          balance_due?: number;
          email_sent_at?: string | null;
          viewed_at?: string | null;
          last_reminder_at?: string | null;
          pdf_url?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invoices_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invoices_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      invoice_line_items: {
        Row: {
          id: string;
          invoice_id: string;
          type: "time" | "fixed" | "expense" | "adjustment";
          time_entry_id: string | null;
          expense_entry_id: string | null;
          description: string;
          quantity: number;
          unit_rate: number;
          line_total: number;
          sort_order: number;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          type: "time" | "fixed" | "expense" | "adjustment";
          time_entry_id?: string | null;
          expense_entry_id?: string | null;
          description: string;
          quantity: number;
          unit_rate: number;
          line_total: number;
          sort_order?: number;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          type?: "time" | "fixed" | "expense" | "adjustment";
          time_entry_id?: string | null;
          expense_entry_id?: string | null;
          description?: string;
          quantity?: number;
          unit_rate?: number;
          line_total?: number;
          sort_order?: number;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          invoice_id: string;
          client_id: string;
          amount: number;
          payment_date: string;
          payment_method: "ach" | "wire" | "check" | "venmo" | "paypal" | "cash" | "other";
          reference_number: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          invoice_id: string;
          client_id: string;
          amount: number;
          payment_date: string;
          payment_method?: "ach" | "wire" | "check" | "venmo" | "paypal" | "cash" | "other";
          reference_number?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          invoice_id?: string;
          client_id?: string;
          amount?: number;
          payment_date?: string;
          payment_method?: "ach" | "wire" | "check" | "venmo" | "paypal" | "cash" | "other";
          reference_number?: string | null;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      taxes: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          rate: number;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          rate: number;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          rate?: number;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_templates: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          type: "invoice_send" | "reminder" | "overdue";
          subject_template: string;
          body_template: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          type: "invoice_send" | "reminder" | "overdue";
          subject_template: string;
          body_template: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          type?: "invoice_send" | "reminder" | "overdue";
          subject_template?: string;
          body_template?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      email_logs: {
        Row: {
          id: string;
          client_id: string | null;
          invoice_id: string | null;
          template_id: string | null;
          recipient_email: string;
          subject: string;
          status: "pending" | "sent" | "failed" | "bounced" | "opened";
          provider_message_id: string | null;
          sent_at: string | null;
          opened_at: string | null;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          client_id?: string | null;
          invoice_id?: string | null;
          template_id?: string | null;
          recipient_email: string;
          subject: string;
          status?: "pending" | "sent" | "failed" | "bounced" | "opened";
          provider_message_id?: string | null;
          sent_at?: string | null;
          opened_at?: string | null;
          error_message?: string | null;
        };
        Update: {
          id?: string;
          client_id?: string | null;
          invoice_id?: string | null;
          template_id?: string | null;
          recipient_email?: string;
          subject?: string;
          status?: "pending" | "sent" | "failed" | "bounced" | "opened";
          provider_message_id?: string | null;
          sent_at?: string | null;
          opened_at?: string | null;
          error_message?: string | null;
        };
        Relationships: [];
      };
      reminder_schedules: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reminder_schedule_rules: {
        Row: {
          id: string;
          reminder_schedule_id: string;
          days_after_due: number;
          email_template_id: string | null;
          active: boolean;
        };
        Insert: {
          id?: string;
          reminder_schedule_id: string;
          days_after_due: number;
          email_template_id?: string | null;
          active?: boolean;
        };
        Update: {
          id?: string;
          reminder_schedule_id?: string;
          days_after_due?: number;
          email_template_id?: string | null;
          active?: boolean;
        };
        Relationships: [];
      };
      files: {
        Row: {
          id: string;
          user_id: string;
          client_id: string | null;
          project_id: string | null;
          file_name: string;
          file_url: string;
          file_type: string | null;
          file_size: number | null;
          uploaded_by: string | null;
          visibility: "internal" | "client_visible";
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id?: string | null;
          project_id?: string | null;
          file_name: string;
          file_url: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          visibility?: "internal" | "client_visible";
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          client_id?: string | null;
          project_id?: string | null;
          file_name?: string;
          file_url?: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          visibility?: "internal" | "client_visible";
          uploaded_at?: string;
        };
        Relationships: [];
      };
      activity_events: {
        Row: {
          id: string;
          user_id: string | null;
          client_id: string | null;
          project_id: string | null;
          invoice_id: string | null;
          event_type: string;
          event_data: Json | null;
          visibility: "internal" | "client_visible";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          client_id?: string | null;
          project_id?: string | null;
          invoice_id?: string | null;
          event_type: string;
          event_data?: Json | null;
          visibility?: "internal" | "client_visible";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          client_id?: string | null;
          project_id?: string | null;
          invoice_id?: string | null;
          event_type?: string;
          event_data?: Json | null;
          visibility?: "internal" | "client_visible";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activity_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "activity_events_invoice_id_fkey";
            columns: ["invoice_id"];
            isOneToOne: false;
            referencedRelation: "invoices";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_invoice_number: {
        Args: { p_user_id: string };
        Returns: string;
      };
    };
    Enums: {
      billing_type: "hourly" | "fixed" | "retainer";
      invoice_status: "draft" | "sent" | "viewed" | "partial" | "paid" | "overdue" | "void";
      entry_status: "uninvoiced" | "invoiced" | "paid" | "written_off";
      payment_method_type: "ach" | "wire" | "check" | "venmo" | "paypal" | "cash" | "other";
      line_item_type: "time" | "fixed" | "expense" | "adjustment";
      email_status_type: "pending" | "sent" | "failed" | "bounced" | "opened";
      email_template_type: "invoice_send" | "reminder" | "overdue";
      file_visibility: "internal" | "client_visible";
      event_visibility: "internal" | "client_visible";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
