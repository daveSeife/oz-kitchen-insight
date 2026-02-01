import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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

interface Profile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
}

interface OrderCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const OrderCreateDialog = ({
  open,
  onOpenChange,
  onSuccess,
}: OrderCreateDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<Profile[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [newCustomer, setNewCustomer] = useState({
    first_name: "",
    last_name: "",
    phone_number: "",
  });
  const [formData, setFormData] = useState({
    user_id: "",
    subtotal: "",
    delivery_fee: "0",
    discount_amount: "0",
    payment_method: "cash",
    payment_status: "pending",
    status: "pending",
    delivery_date: "",
    delivery_time_slot: "",
    notes: "",
    // Address fields
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

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, phone_number")
      .order("first_name");

    if (error) {
      console.error("Error fetching users:", error);
      return;
    }
    setUsers(data || []);
  };

  const generateOrderNumber = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ORD-${timestamp}-${random}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let userId = formData.user_id;
    let customerName = formData.fullName;
    let customerPhone = formData.phone;

    // If creating a new customer
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

      // Create new profile
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
      customerPhone = newCustomer.phone_number;
    } else {
      if (!formData.user_id) {
        toast.error("Please select a customer");
        return;
      }
    }

    if (!formData.subtotal || parseFloat(formData.subtotal) <= 0) {
      toast.error("Please enter a valid subtotal");
      return;
    }

    if (customerMode !== "new") {
      setLoading(true);
    }

    try {
      const subtotal = parseFloat(formData.subtotal);
      const deliveryFee = parseFloat(formData.delivery_fee) || 0;
      const discountAmount = parseFloat(formData.discount_amount) || 0;
      const totalAmount = subtotal + deliveryFee - discountAmount;

      const deliveryAddress = {
        fullName: customerMode === "new" ? customerName : formData.fullName,
        phone: customerMode === "new" ? customerPhone : formData.phone,
        street: {
          street: formData.street,
          city: formData.city,
          zone: formData.zone,
          building_number: formData.building_number,
          floor: formData.floor,
          landmark: formData.landmark,
          special_instructions: formData.special_instructions,
        },
      };

      const { error } = await supabase.from("orders").insert({
        user_id: userId,
        order_number: generateOrderNumber(),
        subtotal,
        delivery_fee: deliveryFee,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        payment_method: formData.payment_method,
        payment_status: formData.payment_status,
        status: formData.status,
        delivery_date: formData.delivery_date || null,
        delivery_time_slot: formData.delivery_time_slot || null,
        notes: formData.notes || null,
        delivery_address: deliveryAddress,
      });

      if (error) throw error;

      toast.success("Order created successfully");
      onOpenChange(false);
      onSuccess();
      
      // Reset form
      setFormData({
        user_id: "",
        subtotal: "",
        delivery_fee: "0",
        discount_amount: "0",
        payment_method: "cash",
        payment_status: "pending",
        status: "pending",
        delivery_date: "",
        delivery_time_slot: "",
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
      setNewCustomer({
        first_name: "",
        last_name: "",
        phone_number: "",
      });
      setCustomerMode("existing");
    } catch (error: any) {
      console.error("Error creating order:", error);
      toast.error(error.message || "Failed to create order");
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = (userId: string) => {
    const selectedUser = users.find((u) => u.id === userId);
    setFormData((prev) => ({
      ...prev,
      user_id: userId,
      fullName: selectedUser
        ? `${selectedUser.first_name || ""} ${selectedUser.last_name || ""}`.trim()
        : "",
      phone: selectedUser?.phone_number || "",
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Customer Selection */}
          <div className="space-y-4">
            <Label>Customer *</Label>
            <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as "existing" | "new")}>
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
                        {user.first_name} {user.last_name} {user.phone_number && `(${user.phone_number})`}
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

          {/* Order Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Subtotal (ETB) *</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.subtotal}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, subtotal: e.target.value }))
                }
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Fee (ETB)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.delivery_fee}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, delivery_fee: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Discount (ETB)</Label>
              <Input
                type="number"
                step="0.01"
                value={formData.discount_amount}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, discount_amount: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Method</Label>
              <Select
                value={formData.payment_method}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, payment_method: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="telebirr">Telebirr</SelectItem>
                  <SelectItem value="cbe">CBE</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select
                value={formData.payment_status}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, payment_status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Order Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="preparing">Preparing</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={formData.delivery_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, delivery_date: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Delivery Time Slot</Label>
              <Select
                value={formData.delivery_time_slot}
                onValueChange={(value) =>
                  setFormData((prev) => ({ ...prev, delivery_time_slot: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select time slot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">Morning (8AM-12PM)</SelectItem>
                  <SelectItem value="afternoon">Afternoon (12PM-5PM)</SelectItem>
                  <SelectItem value="evening">Evening (5PM-9PM)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Delivery Address */}
          <div className="space-y-4">
            <h3 className="font-medium">Delivery Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Street Address</Label>
                <Input
                  value={formData.street}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, street: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={formData.city}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, city: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Zone</Label>
                <Input
                  value={formData.zone}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, zone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Building Number</Label>
                <Input
                  value={formData.building_number}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, building_number: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Floor</Label>
                <Input
                  value={formData.floor}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, floor: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Landmark</Label>
                <Input
                  value={formData.landmark}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, landmark: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Order Notes</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, notes: e.target.value }))
              }
              placeholder="Any special instructions or notes..."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
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
