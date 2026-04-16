import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, ShieldCheck } from "lucide-react";
import { getAdminAccess } from "@/lib/adminAuth";

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  role: string;
  created_at: string;
  referral_partner_id: string;
  admin_role?: string;
  is_admin?: boolean;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchUsers();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const checkSuperAdmin = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const adminAccess = await getAdminAccess(user.id);

      if (adminAccess.role === 'super_admin') {
        setCurrentUserIsSuperAdmin(true);
      }
    } catch (error) {
      console.error('Error checking super admin:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch admin users
      const { data: adminData } = await supabase
        .from("admin_users")
        .select("id, role, is_active");

      const adminMap = new Map(adminData?.map(a => [a.id, a]) || []);

      const enrichedUsers = (profilesData || []).map(profile => {
        const admin = adminMap.get(profile.id);
        return {
          ...profile,
          admin_role: admin?.role,
          is_admin: admin?.is_active || false,
        };
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
      const { error } = await supabase.rpc('promote_user_to_admin', {
        target_user_id: userId,
        admin_role: role,
      });

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
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">Manage platform users</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Admin Role</TableHead>
                <TableHead>Referred</TableHead>
                <TableHead>Joined</TableHead>
                {currentUserIsSuperAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={currentUserIsSuperAdmin ? 6 : 5} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={currentUserIsSuperAdmin ? 6 : 5} className="text-center py-8">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.first_name} {user.last_name}
                    </TableCell>
                    <TableCell>{user.phone_number || "-"}</TableCell>
                    <TableCell>
                      {user.is_admin ? (
                        <Badge variant="default" className="gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          {user.admin_role || "admin"}
                        </Badge>
                      ) : (
                        <Badge variant="outline">user</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.referral_partner_id ? (
                        <Badge className="bg-secondary text-secondary-foreground">
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">No</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    {currentUserIsSuperAdmin && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => promoteToAdmin(user.id, 'admin')}>
                              Promote to Admin
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => promoteToAdmin(user.id, 'super_admin')}>
                              Promote to Super Admin
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Users;
