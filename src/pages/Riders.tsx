import { useEffect, useMemo, useState } from "react";
import { Edit, Plus, RotateCcw, Search, Truck, UserX } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type DeliveryRider = Tables<"delivery_riders">;

const emptyForm = {
  name: "",
  phone_number: "",
  notes: "",
};

const Riders = () => {
  const [riders, setRiders] = useState<DeliveryRider[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<DeliveryRider | null>(null);
  const [form, setForm] = useState(emptyForm);

  const fetchRiders = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("delivery_riders")
        .select("*")
        .order("is_active", { ascending: false })
        .order("name", { ascending: true });

      if (error) throw error;
      setRiders((data || []) as DeliveryRider[]);
    } catch (error) {
      console.error("[Riders] fetchRiders error", error);
      toast.error("Failed to fetch delivery riders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRiders();

    const channel = supabase
      .channel("delivery-riders-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "delivery_riders" }, () => {
        void fetchRiders();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const filteredRiders = useMemo(() => {
    const searchText = search.toLowerCase();

    return riders.filter((rider) =>
      [rider.name, rider.phone_number, rider.notes || ""].join(" ").toLowerCase().includes(searchText),
    );
  }, [riders, search]);

  const openCreateDialog = () => {
    setSelectedRider(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (rider: DeliveryRider) => {
    setSelectedRider(rider);
    setForm({
      name: rider.name,
      phone_number: rider.phone_number,
      notes: rider.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const nextName = form.name.trim();
    const nextPhone = form.phone_number.trim();

    if (!nextName || !nextPhone) {
      toast.error("Rider name and phone number are required.");
      return;
    }

    try {
      setSaving(true);

      if (selectedRider) {
        const { error } = await supabase
          .from("delivery_riders")
          .update({
            name: nextName,
            phone_number: nextPhone,
            notes: form.notes.trim() || null,
          })
          .eq("id", selectedRider.id);

        if (error) throw error;
        toast.success("Rider updated");
      } else {
        const { error } = await supabase.from("delivery_riders").insert({
          name: nextName,
          phone_number: nextPhone,
          notes: form.notes.trim() || null,
          is_active: true,
        });

        if (error) throw error;
        toast.success("Rider added");
      }

      setDialogOpen(false);
      setSelectedRider(null);
      setForm(emptyForm);
      await fetchRiders();
    } catch (error) {
      console.error("[Riders] handleSave error", error);
      toast.error("Failed to save rider");
    } finally {
      setSaving(false);
    }
  };

  const updateRiderActiveState = async (rider: DeliveryRider, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from("delivery_riders")
        .update({ is_active: isActive })
        .eq("id", rider.id);

      if (error) throw error;
      toast.success(isActive ? "Rider restored" : "Rider deactivated");
      await fetchRiders();
    } catch (error) {
      console.error("[Riders] updateRiderActiveState error", error);
      toast.error("Failed to update rider");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="page-header">
            <h1 className="font-heading">Rider Management</h1>
            <p className="text-muted-foreground mt-1">Add and manage delivery riders for meal assignments.</p>
          </div>

          <Button onClick={openCreateDialog} className="rounded-xl h-10 px-4 font-semibold bg-gradient-to-r from-primary to-teal-700 shadow-lg shadow-primary/15">
            <Plus className="w-4 h-4 mr-2" />
            Add Rider
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search riders..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-10 search-input"
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden"
        >
          <div className="overflow-x-auto">
            <Table className="modern-table min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead>Name</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-[130px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Loading riders...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredRiders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-12">
                      <div className="flex flex-col items-center gap-3">
                        <Truck className="w-10 h-10 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground">No riders found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRiders.map((rider) => (
                    <TableRow key={rider.id} className="border-border/50">
                      <TableCell className="font-semibold text-foreground">{rider.name}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{rider.phone_number}</TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">{rider.notes || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            rider.is_active
                              ? "border-0 bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20"
                              : "border-0 bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300"
                          }
                        >
                          {rider.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                            onClick={() => openEditDialog(rider)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          {rider.is_active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
                              onClick={() => void updateRiderActiveState(rider, false)}
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary"
                              onClick={() => void updateRiderActiveState(rider, true)}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </motion.div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{selectedRider ? "Edit Rider" : "Add Rider"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rider-name">Name</Label>
                <Input
                  id="rider-name"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Rider full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rider-phone">Phone Number</Label>
                <Input
                  id="rider-phone"
                  value={form.phone_number}
                  onChange={(event) => setForm((current) => ({ ...current, phone_number: event.target.value }))}
                  placeholder="+251..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rider-notes">Notes</Label>
                <Textarea
                  id="rider-notes"
                  value={form.notes}
                  onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                  placeholder="Area coverage, availability, or dispatch notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Close
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving..." : "Save Rider"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default Riders;
