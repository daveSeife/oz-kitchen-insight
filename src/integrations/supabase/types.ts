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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          permissions: Json | null
          role: string
        }
        Insert: {
          created_at?: string | null
          id: string
          is_active?: boolean | null
          permissions?: Json | null
          role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          permissions?: Json | null
          role?: string
        }
        Relationships: []
      }
      commission_settlements: {
        Row: {
          created_at: string | null
          id: string
          paid_at: string | null
          partner_id: string
          payment_method: string | null
          payment_reference: string | null
          settlement_period_end: string
          settlement_period_start: string
          status: string | null
          total_commissions: number
          total_payments_count: number
          total_referred_users: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id: string
          payment_method?: string | null
          payment_reference?: string | null
          settlement_period_end: string
          settlement_period_start: string
          status?: string | null
          total_commissions: number
          total_payments_count: number
          total_referred_users: number
        }
        Update: {
          created_at?: string | null
          id?: string
          paid_at?: string | null
          partner_id?: string
          payment_method?: string | null
          payment_reference?: string | null
          settlement_period_end?: string
          settlement_period_start?: string
          status?: string | null
          total_commissions?: number
          total_payments_count?: number
          total_referred_users?: number
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string | null
          customer_feedback: string | null
          customer_rating: number | null
          delivery_notes: string | null
          delivery_person_id: string | null
          delivery_proof_url: string | null
          delivery_time: string | null
          id: string
          order_id: string
          pickup_time: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_feedback?: string | null
          customer_rating?: number | null
          delivery_notes?: string | null
          delivery_person_id?: string | null
          delivery_proof_url?: string | null
          delivery_time?: string | null
          id?: string
          order_id: string
          pickup_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_feedback?: string | null
          customer_rating?: number | null
          delivery_notes?: string | null
          delivery_person_id?: string | null
          delivery_proof_url?: string | null
          delivery_time?: string | null
          id?: string
          order_id?: string
          pickup_time?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_delivery_person_id_fkey"
            columns: ["delivery_person_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      meal_plan_items: {
        Row: {
          created_at: string | null
          delivery_date: string
          delivery_time_slot: string | null
          half_meal_1_id: string | null
          half_meal_2_id: string | null
          id: string
          is_half_half: boolean | null
          meal_id: string | null
          meal_plan_id: string | null
          meal_time: string | null
          meal_type: string | null
          quantity: number
          special_instructions: string | null
          status: string | null
          unit_price: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_date: string
          delivery_time_slot?: string | null
          half_meal_1_id?: string | null
          half_meal_2_id?: string | null
          id?: string
          is_half_half?: boolean | null
          meal_id?: string | null
          meal_plan_id?: string | null
          meal_time?: string | null
          meal_type?: string | null
          quantity?: number
          special_instructions?: string | null
          status?: string | null
          unit_price: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_date?: string
          delivery_time_slot?: string | null
          half_meal_1_id?: string | null
          half_meal_2_id?: string | null
          id?: string
          is_half_half?: boolean | null
          meal_id?: string | null
          meal_plan_id?: string | null
          meal_time?: string | null
          meal_type?: string | null
          quantity?: number
          special_instructions?: string | null
          status?: string | null
          unit_price?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_items_half_meal_1_id_fkey"
            columns: ["half_meal_1_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_half_meal_2_id_fkey"
            columns: ["half_meal_2_id"]
            isOneToOne: false
            referencedRelation: "meals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_items_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string | null
          id: string
          order_type: string
          status: string | null
          subscription_id: string | null
          total_amount: number
          updated_at: string | null
          user_id: string
          week_start_date: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_type?: string
          status?: string | null
          subscription_id?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id: string
          week_start_date: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_type?: string
          status?: string | null
          subscription_id?: string | null
          total_amount?: number
          updated_at?: string | null
          user_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meals: {
        Row: {
          availability_schedule: Json | null
          base_price: number
          category_id: string | null
          created_at: string | null
          description: string | null
          dietary_tags: string[] | null
          id: string
          image_url: string | null
          ingredients: string[] | null
          is_available: boolean | null
          is_chefs_choice: boolean | null
          meal_type: string | null
          name: string
          nutritional_info: Json | null
          preparation_time: number | null
          updated_at: string | null
        }
        Insert: {
          availability_schedule?: Json | null
          base_price: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          is_available?: boolean | null
          is_chefs_choice?: boolean | null
          meal_type?: string | null
          name: string
          nutritional_info?: Json | null
          preparation_time?: number | null
          updated_at?: string | null
        }
        Update: {
          availability_schedule?: Json | null
          base_price?: number
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          dietary_tags?: string[] | null
          id?: string
          image_url?: string | null
          ingredients?: string[] | null
          is_available?: boolean | null
          is_chefs_choice?: boolean | null
          meal_type?: string | null
          name?: string
          nutritional_info?: Json | null
          preparation_time?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meals_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "meal_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          delivery_address: Json
          delivery_date: string | null
          delivery_fee: number | null
          delivery_time_slot: string | null
          discount_amount: number | null
          id: string
          meal_plan_id: string | null
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_status: string | null
          status: string | null
          subtotal: number
          total_amount: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          delivery_address: Json
          delivery_date?: string | null
          delivery_fee?: number | null
          delivery_time_slot?: string | null
          discount_amount?: number | null
          id?: string
          meal_plan_id?: string | null
          notes?: string | null
          order_number: string
          payment_method?: string | null
          payment_status?: string | null
          status?: string | null
          subtotal: number
          total_amount: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          delivery_address?: Json
          delivery_date?: string | null
          delivery_fee?: number | null
          delivery_time_slot?: string | null
          discount_amount?: number | null
          id?: string
          meal_plan_id?: string | null
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_status?: string | null
          status?: string | null
          subtotal?: number
          total_amount?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string | null
          id: string
          notes: string | null
          partner_id: string
          payment_amount: number
          payment_id: string
          referral_id: string | null
          settlement_date: string | null
          settlement_reference: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string | null
          id?: string
          notes?: string | null
          partner_id: string
          payment_amount: number
          payment_id: string
          referral_id?: string | null
          settlement_date?: string | null
          settlement_reference?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          partner_id?: string
          payment_amount?: number
          payment_id?: string
          referral_id?: string | null
          settlement_date?: string | null
          settlement_reference?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_commissions_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_referral_id_fkey"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_commissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          api_key: string
          commission_rate: number
          contact_email: string | null
          created_at: string | null
          id: string
          name: string
          partner_code: string
          settings: Json | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key: string
          commission_rate?: number
          contact_email?: string | null
          created_at?: string | null
          id?: string
          name: string
          partner_code: string
          settings?: Json | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string
          commission_rate?: number
          contact_email?: string | null
          created_at?: string | null
          id?: string
          name?: string
          partner_code?: string
          settings?: Json | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          commission_calculated: boolean | null
          commission_eligible: boolean | null
          created_at: string | null
          currency: string | null
          external_transaction_id: string | null
          id: string
          order_id: string
          payment_gateway_response: Json | null
          payment_method: string
          processed_at: string | null
          referral_id: string | null
          status: string | null
        }
        Insert: {
          amount: number
          commission_calculated?: boolean | null
          commission_eligible?: boolean | null
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          id?: string
          order_id: string
          payment_gateway_response?: Json | null
          payment_method: string
          processed_at?: string | null
          referral_id?: string | null
          status?: string | null
        }
        Update: {
          amount?: number
          commission_calculated?: boolean | null
          commission_eligible?: boolean | null
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          id?: string
          order_id?: string
          payment_gateway_response?: Json | null
          payment_method?: string
          processed_at?: string | null
          referral_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_referral"
            columns: ["referral_id"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          aau_campus: string | null
          created_at: string | null
          delivery_address: Json | null
          first_name: string | null
          id: string
          is_aau_student: boolean | null
          last_name: string | null
          phone_number: string | null
          preferences: Json | null
          referral_partner_id: string | null
          referral_source: string | null
          role: string | null
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string | null
        }
        Insert: {
          aau_campus?: string | null
          created_at?: string | null
          delivery_address?: Json | null
          first_name?: string | null
          id?: string
          is_aau_student?: boolean | null
          last_name?: string | null
          phone_number?: string | null
          preferences?: Json | null
          referral_partner_id?: string | null
          referral_source?: string | null
          role?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
        }
        Update: {
          aau_campus?: string | null
          created_at?: string | null
          delivery_address?: Json | null
          first_name?: string | null
          id?: string
          is_aau_student?: boolean | null
          last_name?: string | null
          phone_number?: string | null
          preferences?: Json | null
          referral_partner_id?: string | null
          referral_source?: string | null
          role?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_referral_partner"
            columns: ["referral_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_profiles_referral_source"
            columns: ["referral_source"]
            isOneToOne: false
            referencedRelation: "referrals"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          anon_user_id: string | null
          campaign_id: string | null
          converted_at: string | null
          created_at: string | null
          expires_at: string | null
          first_payment_at: string | null
          id: string
          ip_address: unknown
          partner_id: string
          referral_token: string
          status: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          anon_user_id?: string | null
          campaign_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          first_payment_at?: string | null
          id?: string
          ip_address?: unknown
          partner_id: string
          referral_token: string
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          anon_user_id?: string | null
          campaign_id?: string | null
          converted_at?: string | null
          created_at?: string | null
          expires_at?: string | null
          first_payment_at?: string | null
          id?: string
          ip_address?: unknown
          partner_id?: string
          referral_token?: string
          status?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price: number
          created_at: string | null
          discount_percentage: number | null
          duration_days: number
          features: Json | null
          id: string
          is_active: boolean | null
          meal_types: string[] | null
          meals_per_week: number
          name: string
        }
        Insert: {
          base_price: number
          created_at?: string | null
          discount_percentage?: number | null
          duration_days: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          meal_types?: string[] | null
          meals_per_week: number
          name: string
        }
        Update: {
          base_price?: number
          created_at?: string | null
          discount_percentage?: number | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          meal_types?: string[] | null
          meals_per_week?: number
          name?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          activated_at: string | null
          auto_renew: boolean | null
          budget_limit: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          end_date: string
          id: string
          payment_id: string | null
          payment_status: string | null
          plan_id: string
          start_date: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          auto_renew?: boolean | null
          budget_limit?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          end_date: string
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          plan_id: string
          start_date: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          activated_at?: string | null
          auto_renew?: boolean | null
          budget_limit?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          end_date?: string
          id?: string
          payment_id?: string | null
          payment_status?: string | null
          plan_id?: string
          start_date?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      cleanup_old_notifications: { Args: never; Returns: undefined }
      create_sample_user_data: { Args: { user_id: string }; Returns: undefined }
      expire_old_referrals: { Args: never; Returns: undefined }
      expire_old_referrals_scheduled: { Args: never; Returns: undefined }
      expire_old_subscriptions: { Args: never; Returns: undefined }
      generate_monthly_settlement: {
        Args: { p_partner_id: string; p_settlement_month: string }
        Returns: string
      }
      get_available_meals: {
        Args: { p_category_id?: string; p_delivery_date?: string }
        Returns: {
          base_price: number
          category_name: string
          description: string
          dietary_tags: string[]
          id: string
          image_url: string
          ingredients: string[]
          name: string
          nutritional_info: Json
          preparation_time: number
        }[]
      }
      get_partner_commission_ledger: {
        Args: {
          p_end_date: string
          p_limit?: number
          p_offset?: number
          p_partner_id: string
          p_start_date: string
        }
        Returns: {
          commission_amount: number
          commission_rate: number
          id: string
          payment_amount: number
          payment_date: string
          settlement_date: string
          settlement_reference: string
          status: string
        }[]
      }
      get_partner_commission_metrics: {
        Args: { p_end_date: string; p_partner_id: string; p_start_date: string }
        Returns: {
          approved_commission: number
          paid_commission: number
          pending_commission: number
          reversed_commission: number
          total_commission_amount: number
          total_payment_amount: number
          total_payments: number
        }[]
      }
      get_partner_id_from_api_key: {
        Args: { api_key: string }
        Returns: string
      }
      get_partner_referral_metrics: {
        Args: { p_end_date: string; p_partner_id: string; p_start_date: string }
        Returns: {
          converted_referrals: number
          expired_referrals: number
          pending_referrals: number
          total_referrals: number
        }[]
      }
      get_user_meal_plan_summary: {
        Args: { p_user_id: string; p_week_start_date: string }
        Returns: {
          meal_plan_id: string
          meals: Json
          status: string
          total_amount: number
          total_meals: number
        }[]
      }
      get_user_order_history: {
        Args: { p_limit?: number; p_offset?: number; p_user_id: string }
        Returns: {
          created_at: string
          delivery_date: string
          id: string
          meal_count: number
          order_number: string
          payment_status: string
          status: string
          total_amount: number
        }[]
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_super_admin: { Args: { user_id: string }; Returns: boolean }
      is_valid_partner_api_key: { Args: { api_key: string }; Returns: boolean }
      link_referral_to_user: {
        Args: { p_referral_token: string; p_user_id: string }
        Returns: boolean
      }
      promote_user_to_admin: {
        Args: { admin_role?: string; target_user_id: string }
        Returns: boolean
      }
      reset_sample_data: { Args: never; Returns: undefined }
      validate_sample_data: {
        Args: never
        Returns: {
          record_count: number
          status: string
          table_name: string
        }[]
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
    Enums: {},
  },
} as const
