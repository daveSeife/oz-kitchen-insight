import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { motion } from "framer-motion";

interface Partner {
  id: string; name: string; partner_code: string; commission_rate: number;
  status: string; contact_email: string; created_at: string;
}

const Partners = () => {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPartners();
    const channel = supabase
      .channel('partners-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partners' }, () => { fetchPartners(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchPartners = async () => {
    try {
      const { data, error } = await supabase.from("partners").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      setPartners(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch partners");
    } finally {
      setLoading(false);
    }
  };

  const filteredPartners = partners.filter((partner) =>
    partner.name.toLowerCase().includes(search.toLowerCase()) ||
    partner.partner_code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="font-heading">Partners</h1>
          <p className="text-muted-foreground mt-1">Manage referral partners</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search partners..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 search-input" />
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <Table className="modern-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Name</TableHead>
                <TableHead>Partner Code</TableHead>
                <TableHead>Commission Rate</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Contact Email</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading partners...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredPartners.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <Users className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No partners found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredPartners.map((partner) => (
                  <TableRow key={partner.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-secondary">{partner.name.charAt(0)}</span>
                        </div>
                        <span className="font-semibold text-foreground">{partner.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="text-xs font-mono bg-muted/70 px-2 py-1 rounded-lg">{partner.partner_code}</code>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{partner.commission_rate}%</TableCell>
                    <TableCell>
                      <span className={`status-badge ${partner.status === 'active' ? 'status-active' : 'status-pending'}`}>{partner.status}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{partner.contact_email || "-"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{new Date(partner.created_at).toLocaleDateString()}</TableCell>
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

export default Partners;
