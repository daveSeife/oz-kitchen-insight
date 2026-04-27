import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPrimaryMealSchedule, normalizeMealType } from "@/lib/orderMeals";

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

interface MenuMeal {
  id: string;
  name: string;
  base_price: number;
  meal_type: string | null;
  dietary_tags: string[] | null;
}

type MealRowStatus = "scheduled" | "modified" | "delivered" | "cancelled";

interface DraftMealRow {
  id: string;
  meal_id: string;
  scheduled_date: string;
  scheduled_time_slot: string;
  quantity: string;
  customer_note: string;
  status: MealRowStatus;
}

interface OrderCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const DELIVERY_TIME_OPTIONS = [
  "Lunch (11:00 AM - 12:30 PM)",
  "Dinner (5:00 PM - 7:00 PM)",
];

const ORDER_STATUS_OPTIONS = ["pending", "confirmed", "preparing", "delivered", "cancelled"] as const;
const PAYMENT_STATUS_OPTIONS = ["pending", "paid", "failed", "refunded"] as const;
const PAYMENT_METHOD_OPTIONS = ["cash", "telebirr", "cbe", "bank_transfer"] as const;
const MEAL_STATUS_OPTIONS: MealRowStatus[] = ["scheduled", "modified", "delivered", "cancelled"];

const createDraftMealRow = (): DraftMealRow => ({
  id: `meal-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  meal_id: "",
  scheduled_date: "",
  scheduled_time_slot: DELIVERY_TIME_OPTIONS[0],
  quantity: "1",
  customer_note: "",
  status: "scheduled",
});

const createInitialFormData = () => ({
  user_id: "",
  delivery_fee: "0",
  discount_amount: "0",
  payment_method: "cash",
  payment_status: "pending",
  status: "pending",
  notes: "",
  fullName: "",
  phone: "",
  street: "",
  city: "",
  zone: "",
  building_number: "",
  floor: "",
  landmark: "",
  special_instructions: "",
});

export const OrderCreateDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: OrderCreateDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [menuMeals, setMenuMeals] = useState<MenuMeal[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });
  const [formData, setFormData] = useState(createInitialFormData);
  const [mealRows, setMealRows] = useState<DraftMealRow[]>([createDraftMealRow()]);

  useEffect(() => {
    if (!open) return;
    void Promise.all([fetchUsers(), fetchMeals()]);
  }, [open]);

  const mealMap = useMemo(
    () => new Map(menuMeals.map((meal) => [meal.id, meal])),
    [menuMeals],
  );

  const mealRowsWithDetails = useMemo(
    () =>
      mealRows.map((row) => {
        const meal = mealMap.get(row.meal_id) || null;
        const quantity = Math.max(1, Number(row.quantity || 1));
        const unitPrice = Number(meal?.base_price || 0);

        return {
          ...row,
          meal,
          quantity,
          unitPrice,
          lineTotal: quantity * unitPrice,
        };
      }),
    [mealMap, mealRows],
  );

  const subtotal = useMemo(
    () => mealRowsWithDetails.reduce((sum, row) => sum + row.lineTotal, 0),
    [mealRowsWithDetails],
  );

  const deliveryFee = Number(formData.delivery_fee || 0);
  const discountAmount = Number(formData.discount_amount || 0);
  const totalAmount = Math.max(0, subtotal + deliveryFee - discountAmount);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number")
      .order("first_name");

    if (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load customers");
      return;
    }

    setUsers(data || []);
  };

  const fetchMeals = async () => {
    const { data, error } = await supabase
      .from("meals")
      .select("id, name, base_price, meal_type, dietary_tags")
      .eq("is_available", true)
      .order("name");

    if (error) {
      console.error("Error fetching meals:", error);
      toast.error("Failed to load meals");
      return;
    }

    setMenuMeals(data || []);
  };

  const resetDialog = () => {
    setFormData(createInitialFormData());
    setMealRows([createDraftMealRow()]);
    setNewCustomer({
      first_name: "",
      last_name: "",
      phone_number: "",
    });
    setCustomerMode("existing");
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  };

  const updateMealRow = (rowId: string, updates: Partial<DraftMealRow>) => {
    setMealRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, ...updates } : row)),
    );
  };

  const addMealRow = () => {
    setMealRows((current) => [...current, createDraftMealRow()]);
  };

  const removeMealRow = (rowId: string) => {
    setMealRows((current) =>
      current.length === 1 ? current : current.filter((row) => row.id !== rowId),
    );
  };

  const handleUserChange = (userId: string) => {
    const selectedUser = users.find((user) => user.id === userId);

    setFormData((prev) => ({
      ...prev,
      user_id: userId,
      fullName: selectedUser
        ? `${selectedUser.first_name || ""} ${selectedUser.last_name || ""}`.trim()
        : "",
      phone: selectedUser?.phone_number || "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    let userId = formData.user_id;
    let customerName = formData.fullName.trim();
    let customerPhone = formData.phone.trim();

    if (customerMode === "new") {
      if (!newCustomer.first_name.trim()) {
        toast.error("Please enter customer first name");
        return;
      }

      if (!newCustomer.phone_number.trim()) {
        toast.error("Please enter customer phone number");
        return;
      }

      setLoading(true);

      const { data: newProfile, error: profileError } = await supabase
        .from("profiles")
        .insert({
          first_name: newCustomer.first_name.trim(),
          last_name: newCustomer.last_name.trim() || null,
          phone_number: newCustomer.phone_number.trim(),
        })
        .select()
        .single();

      if (profileError) {
        console.error("Error creating customer:", profileError);
        toast.error("Failed to create customer");
        setLoading(false);
        return;
      }

      userId = newProfile.id;
      customerName = `${newCustomer.first_name} ${newCustomer.last_name}`.trim();
      customerPhone = newCustomer.phone_number.trim();
    } else if (!formData.user_id) {
      toast.error("Please select a customer");
      return;
    }

    const normalizedRows = mealRowsWithDetails.filter((row) => row.meal);

    if (normalizedRows.length === 0) {
      toast.error("Add at least one meal to the order");
      return;
    }

    const incompleteRow = normalizedRows.find(
      (row) => !row.meal_id || !row.scheduled_date || !row.scheduled_time_slot || row.quantity <= 0,
    );

    if (mealRows.length !== normalizedRows.length || incompleteRow) {
      toast.error("Each meal row needs a meal, date, time slot, and quantity");
      return;
    }

    if (subtotal <= 0) {
      toast.error("Subtotal must be greater than zero");
      return;
    }

    if (customerMode !== "new") {
      setLoading(true);
    }

    let createdOrderId: string | null = null;

    try {
      const deliveryAddress = {
        contact_name: customerName || formData.fullName.trim(),
        contact_phone: customerPhone || formData.phone.trim(),
        street: formData.street.trim(),
        city: formData.city.trim(),
        zone: formData.zone.trim(),
        building_number: formData.building_number.trim(),
        floor: formData.floor.trim(),
        landmark: formData.landmark.trim(),
        special_instructions: formData.special_instructions.trim(),
      };

      const schedule = getPrimaryMealSchedule(
        normalizedRows.map((row) => ({
          scheduled_date: row.scheduled_date,
          scheduled_time_slot: row.scheduled_time_slot,
          meal_name: row.meal?.name || "",
          created_at: null,
          status: row.status,
        })),
      );

      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: userId,
          order_number: generateOrderNumber(),
          subtotal,
          delivery_fee: deliveryFee,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          payment_method: formData.payment_method,
          payment_status: formData.payment_status,
          status: formData.status,
          delivery_date: schedule.deliveryDate,
          delivery_time_slot: schedule.deliveryTimeSlot,
          notes: formData.notes.trim() || null,
          delivery_address: deliveryAddress,
        })
        .select("id")
        .single();

      if (orderError) throw orderError;

      createdOrderId = orderData.id;

      const orderMealRows: TablesInsert<"order_meals">[] = normalizedRows.map((row) => ({
        order_id: orderData.id,
        meal_id: row.meal_id,
        meal_name: row.meal?.name || "Meal",
        meal_category: null,
        meal_type: normalizeMealType(row.meal?.meal_type || "non-fasting"),
        dietary_tags: row.meal?.dietary_tags || [],
        quantity: row.quantity,
        unit_price: row.unitPrice,
        scheduled_date: row.scheduled_date,
        scheduled_time_slot: row.scheduled_time_slot,
        status: row.status,
        customer_note: row.customer_note.trim() || null,
        metadata: {},
      }));

      const { error: orderMealsError } = await supabase.from("order_meals").insert(orderMealRows);

      if (orderMealsError) {
        await supabase.from("orders").delete().eq("id", orderData.id);
        throw orderMealsError;
      }

      toast.success("Order created successfully");
      onOpenChange(false);
      resetDialog();
      onSuccess();
    } catch (error: unknown) {
      console.error("Error creating order:", error);
      const fallbackMessage = createdOrderId
        ? "Failed to save meal rows. The order container was rolled back."
        : "Failed to create order";
      toast.error(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
          resetDialog();
        }
      }}
    >
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium">Architecture rule</p>
            <p className="text-sm text-muted-foreground mt-1">
              Orders are financial containers. Every order created here must include structured meal rows with their own date, time slot, note, and status.
            </p>
          </div>

          <div className="space-y-4">
            <Label>Customer *</Label>
            <Tabs value={customerMode} onValueChange={(value) => setCustomerMode(value as "existing" | "new")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="existing">Existing Customer</TabsTrigger>
                <TabsTrigger value="new">New Customer</TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="mt-4">
                <Select value={formData.user_id} onValueChange={handleUserChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.first_name} {user.last_name} {user.phone_number ? `(${user.phone_number})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TabsContent>

              <TabsContent value="new" className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input
                      value={newCustomer.first_name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({ ...prev, first_name: e.target.value }))
                      }
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={newCustomer.last_name}
                      onChange={(e) =>
                        setNewCustomer((prev) => ({ ...prev, last_name: e.target.value }))
                      }
                      placeholder="Last name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input
                    value={newCustomer.phone_number}
                    onChange={(e) =>
                      setNewCustomer((prev) => ({ ...prev, phone_number: e.target.value }))
                    }
                    placeholder="Phone number"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-medium">Ordered Meals</h3>
                <p className="text-sm text-muted-foreground">
                  Each row becomes one `order_meals` record with its own schedule and lifecycle.
                </p>
              </div>
              <Button type="button" variant="outline" onClick={addMealRow}>
                <Plus className="w-4 h-4 mr-2" />
                Add Meal Row
              </Button>
            </div>

            <div className="space-y-4">
              {mealRowsWithDetails.map((row, index) => (
                <div key={row.id} className="rounded-lg border p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Meal Row {index + 1}</p>
                      <p className="text-sm text-muted-foreground">
                        {row.meal ? `${row.meal.name} - ETB ${row.unitPrice.toLocaleString()}` : "Select a meal to begin"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeMealRow(row.id)}
                      disabled={mealRows.length === 1}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <div className="space-y-2 xl:col-span-2">
                      <Label>Meal *</Label>
                      <Select value={row.meal_id} onValueChange={(value) => updateMealRow(row.id, { meal_id: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a meal" />
                        </SelectTrigger>
                        <SelectContent>
                          {menuMeals.map((meal) => (
                            <SelectItem key={meal.id} value={meal.id}>
                              {meal.name} - ETB {Number(meal.base_price || 0).toLocaleString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Date *</Label>
                      <Input
                        type="date"
                        value={row.scheduled_date}
                        onChange={(e) => updateMealRow(row.id, { scheduled_date: e.target.value })}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Time Slot *</Label>
                      <Select
                        value={row.scheduled_time_slot}
                        onValueChange={(value) => updateMealRow(row.id, { scheduled_time_slot: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_TIME_OPTIONS.map((timeSlot) => (
                            <SelectItem key={timeSlot} value={timeSlot}>
                              {timeSlot}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Quantity *</Label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={row.quantity}
                        onChange={(e) => updateMealRow(row.id, { quantity: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                    <div className="space-y-2">
                      <Label>Meal Note</Label>
                      <Textarea
                        value={row.customer_note}
                        onChange={(e) => updateMealRow(row.id, { customer_note: e.target.value })}
                        placeholder="Special instruction for this meal..."
                      />
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Meal Status</Label>
                        <Select value={row.status} onValueChange={(value) => updateMealRow(row.id, { status: value as MealRowStatus })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MEAL_STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status}>
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                        <p className="text-muted-foreground">Meal type</p>
                        <p className="font-medium capitalize">
                          {normalizeMealType(row.meal?.meal_type || "non-fasting")}
                        </p>
                        <p className="mt-2 text-muted-foreground">Line total</p>
                        <p className="font-semibold">ETB {row.lineTotal.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHOD_OPTIONS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {method.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select
                value={formData.payment_status}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, payment_status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Order Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Meal subtotal</p>
              <p className="text-2xl font-semibold">ETB {subtotal.toLocaleString()}</p>
            </div>
            <div className="space-y-2">
              <Label>Delivery Fee (ETB)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.delivery_fee}
                onChange={(e) => setFormData((prev) => ({ ...prev, delivery_fee: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Discount (ETB)</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={formData.discount_amount}
                onChange={(e) => setFormData((prev) => ({ ...prev, discount_amount: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="text-sm text-muted-foreground">Order total</p>
            <p className="text-3xl font-semibold">ETB {totalAmount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Calculated from meal rows plus delivery fee minus discount.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-medium">Delivery Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Contact Name</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={formData.street}
                  onChange={(e) => setFormData((prev) => ({ ...prev, street: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => setFormData((prev) => ({ ...prev, city: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Zone</Label>
                <Input
                  value={formData.zone}
                  onChange={(e) => setFormData((prev) => ({ ...prev, zone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Building Number</Label>
                <Input
                  value={formData.building_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, building_number: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Floor</Label>
                <Input
                  value={formData.floor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, floor: e.target.value }))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Landmark</Label>
                <Input
                  value={formData.landmark}
                  onChange={(e) => setFormData((prev) => ({ ...prev, landmark: e.target.value }))}
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Special Instructions</Label>
                <Textarea
                  value={formData.special_instructions}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, special_instructions: e.target.value }))
                  }
                  placeholder="Building access, landmarks, or other delivery instructions..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Order Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Internal note for the order container..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Order"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
