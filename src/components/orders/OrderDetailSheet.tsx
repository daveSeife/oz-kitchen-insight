import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, AlertCircle } from "lucide-react";
import {
  formatAddressText,
  getDeliveryContactName,
  getDeliveryContactPhone,
  getMealDayName,
  normalizeDeliveryAddress,
  type NormalizedOrderMeal,
  sortNormalizedMeals,
} from "@/lib/orderMeals";

interface OrderDetailSheetOrder {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  notes: string | null;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  delivery_address: unknown;
  profiles?: {
    first_name?: string | null;
    last_name?: string | null;
    phone_number?: string | null;
  };
  meals: NormalizedOrderMeal[];
}

interface OrderDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetailSheetOrder | null;
  onUpdate?: () => void;
}

export const OrderDetailSheet = ({ open, onOpenChange, order, onUpdate }: OrderDetailSheetProps) => {
  const [updating, setUpdating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>("pending");
  const [paymentRecordId, setPaymentRecordId] = useState<string | null>(null);

  const toUiPaymentStatus = (value?: string | null) => {
    if (value === "paid") return "completed";
    return value || "pending";
  };

  const toOrderPaymentStatus = (value: string) => {
    if (value === "completed") return "paid";
    if (value === "partial") return "pending";
    return value;
  };

  useEffect(() => {
    const loadPaymentStatus = async () => {
      if (!order?.id) {
        setPaymentStatus("pending");
        setPaymentRecordId(null);
        return;
      }

      const { data: paymentData, error } = await supabase
        .from("payments")
        .select("id, status")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error(error);
      }

      setPaymentRecordId(paymentData?.id || null);
      setPaymentStatus(toUiPaymentStatus(paymentData?.status || order.payment_status));
    };

    void loadPaymentStatus();
  }, [order?.id, order?.payment_status]);

  if (!order) return null;

  const meals = sortNormalizedMeals(order.meals || []);
  const deliveryAddress = normalizeDeliveryAddress(order.delivery_address);
  const customerName = getDeliveryContactName(
    order.delivery_address,
    `${order.profiles?.first_name || ""} ${order.profiles?.last_name || ""}`.trim(),
  );
  const customerPhone = getDeliveryContactPhone(
    order.delivery_address,
    order.profiles?.phone_number || "",
  );
  const mealTotals = meals.reduce(
    (summary: { total: number; remaining: number; delivered: number; cancelled: number }, meal) => {
      const quantity = Number(meal.quantity || 0);
      summary.total += quantity;

      if (meal.status === "delivered") {
        summary.delivered += quantity;
      } else if (meal.status === "cancelled") {
        summary.cancelled += quantity;
      } else {
        summary.remaining += quantity;
      }

      return summary;
    },
    { total: 0, remaining: 0, delivered: 0, cancelled: 0 },
  );

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

  const mapOrderPaymentStatusToPaymentStatus = (status: string) => {
    if (status === "completed") return "completed";
    if (status === "partial") return "partial";
    if (status === "failed") return "failed";
    if (status === "refunded") return "refunded";
    return "pending";
  };

  const handlePaymentStatusUpdate = async (newStatus: string) => {
    setUpdating(true);
    try {
      // Update the order payment status
      const { error: orderError } = await supabase
        .from("orders")
        .update({ payment_status: toOrderPaymentStatus(newStatus) })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // If there's a payment record, update it too
      const processedAt =
        newStatus === "completed" || newStatus === "partial"
          ? new Date().toISOString()
          : null;
      const paymentRecordStatus = mapOrderPaymentStatusToPaymentStatus(newStatus);

      if (paymentRecordId) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update({ 
            status: paymentRecordStatus,
            processed_at: processedAt,
          })
          .eq("id", paymentRecordId);

        if (paymentError) throw paymentError;
      } else {
        const { data: newPayment, error: paymentInsertError } = await supabase
          .from("payments")
          .insert({
            order_id: order.id,
            amount: order.total_amount,
            payment_method: order.payment_method || "cash",
            currency: "ETB",
            status: paymentRecordStatus,
            processed_at: processedAt,
          })
          .select("id")
          .single();

        if (paymentInsertError) throw paymentInsertError;

        setPaymentRecordId(newPayment.id);
      }

      setPaymentStatus(newStatus);
      toast.success(`Payment status updated to ${newStatus}`);
      onUpdate?.();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to update payment status");
      console.error(error);
    } finally {
      setUpdating(false);
    }
  };

  const handleConfirmUpfrontPayment = () => {
    handlePaymentStatusUpdate('partial');
  };

  const handleConfirmRemainingPayment = () => {
    handlePaymentStatusUpdate('completed');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Order Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Order Header */}
          <div>
            <h3 className="text-lg font-semibold">{order.order_number}</h3>
            <p className="text-sm text-muted-foreground">
              {new Date(order.created_at).toLocaleString()}
            </p>
          </div>

          <Separator />

          {/* Customer Information */}
          <div>
            <h4 className="font-medium mb-2">Customer</h4>
            <div className="text-sm space-y-1">
              <p>{customerName || "Unknown customer"}</p>
              {customerPhone && <p className="text-muted-foreground">{customerPhone}</p>}
            </div>
          </div>

          <Separator />

          {/* Delivery Address */}
          {order.delivery_address && (
            <>
              <div>
                <h4 className="font-medium mb-2">Delivery Address</h4>
                <div className="text-sm space-y-1">
                  {deliveryAddress.contactName && (
                    <p className="font-medium">{deliveryAddress.contactName}</p>
                  )}
                  {deliveryAddress.contactPhone && (
                    <p>Phone: {deliveryAddress.contactPhone}</p>
                  )}
                  {formatAddressText(order.delivery_address) && (
                    <p>{formatAddressText(order.delivery_address)}</p>
                  )}
                  {deliveryAddress.specialInstructions && (
                    <p className="text-muted-foreground italic">
                      {deliveryAddress.specialInstructions}
                    </p>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Order Status */}
          <div>
            <h4 className="font-medium mb-2">Status</h4>
            <div className="flex gap-2">
              <Badge className={getStatusColor(order.status)}>
                {order.status}
              </Badge>
              <Badge variant={paymentStatus === 'completed' ? 'default' : paymentStatus === 'failed' ? 'destructive' : 'secondary'}>
                {paymentStatus}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Manual Payment Confirmation */}
          <div>
            <h4 className="font-medium mb-2">Payment Management</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Select
                  value={paymentStatus}
                  onValueChange={handlePaymentStatusUpdate}
                  disabled={updating}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial (75%)</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <p className="text-xs text-muted-foreground">
                Payment policy: 75% upfront, 25% on delivery.
              </p>
              
              {paymentStatus === 'pending' && (
                <Button 
                  onClick={handleConfirmUpfrontPayment}
                  disabled={updating}
                  className="w-full"
                  variant="default"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {updating ? "Confirming..." : "Confirm 75% Upfront Payment"}
                </Button>
              )}

              {paymentStatus === 'partial' && (
                <Button 
                  onClick={handleConfirmRemainingPayment}
                  disabled={updating}
                  className="w-full"
                  variant="default"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {updating ? "Confirming..." : "Confirm Remaining 25% Payment"}
                </Button>
              )}

              {paymentStatus === 'completed' && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" />
                  Payment confirmed
                </div>
              )}

              {paymentStatus === 'failed' && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Payment failed
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Ordered Meals */}
          {meals.length > 0 && (
            <>
              <div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="font-medium">Ordered Meals</h4>
                  <Badge variant="outline">
                    {mealTotals.total} total meals
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-lg font-semibold">{mealTotals.remaining}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Delivered</p>
                    <p className="text-lg font-semibold">{mealTotals.delivered}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                    <p className="text-lg font-semibold">{mealTotals.cancelled}</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {meals.map((meal) => (
                    <div
                      key={`${meal.id}-${meal.source || "meal"}-${meal.scheduled_date}-${meal.scheduled_time_slot}`}
                      className="p-3 border rounded-lg space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{meal.meal_name}</p>
                          <p className="text-sm text-muted-foreground capitalize">{meal.meal_type}</p>
                        </div>
                        <Badge variant="outline" className="capitalize">
                          {meal.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-muted-foreground">Scheduled Date</p>
                          <p>
                            {meal.scheduled_date
                              ? `${getMealDayName(meal.scheduled_date)}, ${new Date(meal.scheduled_date).toLocaleDateString()}`
                              : "-"}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Scheduled Time</p>
                          <p>{meal.scheduled_time_slot || "-"}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Quantity</p>
                          <p>{meal.quantity}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Price Snapshot</p>
                          <p>ETB {meal.unit_price?.toLocaleString?.() ?? meal.unit_price ?? 0}</p>
                        </div>
                      </div>

                      {meal.customer_note && (
                        <div>
                          <p className="text-sm text-muted-foreground">Meal Notes</p>
                          <p className="text-sm">{meal.customer_note}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Delivery Info */}
          {(order.delivery_date || order.delivery_time_slot) && (
            <>
              <div>
                <h4 className="font-medium mb-2">Delivery</h4>
                <div className="text-sm space-y-1">
                  {order.delivery_date && (
                    <p>Date: {new Date(order.delivery_date).toLocaleDateString()}</p>
                  )}
                  {order.delivery_time_slot && (
                    <p>Time Slot: {order.delivery_time_slot}</p>
                  )}
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Payment Details */}
          <div>
            <h4 className="font-medium mb-2">Payment</h4>
            <div className="text-sm space-y-1">
              {order.payment_method && (
                <p>Method: <span className="capitalize">{order.payment_method}</span></p>
              )}
              <p>Subtotal: ETB {order.subtotal?.toLocaleString() || '0'}</p>
              {order.delivery_fee > 0 && (
                <p>Delivery Fee: ETB {order.delivery_fee.toLocaleString()}</p>
              )}
              {order.discount_amount > 0 && (
                <p className="text-green-600">
                  Discount: -ETB {order.discount_amount.toLocaleString()}
                </p>
              )}
              <p className="font-semibold text-base mt-2">
                Total: ETB {order.total_amount.toLocaleString()}
              </p>
            </div>
          </div>

          {/* Notes */}
          {order.notes && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Notes</h4>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
