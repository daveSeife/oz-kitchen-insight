import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { Users, TrendingUp, DollarSign, CheckCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface Referral {
  id: string; referral_token: string; status: string; created_at: string;
  converted_at: string | null;
  profiles: { first_name: string; last_name: string; } | null;
}

interface Commission {
  id: string; payment_amount: number; commission_amount: number;
  commission_rate: number; status: string; created_at: string;
}

const statusStyles: Record<string, string> = {
  pending: "status-pending", converted: "status-converted", expired: "status-expired",
};

const PartnerDashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerInfo, setPartnerInfo] = useState<any>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [stats, setStats] = useState({ totalReferrals: 0, convertedReferrals: 0, totalCommissions: 0, pendingCommissions: 0 });

  useEffect(() => { checkPartnerAuth(); }, []);

  useEffect(() => {
    if (partnerId) {
      fetchPartnerData();
      const referralsChannel = supabase.channel('partner-referrals')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals', filter: `partner_id=eq.${partnerId}` }, () => { fetchPartnerData(); })
        .subscribe();
      const commissionsChannel = supabase.channel('partner-commissions')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partner_commissions', filter: `partner_id=eq.${partnerId}` }, () => { fetchPartnerData(); })
        .subscribe();
      return () => { supabase.removeChannel(referralsChannel); supabase.removeChannel(commissionsChannel); };
    }
  }, [partnerId]);

  const checkPartnerAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate("/login"); return; }
    const { data: partnerData } = await supabase.from("partners").select("*").eq("contact_email", session.user.email).eq("status", "active").single();
    if (!partnerData) { toast.error("Partner account not found"); await supabase.auth.signOut(); navigate("/login"); return; }
    setPartnerId(partnerData.id);
    setPartnerInfo(partnerData);
  };

  const fetchPartnerData = async () => {
    if (!partnerId) return;
    try {
      const { data: referralsData, error: referralsError } = await supabase.from("referrals").select("*, profiles(first_name, last_name)").eq("partner_id", partnerId).order("created_at", { ascending: false }).limit(10);
      if (referralsError) throw referralsError;
      const { data: commissionsData, error: commissionsError } = await supabase.from("partner_commissions").select("*").eq("partner_id", partnerId).order("created_at", { ascending: false });
      if (commissionsError) throw commissionsError;
      setReferrals(referralsData || []);
      setCommissions(commissionsData || []);
      const totalCommissions = commissionsData?.reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;
      const pendingCommissions = commissionsData?.filter((c) => c.status === "pending").reduce((sum, c) => sum + Number(c.commission_amount), 0) || 0;
      const converted = referralsData?.filter((r) => r.status === "converted").length || 0;
      setStats({ totalReferrals: referralsData?.length || 0, convertedReferrals: converted, totalCommissions, pendingCommissions });
    } catch (error: any) {
      toast.error("Failed to fetch partner data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="page-header">
          <h1 className="font-heading">Partner Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome, {partnerInfo?.name} · Code: <code className="text-xs font-mono bg-muted/70 px-2 py-1 rounded-lg">{partnerInfo?.partner_code}</code>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard title="Total Referrals" value={stats.totalReferrals} icon={Users} loading={loading} gradient="primary" />
          <StatsCard title="Converted" value={stats.convertedReferrals} icon={CheckCircle} loading={loading} gradient="emerald" />
          <StatsCard title="Total Commissions" value={`ETB ${stats.totalCommissions.toLocaleString()}`} icon={DollarSign} loading={loading} gradient="secondary" />
          <StatsCard title="Pending Payout" value={`ETB ${stats.pendingCommissions.toLocaleString()}`} icon={TrendingUp} loading={loading} gradient="violet" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden p-5"
          >
            <h2 className="text-lg font-heading font-bold mb-4">Recent Referrals</h2>
            <Table className="modern-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {referrals.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No referrals yet</TableCell></TableRow>
                ) : (
                  referrals.map((referral) => (
                    <TableRow key={referral.id} className="border-border/50">
                      <TableCell className="text-foreground">
                        {referral.profiles ? `${referral.profiles.first_name} ${referral.profiles.last_name}` : <span className="text-muted-foreground">Pending</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`status-badge ${statusStyles[referral.status] || 'status-pending'}`}>{referral.status}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{new Date(referral.created_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}
            className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden p-5"
          >
            <h2 className="text-lg font-heading font-bold mb-4">Recent Commissions</h2>
            <Table className="modern-table">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead>Amount</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissions.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No commissions yet</TableCell></TableRow>
                ) : (
                  commissions.slice(0, 5).map((commission) => (
                    <TableRow key={commission.id} className="border-border/50">
                      <TableCell className="font-semibold tabular-nums">ETB {commission.commission_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{commission.commission_rate}%</TableCell>
                      <TableCell>
                        <span className={`status-badge ${commission.status === "paid" ? 'status-paid' : 'status-pending'}`}>{commission.status}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default PartnerDashboard;
