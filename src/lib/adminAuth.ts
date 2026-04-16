import { supabase } from "@/integrations/supabase/client";

export type AdminAccess = {
  hasAccess: boolean;
  role: string | null;
};

export const getAdminAccess = async (userId: string): Promise<AdminAccess> => {
  const [adminResult, profileResult] = await Promise.all([
    supabase
      .from("admin_users")
      .select("role, is_active")
      .eq("id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (adminResult.data) {
    return {
      hasAccess: true,
      role: adminResult.data.role,
    };
  }

  const profileRole = profileResult.data?.role ?? null;
  const hasProfileAccess = profileRole === "admin" || profileRole === "super_admin";

  return {
    hasAccess: hasProfileAccess,
    role: hasProfileAccess ? profileRole : null,
  };
};
