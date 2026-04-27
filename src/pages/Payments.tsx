import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Download, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { exportToCSV } from "@/lib/csvExport";
import { PaymentDetailSheet } from "@/components/payments/PaymentDetailSheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

interface Payment {
  id: string; record_id?: string; order_id: string; amount: number;
  status: string; payment_method: string; created_at: string;
  processed_at: string | null; currency: string;
  orders: { order_number: string; user_id: string; };
  profiles?: { first_name: string; last_name: string; };
}

const statusStyles: Record<string, string> = {
  completed: "status-completed", paid: "status-paid",
  partial: "status-confirmed", pending: "status-pending",
  failed: "status-failed", refunded: "status-preparing",
};

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => { fetchPayments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchPayments = async () => {
    try {
      const [{ data: paymentRows, error: paymentsError }, { data: orderRows, error: ordersError }] =
        await Promise.all([
          supabase.from("payments").select("*").order("created_at", { ascending: false }),
          supabase.from("orders").select(`id, order_number, user_id, total_amount, payment_status, payment_method, created_at`).order("created_at", { ascending: false }),
        ]);
      if (paymentsError) throw paymentsError;
      if (ordersError) throw ordersError;
      const orderMap = Object.fromEntries((orderRows || []).map((order) => [order.id, order]));
      const userIds = Array.from(new Set((orderRows || []).map((order) => order.user_id).filter(Boolean)));
      let profileMap: Record<string, { first_name: string; last_name: string }> = {};
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds);
        if (profilesError) throw profilesError;
        profileMap = Object.fromEntries((profilesData || []).map((profile) => [profile.id, { first_name: profile.first_name || "", last_name: profile.last_name || "" }]));
      }
      const paymentsWithProfiles = (paymentRows || []).map((payment) => {
        const order = orderMap[payment.order_id];
        if (!order) return null;
        return { ...payment, record_id: payment.id, status: toUiPaymentStatus(payment.status), payment_method: payment.payment_method || order.payment_method || "unknown", currency: payment.currency || "ETB", orders: { order_number: order.order_number, user_id: order.user_id }, profiles: profileMap[order.user_id] || { first_name: "", last_name: "" } };
      }).filter(Boolean);
      const ordersMissingPayments = (orderRows || []).filter((order) => !paymentsWithProfiles.some((payment) => payment.order_id === order.id)).map((order) => ({
        id: `order-${order.id}`, record_id: undefined, order_id: order.id, amount: order.total_amount, status: toUiPaymentStatus(order.payment_status), payment_method: order.payment_method || "unknown", created_at: order.created_at, processed_at: null, currency: "ETB", orders: { order_number: order.order_number, user_id: order.user_id }, profiles: profileMap[order.user_id] || { first_name: "", last_name: "" },
      }));
      const combinedPayments = [...paymentsWithProfiles, ...ordersMissingPayments].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
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

  const handleExportCSV = () => {
    const exportData = filteredPayments.map(payment => ({
      order_number: payment.orders?.order_number || '', customer_name: payment.profiles ? `${payment.profiles.first_name} ${payment.profiles.last_name}` : '', amount: payment.amount, currency: payment.currency, payment_method: payment.payment_method, status: payment.status, created_at: new Date(payment.created_at).toLocaleString(), processed_at: payment.processed_at ? new Date(payment.processed_at).toLocaleString() : '',
    }));
    exportToCSV(exportData, 'payments', ['order_number', 'customer_name', 'amount', 'currency', 'payment_method', 'status', 'created_at', 'processed_at']);
    toast.success('Payments exported successfully');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="font-heading">Payments</h1>
          <p className="text-muted-foreground mt-1">Track all payment transactions</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search payments..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 search-input" />
          </div>
          <Button onClick={handleExportCSV} variant="outline" className="rounded-xl h-10">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <Table className="modern-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
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
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading payments...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <CreditCard className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No payments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id} className="cursor-pointer border-border/50" onClick={() => { setSelectedPayment(payment); setSheetOpen(true); }}>
                    <TableCell className="font-semibold text-foreground">{payment.orders?.order_number}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {payment.profiles ? `${payment.profiles.first_name} ${payment.profiles.last_name}` : <span className="text-muted-foreground/50">-</span>}
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{payment.currency} {payment.amount.toLocaleString()}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground capitalize">{payment.payment_method}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`status-badge ${statusStyles[payment.status] || 'status-pending'}`}>{payment.status}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{new Date(payment.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{payment.processed_at ? new Date(payment.processed_at).toLocaleDateString() : "-"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </motion.div>

        <PaymentDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} payment={selectedPayment} onUpdate={fetchPayments} />
      </div>
    </DashboardLayout>
  );
};

export default Payments;
