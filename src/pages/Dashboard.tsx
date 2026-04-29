import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentOrders } from "@/components/dashboard/RecentOrders";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Users, ShoppingBag, TrendingUp, UtensilsCrossed, Repeat, CircleHelp } from "lucide-react";
import { getAdminAccess } from "@/lib/adminAuth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SubscriptionPlanRow = Tables<"subscription_plans">;
type UserSubscriptionRow = Tables<"user_subscriptions">;

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

interface RetentionUserDetail {
  userId: string;
  name: string;
  phone: string;
  planNames: string[];
  cadences: Array<"weekly" | "monthly">;
  status: string;
  endDate: string | null;
  reason: string;
  isRetained: boolean;
}

type DashboardStatKey = "orders" | "revenue" | "users" | "meals" | "retention";

interface DashboardStatsState {
  totalOrders: number;
  totalRevenue: number;
  activeUsers: number;
  totalMeals: number;
  retainedWeeklyUsers: number;
  retainedMonthlyUsers: number;
  activeWeeklySubscriptions: number;
  activeMonthlySubscriptions: number;
  retainedUsers: number;
}

interface RetentionBreakdownState {
  retainedWeekly: RetentionUserDetail[];
  retainedMonthly: RetentionUserDetail[];
  notRetained: RetentionUserDetail[];
}

const isMissingOrderMealsTableError = (error: { code?: string; message?: string } | null | undefined) => {
  if (!error) return false;
  return error.code === "42P01" || error.message?.includes("order_meals") || false;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStatsState>({
    totalOrders: 0,
    totalRevenue: 0,
    activeUsers: 0,
    totalMeals: 0,
    retainedWeeklyUsers: 0,
    retainedMonthlyUsers: 0,
    activeWeeklySubscriptions: 0,
    activeMonthlySubscriptions: 0,
    retainedUsers: 0,
  });
  const [revenueData, setRevenueData] = useState<{ name: string; revenue: number }[]>([]);
  const [selectedStat, setSelectedStat] = useState<DashboardStatKey | null>(null);
  const [retentionBreakdown, setRetentionBreakdown] = useState<RetentionBreakdownState>({
    retainedWeekly: [],
    retainedMonthly: [],
    notRetained: [],
  });

  const isSubscriptionActive = (subscription: Pick<UserSubscriptionRow, "status" | "end_date">) => {
    const inactiveStatuses = new Set(["cancelled", "canceled", "expired", "inactive", "failed"]);
    const normalizedStatus = (subscription.status || "").toLowerCase();
    if (inactiveStatuses.has(normalizedStatus)) return false;

    const endDate = new Date(subscription.end_date);
    return Number.isNaN(endDate.getTime()) ? true : endDate >= new Date();
  };

  const getPlanCadence = (plan: SubscriptionPlanRow) => {
    const normalizedName = plan.name.toLowerCase();
    if (plan.duration_days === 7 || normalizedName.includes("weekly")) return "weekly";
    if (plan.duration_days === 30 || normalizedName.includes("monthly")) return "monthly";
    return null;
  };

  const checkAuth = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/login");
      return;
    }
    const adminAccess = await getAdminAccess(session.user.id);
    if (!adminAccess.hasAccess) {
      await supabase.auth.signOut();
      navigate("/login");
    }
  }, [navigate]);

  const fetchStats = useCallback(async () => {
    try {
      const [ordersRes, usersRes, orderMealsRes, subscriptionsRes, plansRes] = await Promise.all([
        supabase.from("orders").select("total_amount", { count: "exact" }),
        supabase.from("profiles").select("id, first_name, last_name, phone_number"),
        supabase.from("order_meals").select("quantity"),
        supabase.from("user_subscriptions").select("user_id, plan_id, status, end_date, created_at, start_date, activated_at, cancelled_at"),
        supabase.from("subscription_plans").select("id, name, duration_days"),
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;
      let totalMeals = orderMealsRes.data?.reduce((sum, meal) => sum + Number(meal.quantity || 0), 0) || 0;

      if (orderMealsRes.error) {
        if (!isMissingOrderMealsTableError(orderMealsRes.error)) throw orderMealsRes.error;
        const mealsRes = await supabase.from("meals").select("id", { count: "exact" });
        totalMeals = mealsRes.count || 0;
      }

      if (subscriptionsRes.error) throw subscriptionsRes.error;
      if (plansRes.error) throw plansRes.error;

      const plansById = new Map(
        (plansRes.data || []).map((plan) => [plan.id, plan]),
      );

      const profilesById = new Map(
        ((usersRes.data || []) as ProfileRow[]).map((profile) => [profile.id, profile]),
      );

      const subscriptionsByUser = new Map<string, UserSubscriptionRow[]>();
      for (const subscription of subscriptionsRes.data || []) {
        const current = subscriptionsByUser.get(subscription.user_id) || [];
        current.push(subscription);
        subscriptionsByUser.set(subscription.user_id, current);
      }

      const formatProfileName = (profile?: ProfileRow) => {
        if (!profile) return "Unknown user";
        return `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown user";
      };

      const getSubscriptionReason = (subscription: Pick<UserSubscriptionRow, "status" | "end_date" | "plan_id">) => {
        const normalizedStatus = (subscription.status || "").toLowerCase();
        if (["cancelled", "canceled"].includes(normalizedStatus)) return "Cancelled";
        if (["expired"].includes(normalizedStatus)) return "Expired";

        const endDate = new Date(subscription.end_date);
        if (!Number.isNaN(endDate.getTime()) && endDate < new Date()) return "Ended";

        const plan = plansById.get(subscription.plan_id);
        return plan ? "Active" : "No matching plan";
      };

      const userDetailsById = new Map<string, RetentionUserDetail>();

      const weeklyUserIds = new Set<string>();
      const monthlyUserIds = new Set<string>();
      let activeWeeklySubscriptions = 0;
      let activeMonthlySubscriptions = 0;

      for (const subscription of subscriptionsRes.data || []) {
        const profile = profilesById.get(subscription.user_id);
        const plan = plansById.get(subscription.plan_id);
        const planName = plan?.name || "Unknown plan";
        const cadence = plan ? getPlanCadence(plan) : null;

        const existingDetail =
          userDetailsById.get(subscription.user_id) ||
          ({
            userId: subscription.user_id,
            name: formatProfileName(profile),
            phone: profile?.phone_number || "",
            planNames: [],
            cadences: [],
            status: subscription.status || "unknown",
            endDate: subscription.end_date || null,
            reason: "",
            isRetained: false,
          } satisfies RetentionUserDetail);

        if (!existingDetail.planNames.includes(planName)) {
          existingDetail.planNames.push(planName);
        }

        if (cadence && !existingDetail.cadences.includes(cadence)) {
          existingDetail.cadences.push(cadence);
        }

        if (subscription.created_at && (!existingDetail.endDate || new Date(subscription.created_at) > new Date(existingDetail.endDate))) {
          existingDetail.status = subscription.status || existingDetail.status;
          existingDetail.endDate = subscription.end_date || existingDetail.endDate;
        }

        userDetailsById.set(subscription.user_id, existingDetail);

        if (!isSubscriptionActive(subscription)) continue;

        if (!plan) continue;

        if (cadence === "weekly") {
          activeWeeklySubscriptions += 1;
          weeklyUserIds.add(subscription.user_id);
        }

        if (cadence === "monthly") {
          activeMonthlySubscriptions += 1;
          monthlyUserIds.add(subscription.user_id);
        }
      }

      const retainedUsers = new Set([...weeklyUserIds, ...monthlyUserIds]).size;

      const retainedWeekly = Array.from(weeklyUserIds)
        .map((userId) => {
          const detail = userDetailsById.get(userId);
          if (!detail) return null;
          return {
            ...detail,
            isRetained: true,
            reason: detail.cadences.includes("weekly") ? "Active weekly plan" : "Active subscription",
          } satisfies RetentionUserDetail;
        })
        .filter((value): value is RetentionUserDetail => value !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      const retainedMonthly = Array.from(monthlyUserIds)
        .map((userId) => {
          const detail = userDetailsById.get(userId);
          if (!detail) return null;
          return {
            ...detail,
            isRetained: true,
            reason: detail.cadences.includes("monthly") ? "Active monthly plan" : "Active subscription",
          } satisfies RetentionUserDetail;
        })
        .filter((value): value is RetentionUserDetail => value !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      const notRetained = Array.from(profilesById.values())
        .map((profile) => {
          const subscriptions = subscriptionsByUser.get(profile.id) || [];
          const detail = userDetailsById.get(profile.id);
          const activeSubscriptions = subscriptions.filter((subscription) => isSubscriptionActive(subscription));

          if (weeklyUserIds.has(profile.id) || monthlyUserIds.has(profile.id)) return null;

          const latestSubscription = [...subscriptions].sort((left, right) => {
            const leftDate = new Date(left.created_at || left.start_date || left.end_date).getTime();
            const rightDate = new Date(right.created_at || right.start_date || right.end_date).getTime();
            return rightDate - leftDate;
          })[0];

          return {
            userId: profile.id,
            name: formatProfileName(profile),
            phone: profile.phone_number || "",
            planNames: detail?.planNames || [],
            cadences: detail?.cadences || [],
            status: detail?.status || "inactive",
            endDate: detail?.endDate || null,
            isRetained: false,
            reason: subscriptions.length === 0
              ? "No subscription record"
              : activeSubscriptions.length > 0
                ? "Active subscription, but not a weekly or monthly plan"
                : getSubscriptionReason(latestSubscription),
          } satisfies RetentionUserDetail;
        })
        .filter((value): value is RetentionUserDetail => value !== null)
        .sort((left, right) => left.name.localeCompare(right.name));

      setRetentionBreakdown({ retainedWeekly, retainedMonthly, notRetained });

      setStats({
        totalOrders: ordersRes.count || 0,
        totalRevenue,
        activeUsers: (usersRes.data || []).length,
        totalMeals,
        retainedWeeklyUsers: weeklyUserIds.size,
        retainedMonthlyUsers: monthlyUserIds.size,
        activeWeeklySubscriptions,
        activeMonthlySubscriptions,
        retainedUsers,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRevenueData = useCallback(async () => {
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const { data: orders } = await supabase
        .from("orders")
        .select("created_at, total_amount")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });
      if (orders) {
        const monthlyRevenue = new Map<string, number>();
        orders.forEach((order) => {
          const date = new Date(order.created_at);
          const monthKey = date.toLocaleString('en-US', { month: 'short' });
          const current = monthlyRevenue.get(monthKey) || 0;
          monthlyRevenue.set(monthKey, current + Number(order.total_amount));
        });
        const chartData = Array.from(monthlyRevenue.entries()).map(([name, revenue]) => ({
          name,
          revenue: Math.round(revenue),
        }));
        setRevenueData(chartData);
      }
    } catch (error) {
      console.error("Error fetching revenue data:", error);
    }
  }, []);

  const statDetails = useMemo(() => {
    const retentionValue = `Weekly ${stats.retainedWeeklyUsers} / Monthly ${stats.retainedMonthlyUsers}`;

    return {
      orders: {
        title: "Total Orders",
        value: stats.totalOrders,
        description:
          "Counts all orders currently stored in the system, regardless of payment or fulfillment status.",
        explanation:
          "This helps track order volume over time and shows whether demand is growing or slowing down.",
      },
      revenue: {
        title: "Total Revenue",
        value: `ETB ${stats.totalRevenue.toLocaleString()}`,
        description:
          "Sums the total_amount across all orders, giving a top-line view of collected order value.",
        explanation:
          "Use this to compare sales performance against prior periods or alongside the revenue chart below.",
      },
      users: {
        title: "Active Users",
        value: stats.activeUsers,
        description:
          "Counts profile records available in the application. This is the total user base currently known to the dashboard.",
        explanation:
          "It is a broad user count, not a subscription metric, so it may include users without an active subscription.",
      },
      meals: {
        title: "Ordered Meals",
        value: stats.totalMeals,
        description:
          "Adds up the quantity field from ordered meal records, so this reflects individual meal servings rather than order count.",
        explanation:
          "This is useful for operational planning because it measures the actual meal load the kitchen needs to prepare.",
      },
      retention: {
        title: "Retained Subscribers",
        value: retentionValue,
        description:
          "Counts distinct users with an active weekly or monthly subscription. A subscription is treated as active when it is not cancelled or expired and its end date has not passed.",
        explanation:
          `Weekly retention uses plans with a 7-day duration or a weekly name; monthly retention uses plans with a 30-day duration or a monthly name. Right now that is ${stats.retainedWeeklyUsers} weekly users across ${stats.activeWeeklySubscriptions} active weekly subscriptions and ${stats.retainedMonthlyUsers} monthly users across ${stats.activeMonthlySubscriptions} active monthly subscriptions.`,
      },
    } as const;
  }, [stats]);

  useEffect(() => {
    void checkAuth();
    void fetchStats();
    void fetchRevenueData();
  }, [checkAuth, fetchStats, fetchRevenueData]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="page-header">
          <h1 className="font-heading">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back! Here's your business overview.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatsCard
            title="Total Orders"
            value={stats.totalOrders}
            icon={ShoppingBag}
            trend="+12.5%"
            loading={loading}
            gradient="primary"
            onClick={() => setSelectedStat("orders")}
          />
          <StatsCard
            title="Total Revenue"
            value={`ETB ${stats.totalRevenue.toLocaleString()}`}
            icon={TrendingUp}
            trend="+8.2%"
            loading={loading}
            gradient="secondary"
            onClick={() => setSelectedStat("revenue")}
          />
          <StatsCard
            title="Active Users"
            value={stats.activeUsers}
            icon={Users}
            trend="+23.1%"
            loading={loading}
            gradient="emerald"
            onClick={() => setSelectedStat("users")}
          />
          <StatsCard
            title="Ordered Meals"
            value={stats.totalMeals}
            icon={UtensilsCrossed}
            trend="+5.4%"
            loading={loading}
            gradient="violet"
            onClick={() => setSelectedStat("meals")}
          />
          <StatsCard
            title="Retained Subscribers"
            value={`W ${stats.retainedWeeklyUsers} / M ${stats.retainedMonthlyUsers}`}
            icon={Repeat}
            trend={`${stats.retainedUsers} unique`}
            loading={loading}
            gradient="emerald"
            onClick={() => setSelectedStat("retention")}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <RevenueChart data={revenueData} loading={loading} />
          <RecentOrders />
        </div>

        <Dialog open={selectedStat !== null} onOpenChange={(open) => !open && setSelectedStat(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden">
            {selectedStat && (
              <div className="max-h-[85vh] overflow-y-auto pr-2">
                <DialogHeader>
                  <DialogTitle>{statDetails[selectedStat].title}</DialogTitle>
                  <DialogDescription>{statDetails[selectedStat].description}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Current value</p>
                    <p className="mt-1 text-2xl font-heading font-bold text-foreground">{statDetails[selectedStat].value}</p>
                  </div>

                  {selectedStat === "retention" ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          <CircleHelp className="w-4 h-4 text-muted-foreground" />
                          What this means
                        </div>
                        <p className="text-sm text-muted-foreground leading-6">{statDetails[selectedStat].explanation}</p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3 text-sm">
                        <div className="rounded-xl border border-border/50 bg-card p-3">
                          <p className="text-xs text-muted-foreground">Weekly retained</p>
                          <p className="mt-1 font-semibold">{retentionBreakdown.retainedWeekly.length} users</p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-card p-3">
                          <p className="text-xs text-muted-foreground">Monthly retained</p>
                          <p className="mt-1 font-semibold">{retentionBreakdown.retainedMonthly.length} users</p>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-card p-3">
                          <p className="text-xs text-muted-foreground">Not retained</p>
                          <p className="mt-1 font-semibold">{retentionBreakdown.notRetained.length} users</p>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <div className="rounded-xl border border-border/50 bg-card p-4">
                          <h4 className="text-sm font-semibold text-foreground">Weekly retained users</h4>
                          <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                            {retentionBreakdown.retainedWeekly.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No weekly retained users.</p>
                            ) : (
                              retentionBreakdown.retainedWeekly.map((user) => (
                                <div key={`weekly-${user.userId}`} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                                    <p className="text-xs text-muted-foreground">{user.phone || "No phone"}</p>
                                  </div>
                                  <p className="text-xs text-emerald-700 font-medium">{user.reason}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-card p-4">
                          <h4 className="text-sm font-semibold text-foreground">Monthly retained users</h4>
                          <div className="mt-3 space-y-2 max-h-44 overflow-auto pr-1">
                            {retentionBreakdown.retainedMonthly.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No monthly retained users.</p>
                            ) : (
                              retentionBreakdown.retainedMonthly.map((user) => (
                                <div key={`monthly-${user.userId}`} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                                    <p className="text-xs text-muted-foreground">{user.phone || "No phone"}</p>
                                  </div>
                                  <p className="text-xs text-emerald-700 font-medium">{user.reason}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/50 bg-card p-4">
                          <h4 className="text-sm font-semibold text-foreground">Users not retained</h4>
                          <div className="mt-3 space-y-2 max-h-52 overflow-auto pr-1">
                            {retentionBreakdown.notRetained.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Every known user currently has an active qualifying subscription.</p>
                            ) : (
                              retentionBreakdown.notRetained.map((user) => (
                                <div key={`not-retained-${user.userId}`} className="flex items-start justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{user.name}</p>
                                    <p className="text-xs text-muted-foreground">{user.phone || "No phone"}</p>
                                  </div>
                                  <p className="text-xs text-rose-700 font-medium text-right">{user.reason}</p>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-border/50 bg-card p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <CircleHelp className="w-4 h-4 text-muted-foreground" />
                        What this means
                      </div>
                      <p className="text-sm text-muted-foreground leading-6">{statDetails[selectedStat].explanation}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
