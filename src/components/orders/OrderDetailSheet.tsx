import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle, AlertCircle } from "lucide-react";

interface OrderDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: any;
  onUpdate?: () => void;
}

export const OrderDetailSheet = ({ open, onOpenChange, order, onUpdate }: OrderDetailSheetProps) => {
  const [updating, setUpdating] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<string>(order?.payment_status || "pending");

  useEffect(() => {
    setPaymentStatus(order?.payment_status || "pending");
  }, [order?.id, order?.payment_status]);

  if (!order) return null;

  const items = order.items || order.meal_plans?.meal_plan_items;

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
    if (status === "failed") return "failed";
    return "pending";
  };

  const handlePaymentStatusUpdate = async (newStatus: string) => {
    setUpdating(true);
    try {
      // Update the order payment status
      const { error: orderError } = await supabase
        .from("orders")
        .update({ payment_status: newStatus })
        .eq("id", order.id);

      if (orderError) throw orderError;

      // If there's a payment record, update it too
      const { data: paymentData, error: paymentLookupError } = await supabase
        .from("payments")
        .select("id")
        .eq("order_id", order.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (paymentLookupError) {
        throw paymentLookupError;
      }

      if (paymentData) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update({ 
            status: mapOrderPaymentStatusToPaymentStatus(newStatus),
            processed_at: newStatus === 'completed' ? new Date().toISOString() : null
          })
          .eq("id", paymentData.id);

        if (paymentError) throw paymentError;
      }

      setPaymentStatus(newStatus);
      toast.success(`Payment status updated to ${newStatus}`);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payment status");
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
            <p className="text-sm">
              {order.profiles?.first_name} {order.profiles?.last_name}
            </p>
          </div>

          <Separator />

          {/* Delivery Address */}
          {order.delivery_address && (
            <>
              <div>
                <h4 className="font-medium mb-2">Delivery Address</h4>
                <div className="text-sm space-y-1">
                  {order.delivery_address.fullName && (
                    <p className="font-medium">{order.delivery_address.fullName}</p>
                  )}
                  {order.delivery_address.phone && (
                    <p>Phone: {order.delivery_address.phone}</p>
                  )}
                  {order.delivery_address.street?.street && (
                    <p>{order.delivery_address.street.street}</p>
                  )}
                  {order.delivery_address.street?.city && (
                    <p>{order.delivery_address.street.city}</p>
                  )}
                  {order.delivery_address.street?.zone && (
                    <p>Zone: {order.delivery_address.street.zone}</p>
                  )}
                  {order.delivery_address.street?.building_number && (
                    <p>Building: {order.delivery_address.street.building_number}</p>
                  )}
                  {order.delivery_address.street?.floor && (
                    <p>Floor: {order.delivery_address.street.floor}</p>
                  )}
                  {order.delivery_address.street?.landmark && (
                    <p>Landmark: {order.delivery_address.street.landmark}</p>
                  )}
                  {order.delivery_address.street?.special_instructions && (
                    <p className="text-muted-foreground italic">
                      {order.delivery_address.street.special_instructions}
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
              <Badge variant={paymentStatus === 'completed' ? 'default' : 'secondary'}>
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

          {/* Order Items */}
          {items && items.length > 0 && (
            <>
              <div>
                <h4 className="font-medium mb-3">Order Items</h4>
                <div className="space-y-3">
                  {items.map((item: any) => (
                    <div key={item.id} className="flex gap-3 p-3 border rounded-lg">
                      {item.is_half_half || (item.half_meal_1 && item.half_meal_2) ? (
                        <div className="flex-1">
                          <div className="flex gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              {item.half_meal_1?.image_url && (
                                <img 
                                  src={item.half_meal_1.image_url} 
                                  alt={item.half_meal_1.name}
                                  className="w-12 h-12 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium">{item.half_meal_1?.name}</p>
                                <p className="text-xs text-muted-foreground">Half portion</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                              {item.half_meal_2?.image_url && (
                                <img 
                                  src={item.half_meal_2.image_url} 
                                  alt={item.half_meal_2.name}
                                  className="w-12 h-12 object-cover rounded"
                                />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium">{item.half_meal_2?.name}</p>
                                <p className="text-xs text-muted-foreground">Half portion</p>
                              </div>
                            </div>
                          </div>
                          {item.delivery_date && (
                            <p className="text-xs text-muted-foreground mt-2">
                              Delivery: {new Date(item.delivery_date).toLocaleDateString('en-US', { 
                                weekday: 'short', 
                                month: 'short', 
                                day: 'numeric' 
                              })}
                              {item.delivery_time_slot && ` (${item.delivery_time_slot})`}
                            </p>
                          )}
                          <div className="flex justify-between items-center mt-1">
                            <p className="text-sm">Qty: {item.quantity}</p>
                            <p className="text-sm font-medium">ETB {item.unit_price?.toLocaleString?.() ?? item.unit_price}</p>
                          </div>
                        </div>
                      ) : (
                        <>
                          {item.meals?.image_url && (
                            <img 
                              src={item.meals.image_url} 
                              alt={item.meals.name}
                              className="w-16 h-16 object-cover rounded"
                            />
                          )}
                          <div className="flex-1">
                            <p className="font-medium">{item.meals?.name || 'Meal'}</p>
                            <p className="text-sm text-muted-foreground capitalize">{item.meal_type}</p>
                            {item.delivery_date && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Delivery: {new Date(item.delivery_date).toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                                {item.delivery_time_slot && ` (${item.delivery_time_slot})`}
                              </p>
                            )}
                            <div className="flex justify-between items-center mt-1">
                              <p className="text-sm">Qty: {item.quantity}</p>
                              <p className="text-sm font-medium">ETB {item.unit_price?.toLocaleString?.() ?? item.unit_price}</p>
                            </div>
                          </div>
                        </>
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
