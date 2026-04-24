import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csvExport";
import { PaymentDetailSheet } from "@/components/payments/PaymentDetailSheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Payment {
  id: string;
  record_id?: string;
  order_id: string;
  amount: number;
  status: string;
  payment_method: string;
  created_at: string;
  processed_at: string | null;
  currency: string;
  orders: {
    order_number: string;
    user_id: string;
  };
  profiles?: {
    first_name: string;
    last_name: string;
  };
}

const Payments = () => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const toUiPaymentStatus = (value?: string | null) => {
    if (value === "paid") return "completed";
    return value || "pending";
  };

  useEffect(() => {
    fetchPayments();
    
    const channel = supabase
      .channel('payments-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        fetchPayments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchPayments = async () => {
    try {
      const [{ data: paymentRows, error: paymentsError }, { data: orderRows, error: ordersError }] =
        await Promise.all([
          supabase
            .from("payments")
            .select("*")
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select(`
              id,
              order_number,
              user_id,
              total_amount,
              payment_status,
              payment_method,
              created_at
            `)
            .order("created_at", { ascending: false }),
        ]);

      if (paymentsError) throw paymentsError;
      if (ordersError) throw ordersError;

      const orderMap = Object.fromEntries(
        (orderRows || []).map((order) => [order.id, order])
      );

      const userIds = Array.from(
        new Set((orderRows || []).map((order) => order.user_id).filter(Boolean))
      );

      let profileMap: Record<string, { first_name: string; last_name: string }> = {};

      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", userIds);

        if (profilesError) throw profilesError;

        profileMap = Object.fromEntries(
          (profilesData || []).map((profile) => [
            profile.id,
            {
              first_name: profile.first_name || "",
              last_name: profile.last_name || "",
            },
          ])
        );
      }

      const paymentsWithProfiles = (paymentRows || [])
        .map((payment) => {
          const order = orderMap[payment.order_id];

          if (!order) {
            return null;
          }

          return {
            ...payment,
            record_id: payment.id,
            status: toUiPaymentStatus(payment.status),
            payment_method: payment.payment_method || order.payment_method || "unknown",
            currency: payment.currency || "ETB",
            orders: {
              order_number: order.order_number,
              user_id: order.user_id,
            },
            profiles: profileMap[order.user_id] || { first_name: "", last_name: "" },
          };
        })
        .filter(Boolean);

      const ordersMissingPayments = (orderRows || [])
        .filter((order) => !paymentsWithProfiles.some((payment) => payment.order_id === order.id))
        .map((order) => ({
          id: `order-${order.id}`,
          record_id: undefined,
          order_id: order.id,
          amount: order.total_amount,
          status: toUiPaymentStatus(order.payment_status),
          payment_method: order.payment_method || "unknown",
          created_at: order.created_at,
          processed_at: null,
          currency: "ETB",
          orders: {
            order_number: order.order_number,
            user_id: order.user_id,
          },
          profiles: profileMap[order.user_id] || { first_name: "", last_name: "" },
        }));

      const combinedPayments = [...paymentsWithProfiles, ...ordersMissingPayments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setPayments(combinedPayments as Payment[]);
    } catch (error: any) {
      console.error("[Payments] fetchPayments error", error);
      toast.error("Failed to fetch payments");
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = payments.filter((payment) =>
    payment.orders?.order_number.toLowerCase().includes(search.toLowerCase()) ||
    payment.payment_method?.toLowerCase().includes(search.toLowerCase()) ||
    payment.status?.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      partial: "secondary",
      pending: "secondary",
      failed: "destructive",
      refunded: "secondary",
    };
    return variants[status] || "secondary";
  };

  const handleExportCSV = () => {
    const exportData = filteredPayments.map(payment => ({
      order_number: payment.orders?.order_number || '',
      customer_name: payment.profiles ? `${payment.profiles.first_name} ${payment.profiles.last_name}` : '',
      amount: payment.amount,
      currency: payment.currency,
      payment_method: payment.payment_method,
      status: payment.status,
      created_at: new Date(payment.created_at).toLocaleString(),
      processed_at: payment.processed_at ? new Date(payment.processed_at).toLocaleString() : '',
    }));

    exportToCSV(
      exportData,
      'payments',
      ['order_number', 'customer_name', 'amount', 'currency', 'payment_method', 'status', 'created_at', 'processed_at']
    );
    toast.success('Payments exported successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-muted-foreground">Track all payment transactions</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search payments..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Processed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    No payments found
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow 
                    key={payment.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedPayment(payment);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell className="font-medium">
                      {payment.orders?.order_number}
                    </TableCell>
                    <TableCell>
                      {payment.profiles ? (
                        `${payment.profiles.first_name} ${payment.profiles.last_name}`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {payment.currency} {payment.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="capitalize">{payment.payment_method}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadge(payment.status)}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(payment.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {payment.processed_at
                        ? new Date(payment.processed_at).toLocaleDateString()
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <PaymentDetailSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          payment={selectedPayment}
          onUpdate={fetchPayments}
        />
      </div>
    </DashboardLayout>
  );
};

export default Payments;
