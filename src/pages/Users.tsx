import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search, Users as UsersIcon, ShieldCheck, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getAdminAccess } from "@/lib/adminAuth";
import { motion } from "framer-motion";

interface Profile {
  id: string; first_name: string; last_name: string; phone_number: string;
  role: string; created_at: string; referral_partner_id: string;
  admin_role?: string; is_admin?: boolean;
}

const Users = () => {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [currentUserIsSuperAdmin, setCurrentUserIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkSuperAdmin();
    fetchUsers();
    const channel = supabase
      .channel('profiles-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => { fetchUsers(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const adminAccess = await getAdminAccess(user.id);
      if (adminAccess.role === 'super_admin') setCurrentUserIsSuperAdmin(true);
    } catch (error) {
      console.error('Error checking super admin:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles").select("*").order("created_at", { ascending: false });
      if (profilesError) throw profilesError;
      const { data: adminData } = await supabase.from("admin_users").select("id, role, is_active");
      const adminMap = new Map(adminData?.map(a => [a.id, a]) || []);
      const enrichedUsers = (profilesData || []).map(profile => {
        const admin = adminMap.get(profile.id);
        return { ...profile, admin_role: admin?.role, is_admin: admin?.is_active || false };
      });
      setUsers(enrichedUsers);
    } catch (error: any) {
      toast.error("Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  const promoteToAdmin = async (userId: string, role: string = 'admin') => {
    try {
      const { error } = await supabase.rpc('promote_user_to_admin', { target_user_id: userId, admin_role: role });
      if (error) throw error;
      toast.success(`User promoted to ${role} successfully`);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to promote user");
    }
  };

  const filteredUsers = users.filter((user) =>
    `${user.first_name} ${user.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    user.phone_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="font-heading">Users</h1>
          <p className="text-muted-foreground mt-1">Manage platform users</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 search-input" />
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <Table className="modern-table">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Admin Role</TableHead>
                <TableHead>Referred</TableHead>
                <TableHead>Joined</TableHead>
                {currentUserIsSuperAdmin && <TableHead className="w-[60px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={currentUserIsSuperAdmin ? 6 : 5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={currentUserIsSuperAdmin ? 6 : 5} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3">
                      <UsersIcon className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No users found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id} className="border-border/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-semibold text-primary">
                            {(user.first_name || "?").charAt(0)}{(user.last_name || "").charAt(0)}
                          </span>
                        </div>
                        <span className="font-semibold text-foreground">{user.first_name} {user.last_name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{user.phone_number || "-"}</TableCell>
                    <TableCell>
                      {user.is_admin ? (
                        <span className="status-badge status-active">
                          <ShieldCheck className="w-3 h-3" />
                          {user.admin_role || "admin"}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-muted/70 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">user</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.referral_partner_id ? (
                        <span className="status-badge bg-secondary/10 text-secondary ring-1 ring-inset ring-secondary/20">Yes</span>
                      ) : (
                        <span className="text-muted-foreground text-sm">No</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">{new Date(user.created_at).toLocaleDateString()}</TableCell>
                    {currentUserIsSuperAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={() => promoteToAdmin(user.id, 'admin')}>Promote to Admin</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => promoteToAdmin(user.id, 'super_admin')}>Promote to Super Admin</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
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

export default Users;
