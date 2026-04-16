import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { RecentOrders } from "@/components/dashboard/RecentOrders";
import { RevenueChart } from "@/components/dashboard/RevenueChart";
import { Users, ShoppingBag, TrendingUp, UtensilsCrossed } from "lucide-react";
import { getAdminAccess } from "@/lib/adminAuth";

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    activeUsers: 0,
    totalMeals: 0,
  });
  const [revenueData, setRevenueData] = useState<{ name: string; revenue: number }[]>([]);

  useEffect(() => {
    checkAuth();
    fetchStats();
    fetchRevenueData();
  }, []);

  const checkAuth = async () => {
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
  };

  const fetchStats = async () => {
    try {
      const [ordersRes, usersRes, mealsRes] = await Promise.all([
        supabase.from("orders").select("total_amount", { count: "exact" }),
        supabase.from("profiles").select("id", { count: "exact" }),
        supabase.from("meals").select("id", { count: "exact" }),
      ]);

      const totalRevenue = ordersRes.data?.reduce((sum, order) => sum + Number(order.total_amount), 0) || 0;

      setStats({
        totalOrders: ordersRes.count || 0,
        totalRevenue,
        activeUsers: usersRes.count || 0,
        totalMeals: mealsRes.count || 0,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRevenueData = async () => {
    try {
      // Fetch orders from the last 6 months
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const { data: orders } = await supabase
        .from("orders")
        .select("created_at, total_amount")
        .gte("created_at", sixMonthsAgo.toISOString())
        .order("created_at", { ascending: true });

      if (orders) {
        // Group by month
        const monthlyRevenue = new Map<string, number>();
        
        orders.forEach((order) => {
          const date = new Date(order.created_at);
          const monthKey = date.toLocaleString('en-US', { month: 'short' });
          const current = monthlyRevenue.get(monthKey) || 0;
          monthlyRevenue.set(monthKey, current + Number(order.total_amount));
        });

        // Convert to chart format
        const chartData = Array.from(monthlyRevenue.entries()).map(([name, revenue]) => ({
          name,
          revenue: Math.round(revenue),
        }));

        setRevenueData(chartData);
      }
    } catch (error) {
      console.error("Error fetching revenue data:", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back! Here's your overview.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Orders"
            value={stats.totalOrders}
            icon={ShoppingBag}
            trend="+12.5%"
            loading={loading}
          />
          <StatsCard
            title="Total Revenue"
            value={`ETB ${stats.totalRevenue.toLocaleString()}`}
            icon={TrendingUp}
            trend="+8.2%"
            loading={loading}
          />
          <StatsCard
            title="Active Users"
            value={stats.activeUsers}
            icon={Users}
            trend="+23.1%"
            loading={loading}
          />
          <StatsCard
            title="Total Meals"
            value={stats.totalMeals}
            icon={UtensilsCrossed}
            trend="+5.4%"
            loading={loading}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <RevenueChart data={revenueData} loading={loading} />
          <RecentOrders />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
