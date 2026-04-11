import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface PaymentDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: any;
}

export const PaymentDetailSheet = ({ open, onOpenChange, payment }: PaymentDetailSheetProps) => {
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
            <Badge variant={getStatusBadge(payment.status)}>
              {payment.status}
            </Badge>
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
