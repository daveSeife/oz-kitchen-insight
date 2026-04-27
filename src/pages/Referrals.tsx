import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

interface Referral {
  id: string; referral_token: string; status: string; created_at: string;
  converted_at: string; expires_at: string;
  partners: { name: string; partner_code: string; };
  profiles: { first_name: string; last_name: string; } | null;
}

const statusStyles: Record<string, string> = {
  pending: "status-pending", converted: "status-converted", expired: "status-expired",
};

const Referrals = () => {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchReferrals();
    const channel = supabase
      .channel('referrals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'referrals' }, () => { fetchReferrals(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchReferrals = async () => {
    try {
      const { data, error } = await supabase
        .from("referrals")
        .select("*, partners(name, partner_code), profiles(first_name, last_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setReferrals(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch referrals");
    } finally {
      setLoading(false);
    }
  };

  const filteredReferrals = referrals.filter((referral) =>
    referral.referral_token.toLowerCase().includes(search.toLowerCase()) ||
    referral.partners?.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="font-heading">Referrals</h1>
          <p className="text-muted-foreground mt-1">Track referral conversions</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search referrals..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 search-input" />
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <Table className="modern-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Token</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Converted</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading referrals...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredReferrals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <UserCheck className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No referrals found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredReferrals.map((referral) => (
                  <TableRow key={referral.id} className="border-border/50">
                    <TableCell>
                      <code className="text-xs font-mono bg-muted/70 px-2 py-1 rounded-lg">{referral.referral_token.slice(0, 8)}...</code>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-semibold text-foreground text-sm">{referral.partners?.name}</p>
                        <p className="text-[11px] text-muted-foreground font-mono">{referral.partners?.partner_code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {referral.profiles ? `${referral.profiles.first_name} ${referral.profiles.last_name}` : <span className="text-muted-foreground/50">-</span>}
                    </TableCell>
                    <TableCell>
                      <span className={`status-badge ${statusStyles[referral.status] || 'status-pending'}`}>{referral.status}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{new Date(referral.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{referral.converted_at ? new Date(referral.converted_at).toLocaleDateString() : "-"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{new Date(referral.expires_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </motion.div>
      </div>
    </DashboardLayout>
  );
};

export default Referrals;
