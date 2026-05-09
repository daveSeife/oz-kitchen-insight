import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle, Clock, Utensils } from "lucide-react";

interface UserDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

interface UserDetails {
  profile: {
    id: string;
    first_name: string;
    last_name: string;
    phone_number: string | null;
    created_at: string;
  };
  activeMeals: number;
  remainingMeals: number;
  paymentStatus: string;
  subscriptionStatus: {
    status: string;
    endDate: string | null;
    planName: string | null;
  } | null;
}

export const UserDetailSheet = ({
  open,
  onOpenChange,
  userId,
}: UserDetailSheetProps) => {
  const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && userId) {
      fetchUserDetails();
    }
  }, [open, userId]);

  const fetchUserDetails = async () => {
    setLoading(true);
    try {
      // Fetch user profile
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) throw profileError;

      // Fetch user orders
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("id, payment_status, created_at")
        .eq("user_id", userId);

      if (ordersError && ordersError.code !== "PGRST205") throw ordersError;

      const orderIds = (ordersData || []).map((o) => o.id);
      
      // Fetch all order meals for this user's orders
      let orderMeals: any[] = [];
      if (orderIds.length > 0) {
        const { data: mealsData, error: mealsError } = await supabase
          .from("order_meals")
          .select("*")
          .in("order_id", orderIds);

        if (mealsError && mealsError.code !== "PGRST205") throw mealsError;
        orderMeals = mealsData || [];
      }

      // Count active meals (any status except delivered or cancelled, and future date)
      const activeMeals = orderMeals.filter(
        (meal) =>
          meal.status !== "delivered" &&
          meal.status !== "cancelled" &&
          new Date(meal.scheduled_date) >= new Date()
      ).length;

      // Count remaining meals (any status except delivered or cancelled)
      const remainingMeals = orderMeals.filter(
        (meal) => meal.status !== "delivered" && meal.status !== "cancelled"
      ).length;

      // Get latest payment status
      const latestOrder = (ordersData || []).sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];
      const paymentStatus = latestOrder?.payment_status || "no orders";

      // Fetch subscription status
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from("user_subscriptions")
        .select("status, end_date, subscription_plans(name)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError && subscriptionError.code !== "PGRST200") {
        console.error("Subscription error:", subscriptionError);
      }

      setUserDetails({
        profile: profileData,
        activeMeals,
        remainingMeals,
        paymentStatus,
        subscriptionStatus: subscriptionData
          ? {
              status: subscriptionData.status,
              endDate: subscriptionData.end_date,
              planName: (subscriptionData.subscription_plans as any)?.name || null,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error fetching user details:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { variant: "default" | "secondary" | "destructive"; icon: React.ReactNode }
    > = {
      paid: {
        variant: "default",
        icon: <CheckCircle className="w-3 h-3" />,
      },
      pending: {
        variant: "secondary",
        icon: <Clock className="w-3 h-3" />,
      },
      partial: {
        variant: "secondary",
        icon: <Clock className="w-3 h-3" />,
      },
      failed: {
        variant: "destructive",
        icon: <AlertCircle className="w-3 h-3" />,
      },
      "no orders": {
        variant: "secondary",
        icon: <AlertCircle className="w-3 h-3" />,
      },
    };

    const config = statusConfig[status] || statusConfig["pending"];

    return (
      <Badge variant={config.variant} className="gap-1.5">
        {config.icon}
        <span className="capitalize">{status}</span>
      </Badge>
    );
  };

  const getSubscriptionStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      { variant: "default" | "secondary" | "destructive" }
    > = {
      active: "default",
      inactive: "secondary",
      cancelled: "destructive",
      paused: "secondary",
    };

    return (
      <Badge
        variant={statusConfig[status] || "secondary"}
        className="capitalize"
      >
        {status}
      </Badge>
    );
  };

  if (!userDetails && !loading) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customer Details</SheetTitle>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center items-center py-8">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : userDetails ? (
          <div className="space-y-6 mt-6">
            {/* Profile Information */}
            <div>
              <h3 className="text-lg font-semibold">
                {userDetails.profile.first_name}{" "}
                {userDetails.profile.last_name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {userDetails.profile.phone_number || "No phone number"}
              </p>
              <p className="text-sm text-muted-foreground">
                Joined:{" "}
                {new Date(userDetails.profile.created_at).toLocaleDateString()}
              </p>
            </div>

            <Separator />

            {/* Active Meals */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Utensils className="w-4 h-4 text-primary" />
                <h4 className="font-semibold text-sm">Active Meals</h4>
              </div>
              <p className="text-2xl font-bold">
                {userDetails.activeMeals}
              </p>
              <p className="text-xs text-muted-foreground">
                Currently scheduled meals
              </p>
            </div>

            {/* Remaining Meals */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Utensils className="w-4 h-4 text-secondary" />
                <h4 className="font-semibold text-sm">Remaining Meals</h4>
              </div>
              <p className="text-2xl font-bold">
                {userDetails.remainingMeals}
              </p>
              <p className="text-xs text-muted-foreground">
                Total scheduled meals
              </p>
            </div>

            <Separator />

            {/* Payment Status */}
            <div>
              <h4 className="font-semibold text-sm mb-2">Payment Status</h4>
              <div className="flex items-center gap-2">
                {getStatusBadge(userDetails.paymentStatus)}
              </div>
            </div>

            {/* Subscription Status */}
            <div>
              <h4 className="font-semibold text-sm mb-2">Subscription Status</h4>
              {userDetails.subscriptionStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {getSubscriptionStatusBadge(
                      userDetails.subscriptionStatus.status
                    )}
                  </div>
                  {userDetails.subscriptionStatus.planName && (
                    <p className="text-sm text-muted-foreground">
                      Plan: {userDetails.subscriptionStatus.planName}
                    </p>
                  )}
                  {userDetails.subscriptionStatus.endDate && (
                    <p className="text-sm text-muted-foreground">
                      Ends:{" "}
                      {new Date(
                        userDetails.subscriptionStatus.endDate
                      ).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ) : (
                <Badge variant="secondary">No Active Subscription</Badge>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
