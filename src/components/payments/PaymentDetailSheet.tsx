import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertCircle, CheckCircle } from "lucide-react";

interface PaymentDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any;
  onUpdate?: () => void;
}

export const PaymentDetailSheet = ({ open, onOpenChange, payment, onUpdate }: PaymentDetailSheetProps) => {
  const toUiPaymentStatus = (value?: string | null) => {
    if (value === "paid") return "completed";
    return value || "pending";
  };

  const toOrderPaymentStatus = (value: string) => {
    if (value === "completed") return "paid";
    if (value === "partial") return "pending";
    return value;
  };

  const [status, setStatus] = useState<string>(toUiPaymentStatus(payment?.status));
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setStatus(toUiPaymentStatus(payment?.status));
  }, [payment?.id, payment?.status]);

  if (!payment) return null;

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      partial: "secondary",
      pending: "secondary",
      failed: "destructive",
    };
    return variants[status] || "secondary";
  };

  const updatePaymentStatus = async (newStatus: string) => {
    setUpdating(true);

    try {
      const processedAt =
        newStatus === "completed" || newStatus === "partial"
          ? new Date().toISOString()
          : null;

      const { error: orderError } = await supabase
        .from("orders")
        .update({ payment_status: toOrderPaymentStatus(newStatus) })
        .eq("id", payment.order_id);

      if (orderError) throw orderError;

      if (payment.record_id) {
        const { error: paymentError } = await supabase
          .from("payments")
          .update({
            status: newStatus,
            processed_at: processedAt,
          })
          .eq("id", payment.record_id);

        if (paymentError) throw paymentError;
      }

      setStatus(newStatus);
      toast.success(`Payment status updated to ${newStatus}`);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error?.message || "Failed to update payment status");
      console.error(error);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Payment Details</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Payment Header */}
          <div>
            <h3 className="text-lg font-semibold">
              {payment.orders?.order_number || 'N/A'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {new Date(payment.created_at).toLocaleString()}
            </p>
          </div>

          <Separator />

          {/* Customer Information */}
          <div>
            <h4 className="font-medium mb-2">Customer</h4>
            <p className="text-sm">
              {payment.profiles ? (
                `${payment.profiles.first_name} ${payment.profiles.last_name}`
              ) : (
                <span className="text-muted-foreground">Not available</span>
              )}
            </p>
          </div>

          <Separator />

          {/* Payment Amount */}
          <div>
            <h4 className="font-medium mb-2">Amount</h4>
            <p className="text-2xl font-bold">
              {payment.currency} {payment.amount.toLocaleString()}
            </p>
          </div>

          <Separator />

          {/* Payment Method */}
          <div>
            <h4 className="font-medium mb-2">Payment Method</h4>
            <p className="text-sm capitalize">{payment.payment_method}</p>
          </div>

          <Separator />

          {/* Payment Status */}
          <div>
            <h4 className="font-medium mb-2">Status</h4>
            <div className="space-y-3">
              <Badge variant={getStatusBadge(status)}>
                {status}
              </Badge>

              <Select
                value={status}
                onValueChange={updatePaymentStatus}
                disabled={updating}
              >
                <SelectTrigger className="w-48">
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

              {status === "pending" && (
                <Button
                  onClick={() => updatePaymentStatus("partial")}
                  disabled={updating}
                  className="w-full"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {updating ? "Confirming..." : "Confirm"}
                </Button>
              )}

              {status === "partial" && (
                <Button
                  onClick={() => updatePaymentStatus("completed")}
                  disabled={updating}
                  className="w-full"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {updating ? "Confirming..." : "Confirm"}
                </Button>
              )}

              {status === "completed" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" />
                  Payment confirmed
                </div>
              )}

              {status === "failed" && (
                <div className="flex items-center gap-2 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  Payment failed
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Transaction Details */}
          <div>
            <h4 className="font-medium mb-2">Transaction</h4>
            <div className="text-sm space-y-1">
              <p>Created: {new Date(payment.created_at).toLocaleString()}</p>
              {payment.processed_at && (
                <p>Processed: {new Date(payment.processed_at).toLocaleString()}</p>
              )}
              {payment.external_transaction_id && (
                <p className="break-all">
                  Transaction ID: <span className="font-mono text-xs">{payment.external_transaction_id}</span>
                </p>
              )}
            </div>
          </div>

          {/* Commission Info */}
          {(payment.referral_id || payment.commission_eligible !== undefined) && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Commission</h4>
                <div className="text-sm space-y-1">
                  <p>
                    Eligible: {payment.commission_eligible ? 'Yes' : 'No'}
                  </p>
                  <p>
                    Calculated: {payment.commission_calculated ? 'Yes' : 'No'}
                  </p>
                  {payment.referral_id && (
                    <p className="text-muted-foreground text-xs break-all">
                      Referral ID: {payment.referral_id}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Gateway Response */}
          {payment.payment_gateway_response && (
            <>
              <Separator />
              <div>
                <h4 className="font-medium mb-2">Gateway Response</h4>
                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                  {JSON.stringify(payment.payment_gateway_response, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
