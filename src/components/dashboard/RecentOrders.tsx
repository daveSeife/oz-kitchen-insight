import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  mealCount: number;
  nextSchedule: string;
}

const statusStyles: Record<string, string> = {
  pending: "status-pending",
  confirmed: "status-confirmed",
  preparing: "status-preparing",
  delivered: "status-delivered",
  cancelled: "status-cancelled",
};

export const RecentOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRecentOrders();
  }, []);

  const fetchRecentOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total_amount, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;

      const orderIds = (data || []).map((order) => order.id);
      const { data: orderMealsData, error: orderMealsError } =
        orderIds.length > 0
          ? await supabase
              .from("order_meals")
              .select("order_id, quantity, scheduled_date, scheduled_time_slot, status")
              .in("order_id", orderIds)
          : { data: [], error: null };

      const mealsByOrder = new Map<string, Array<{ quantity: number | null; scheduled_date: string; scheduled_time_slot: string; status: string; }>>();

      if (!orderMealsError) {
        for (const meal of orderMealsData || []) {
          const existing = mealsByOrder.get(meal.order_id) || [];
          existing.push(meal);
          mealsByOrder.set(meal.order_id, existing);
        }
      }

      setOrders(
        (data || []).map((order) => {
          const meals = mealsByOrder.get(order.id) || [];
          const activeMeals = meals
            .filter((meal) => meal.status !== "cancelled")
            .sort((left, right) =>
              `${left.scheduled_date || ""}|${left.scheduled_time_slot || ""}`.localeCompare(
                `${right.scheduled_date || ""}|${right.scheduled_time_slot || ""}`,
              ),
            );
          const nextMeal = activeMeals[0];
          return {
            ...order,
            mealCount: meals.reduce((sum, meal) => sum + Number(meal.quantity || 0), 0),
            nextSchedule: nextMeal
              ? `${nextMeal.scheduled_date}${nextMeal.scheduled_time_slot ? `, ${nextMeal.scheduled_time_slot}` : ""}`
              : "No structured meals yet",
          };
        }),
      );
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-border/50 shadow-card">
        <CardHeader><CardTitle className="font-heading text-lg">Recent Orders</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
    >
      <Card className="border-border/50 shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-heading text-lg">Recent Orders</CardTitle>
            <a href="/orders" className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </a>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {orders.map((order, index) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
                className="flex items-center gap-4 p-3 rounded-xl hover:bg-muted/50 transition-colors group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/8 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/12 transition-colors">
                  <Clock className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{order.order_number}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.mealCount} meals · {new Date(order.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    ETB {order.total_amount.toLocaleString()}
                  </p>
                  <span className={`status-badge ${statusStyles[order.status] || "status-pending"}`}>
                    {order.status}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
