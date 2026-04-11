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
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          orders!inner(order_number, user_id)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch user profiles separately
      const paymentsWithProfiles = await Promise.all(
        (data || []).map(async (payment) => {
          const { data: profile } = await supabase
            .from("profiles")
            .select("first_name, last_name")
            .eq("id", payment.orders.user_id)
            .single();

          return {
            ...payment,
            profiles: profile,
          };
        })
      );

      setPayments(paymentsWithProfiles as Payment[]);
    } catch (error: any) {
      toast.error("Failed to fetch payments");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPayments = payments.filter((payment) =>
    payment.orders?.order_number.toLowerCase().includes(search.toLowerCase()) ||
    payment.payment_method.toLowerCase().includes(search.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      completed: "default",
      partial: "secondary",
      pending: "secondary",
      failed: "destructive",
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
        />
      </div>
    </DashboardLayout>
  );
};

export default Payments;
