import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Order {
  id: string;
  order_number: string;
  total_amount: number;
  status: string;
  created_at: string;
  mealCount: number;
  nextSchedule: string;
}

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

      const mealsByOrder = new Map<
        string,
        Array<{
          quantity: number | null;
          scheduled_date: string;
          scheduled_time_slot: string;
          status: string;
        }>
      >();

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

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      confirmed: "bg-blue-100 text-blue-800",
      preparing: "bg-purple-100 text-purple-800",
      delivered: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Orders</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center justify-between p-4 rounded-lg border hover:bg-accent/5 transition-colors"
            >
              <div className="flex-1">
                <p className="font-medium">{order.order_number}</p>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {order.mealCount} meals - {order.nextSchedule}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="font-semibold">ETB {order.total_amount.toLocaleString()}</p>
                <Badge className={getStatusColor(order.status)}>
                  {order.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
