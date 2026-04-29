import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Calendar, CheckCircle2, Download, Plus, Search, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderCreateDialog } from "@/components/orders/OrderCreateDialog";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getAdminAccess } from "@/lib/adminAuth";
import { exportToCSV, exportToExcel } from "@/lib/csvExport";
import {
  formatAddressText,
  getDeliveryContactName,
  getDeliveryContactPhone,
  getMealDayName,
  normalizeMealType,
  normalizeOrderMealRow,
  parseLegacyMealSnapshot,
  type NormalizedOrderMeal,
} from "@/lib/orderMeals";

type OrderStatus = "pending" | "confirmed" | "preparing" | "delivered" | "cancelled";
type OrderMealRowRecord = Tables<"order_meals">;

interface Order {
  id: string;
  user_id: string;
  order_number: string;
  total_amount: number;
  status: string;
  payment_status: string;
  created_at: string;
  delivery_address: unknown;
  delivery_date: string | null;
  delivery_time_slot: string | null;
  notes: string | null;
  subtotal: number;
  delivery_fee: number;
  discount_amount: number;
  payment_method: string | null;
  meal_plan_id: string | null;
  profiles: {
    first_name: string;
    last_name: string;
    phone_number?: string | null;
  };
  meals: NormalizedOrderMeal[];
}

interface OrderedMealRow {
  meal: NormalizedOrderMeal;
  order: Order;
  fullName: string;
  phone: string;
  location: string;
}

interface LatestPaymentRecord {
  id: string;
  order_id: string;
  payment_gateway_response: unknown;
  created_at: string;
}

const isMissingOrderMealsTableError = (error: { code?: string; message?: string; hint?: string } | null | undefined) => {
  if (!error) return false;

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("public.order_meals") ||
    error.hint?.includes("public.orders")
  );
};

const getMealNoteText = (meal: NormalizedOrderMeal) => {
  const metadata = meal.metadata as Record<string, unknown> | null | undefined;

  const noteCandidates = [
    meal.customer_note,
    typeof metadata?.customNote === "string" ? metadata.customNote : null,
    typeof metadata?.specialRequest === "string" ? metadata.specialRequest : null,
    typeof metadata?.notes === "string" ? metadata.notes : null,
    typeof metadata?.special_instructions === "string" ? metadata.special_instructions : null,
    typeof metadata?.note === "string" ? metadata.note : null,
  ];

  for (const candidate of noteCandidates) {
    if (candidate?.trim()) return candidate.trim();
  }

  return "";
};

const normalizeTextKey = (value?: string | null) => (value || "").trim().toLowerCase();

type MealSourceRef =
  | { source: "order_meals"; id: string }
  | { source: "legacy_snapshot"; payment_record_id: string; snapshot_index: number };

const getMealSourceRefs = (meal: NormalizedOrderMeal): MealSourceRef[] => {
  const existingRefs = meal.metadata.source_refs;
  if (Array.isArray(existingRefs)) {
    return existingRefs.filter((ref): ref is MealSourceRef => {
      if (!ref || typeof ref !== "object") return false;

      if (
        (ref as Record<string, unknown>).source === "order_meals" &&
        typeof (ref as Record<string, unknown>).id === "string"
      ) {
        return true;
      }

      return (
        (ref as Record<string, unknown>).source === "legacy_snapshot" &&
        typeof (ref as Record<string, unknown>).payment_record_id === "string" &&
        typeof (ref as Record<string, unknown>).snapshot_index === "number"
      );
    });
  }

  if (meal.source === "order_meals" && meal.id) {
    return [{ source: "order_meals", id: meal.id }];
  }

  const paymentRecordId =
    typeof meal.metadata.payment_record_id === "string" ? meal.metadata.payment_record_id : null;
  const snapshotIndex =
    typeof meal.metadata.snapshot_index === "number" ? meal.metadata.snapshot_index : null;

  if (meal.source === "legacy_snapshot" && paymentRecordId && snapshotIndex !== null) {
    return [{ source: "legacy_snapshot", payment_record_id: paymentRecordId, snapshot_index: snapshotIndex }];
  }

  return [];
};

const getMealRefKey = (meal: NormalizedOrderMeal) => {
  const refs = getMealSourceRefs(meal);
  if (refs.length > 0) {
    return refs
      .map((ref) =>
        ref.source === "order_meals"
          ? `order_meals:${ref.id}`
          : `legacy_snapshot:${ref.payment_record_id}:${ref.snapshot_index}`,
      )
      .sort()
      .join("|");
  }

  return `${meal.source}:${meal.id}`;
};

const getMealFingerprint = (meal: NormalizedOrderMeal) =>
  [
    meal.order_id,
    normalizeTextKey(meal.meal_id),
    normalizeTextKey(meal.meal_name),
    normalizeTextKey(meal.scheduled_date),
    normalizeTextKey(meal.scheduled_time_slot),
    meal.quantity,
    meal.unit_price,
    normalizeTextKey(meal.meal_type),
    normalizeTextKey(meal.customer_note),
  ].join("|");

const getMealSourceMatchKey = (meal: NormalizedOrderMeal) =>
  [
    normalizeTextKey(meal.order_id),
    normalizeTextKey(meal.meal_id || meal.meal_name),
    normalizeTextKey(meal.scheduled_date),
    normalizeTextKey(meal.scheduled_time_slot),
    normalizeTextKey(meal.status),
    normalizeTextKey(meal.customer_note),
  ].join("|");

const mergeMealRecords = (existing: NormalizedOrderMeal, incoming: NormalizedOrderMeal): NormalizedOrderMeal => {
  const preferred =
    existing.source === "order_meals" || incoming.source !== "order_meals" ? existing : incoming;
  const secondary = preferred === existing ? incoming : existing;

  const combinedRefs = [...getMealSourceRefs(existing), ...getMealSourceRefs(incoming)];
  const uniqueRefs = Array.from(
    new Map(
      combinedRefs.map((ref) => [
        ref.source === "order_meals"
          ? `order_meals:${ref.id}`
          : `legacy_snapshot:${ref.payment_record_id}:${ref.snapshot_index}`,
        ref,
      ]),
    ).values(),
  );

  return {
    ...preferred,
    meal_id: preferred.meal_id || secondary.meal_id,
    meal_name: preferred.meal_name || secondary.meal_name,
    meal_category: preferred.meal_category || secondary.meal_category,
    meal_type: preferred.meal_type || secondary.meal_type,
    dietary_tags:
      preferred.dietary_tags.length > 0 ? preferred.dietary_tags : secondary.dietary_tags,
    scheduled_date: preferred.scheduled_date || secondary.scheduled_date,
    scheduled_time_slot: preferred.scheduled_time_slot || secondary.scheduled_time_slot,
    customer_note: preferred.customer_note || secondary.customer_note,
    metadata: {
      ...secondary.metadata,
      ...preferred.metadata,
      source_refs: uniqueRefs,
    },
  };
};

const dedupeMeals = (meals: NormalizedOrderMeal[]) => {
  const deduped = new Map<string, NormalizedOrderMeal>();
  const refIndex = new Map<string, string>();
  const fingerprintIndex = new Map<string, string>();
  const sourceMatchIndex = new Map<string, string>();

  for (const meal of meals) {
    const refKey = getMealRefKey(meal);
    const fingerprint = getMealFingerprint(meal);
    const sourceMatchKey = getMealSourceMatchKey(meal);
    const existingKey =
      refIndex.get(refKey) ||
      fingerprintIndex.get(fingerprint) ||
      sourceMatchIndex.get(sourceMatchKey);

    const existing = existingKey ? deduped.get(existingKey) : undefined;
    if (!existing) {
      deduped.set(refKey, meal);
      refIndex.set(refKey, refKey);
      fingerprintIndex.set(fingerprint, refKey);
      sourceMatchIndex.set(sourceMatchKey, refKey);
      continue;
    }

    const mergedMeal = mergeMealRecords(existing, meal);
    deduped.set(existingKey!, mergedMeal);

    for (const ref of getMealSourceRefs(mergedMeal)) {
      refIndex.set(
        ref.source === "order_meals"
          ? `order_meals:${ref.id}`
          : `legacy_snapshot:${ref.payment_record_id}:${ref.snapshot_index}`,
        existingKey!,
      );
    }

    fingerprintIndex.set(getMealFingerprint(mergedMeal), existingKey!);
    sourceMatchIndex.set(getMealSourceMatchKey(mergedMeal), existingKey!);
  }

  return Array.from(deduped.values());
};

const getOrderedMealRowKey = (row: OrderedMealRow) => `${row.order.id}::${getMealRefKey(row.meal)}`;

const getMealQuantityTotal = (rows: OrderedMealRow[]) =>
  rows.reduce((sum, row) => sum + (row.meal.quantity || 0), 0);

const deriveOrderStatusFromMeals = (meals: NormalizedOrderMeal[], currentStatus?: string | null): OrderStatus => {
  if (meals.length === 0) {
    return (currentStatus as OrderStatus) || "pending";
  }

  const activeMeals = meals.filter((meal) => meal.status !== "cancelled");
  if (activeMeals.length === 0) return "cancelled";
  if (activeMeals.every((meal) => meal.status === "delivered")) return "delivered";
  if (activeMeals.some((meal) => meal.status === "delivered")) return "preparing";

  if (currentStatus === "pending" || currentStatus === "confirmed" || currentStatus === "preparing") {
    return currentStatus;
  }

  return "confirmed";
};

const Orders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("ordered-meals");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<Date | undefined>(undefined);
  const [selectedMealDate, setSelectedMealDate] = useState<Date | undefined>(undefined);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("all");
  const [selectedMealType, setSelectedMealType] = useState("all");
  const [updatingMealId, setUpdatingMealId] = useState<string | null>(null);
  const [selectedMealRowKeys, setSelectedMealRowKeys] = useState<string[]>([]);

  const formatPaymentStatus = (value?: string | null) => {
    if (!value) return "pending";
    if (value === "paid") return "paid";
    return value;
  };

  const getPaymentBadgeVariant = (value?: string | null): "default" | "secondary" | "destructive" => {
    if (value === "paid") return "default";
    if (value === "failed") return "destructive";
    return "secondary";
  };

  const getMealStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-amber-100 text-amber-800",
      modified: "bg-sky-100 text-sky-800",
      delivered: "bg-emerald-100 text-emerald-800",
      cancelled: "bg-rose-100 text-rose-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const checkAdminStatus = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setIsAdmin(false);
      return;
    }

    const adminAccess = await getAdminAccess(user.id);
    setIsAdmin(adminAccess.hasAccess);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setOrders([]);
        return;
      }

      let ordersQuery = supabase.from("orders").select("*");

      if (!isAdmin) {
        ordersQuery = ordersQuery.eq("user_id", user.id);
      }

      const { data: ordersData, error: ordersError } = await ordersQuery.order("created_at", {
        ascending: false,
      });

      if (ordersError) throw ordersError;

      const orderIds = (ordersData || []).map((order) => order.id);
      const userIds = Array.from(new Set((ordersData || []).map((order) => order.user_id).filter(Boolean)));

      const [{ data: profilesData, error: profilesError }, { data: paymentsData, error: paymentsError }, orderMealsResponse] =
        await Promise.all([
          userIds.length > 0
            ? supabase.from("profiles").select("id, first_name, last_name, phone_number").in("id", userIds)
            : Promise.resolve({ data: [], error: null }),
          orderIds.length > 0
            ? supabase
                .from("payments")
                .select("id, order_id, payment_gateway_response, created_at")
                .in("order_id", orderIds)
                .order("created_at", { ascending: false })
            : Promise.resolve({ data: [], error: null }),
          orderIds.length > 0
            ? supabase.from("order_meals").select("*").in("order_id", orderIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (profilesError) throw profilesError;
      if (paymentsError) throw paymentsError;

      const orderMealsError = orderMealsResponse?.error;
      if (orderMealsError && !isMissingOrderMealsTableError(orderMealsError)) {
        throw orderMealsError;
      }

      const profileMap = Object.fromEntries(
        (profilesData || []).map((profile) => [
          profile.id,
          {
            first_name: profile.first_name || "",
            last_name: profile.last_name || "",
            phone_number: profile.phone_number || "",
          },
        ]),
      );

      const latestPaymentByOrder = new Map<string, LatestPaymentRecord>();
      for (const payment of paymentsData || []) {
        if (!latestPaymentByOrder.has(payment.order_id)) {
          latestPaymentByOrder.set(payment.order_id, payment);
        }
      }

      const mealsByOrder = new Map<string, NormalizedOrderMeal[]>();
      const fallbackMealsByOrder = new Map<string, NormalizedOrderMeal[]>();
      const mealIds = new Set<string>();

      for (const row of (orderMealsResponse?.data as OrderMealRowRecord[] | null) || []) {
        const normalized = normalizeOrderMealRow(row);
        const existing = mealsByOrder.get(normalized.order_id) || [];
        existing.push(normalized);
        mealsByOrder.set(normalized.order_id, existing);
        if (normalized.meal_id) {
          mealIds.add(normalized.meal_id);
        }
      }

      for (const order of ordersData || []) {
        const payment = latestPaymentByOrder.get(order.id);
        const fallbackMeals = parseLegacyMealSnapshot(
          order.id,
          payment?.payment_gateway_response,
          order.delivery_date,
          order.delivery_time_slot,
          payment?.id,
        );

        fallbackMealsByOrder.set(order.id, fallbackMeals);
        for (const meal of fallbackMeals) {
          if (meal.meal_id) {
            mealIds.add(meal.meal_id);
          }
        }
      }

      const { data: mealCatalogData, error: mealCatalogError } =
        mealIds.size > 0
          ? await supabase.from("meals").select("id, name, meal_type").in("id", Array.from(mealIds))
          : { data: [], error: null };

      if (mealCatalogError) throw mealCatalogError;

      const mealCatalogMap = new Map(
        (mealCatalogData || []).map((meal) => [meal.id, meal]),
      );

      const enrichMeal = (meal: NormalizedOrderMeal): NormalizedOrderMeal => {
        const catalogMeal = meal.meal_id ? mealCatalogMap.get(meal.meal_id) : null;

        return {
          ...meal,
          meal_name: catalogMeal?.name || meal.meal_name,
          // Keep the ordered meal type authoritative; only fall back to catalog when missing.
          meal_type: normalizeMealType(meal.meal_type || catalogMeal?.meal_type),
        };
      };

      const normalizedOrders: Order[] = (ordersData || []).map((order) => {
        const orderMeals = (mealsByOrder.get(order.id) || []).map(enrichMeal);
        const fallbackMeals = (fallbackMealsByOrder.get(order.id) || []).map(enrichMeal);

        const meals = dedupeMeals([...orderMeals, ...fallbackMeals]).sort((a, b) => {
          const left = `${a.scheduled_date || ""} ${a.scheduled_time_slot || ""}`;
          const right = `${b.scheduled_date || ""} ${b.scheduled_time_slot || ""}`;
          return left.localeCompare(right);
        });

        return {
          ...order,
          status: order.status || "pending",
          payment_status: order.payment_status || "pending",
          profiles: profileMap[order.user_id] || { first_name: "", last_name: "", phone_number: "" },
          meals,
        };
      });

      setOrders(normalizedOrders);
    } catch (error: unknown) {
      console.error("[Orders] fetchOrders error", error);
      toast.error("Failed to fetch orders");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void checkAdminStatus();
  }, [checkAdminStatus]);

  useEffect(() => {
    void fetchOrders();

    const channel = supabase
      .channel("admin-orders-view")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        void fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        void fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_meals" }, () => {
        void fetchOrders();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchOrders]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);

      if (error) throw error;
      toast.success("Order status updated");
      void fetchOrders();
    } catch (error) {
      toast.error("Failed to update order status");
    }
  };

  const updateMealStatus = async (
    meal: NormalizedOrderMeal,
    orderId: string,
    nextStatus: "scheduled" | "delivered",
    options?: { silent?: boolean; refetch?: boolean; throwOnError?: boolean },
  ) => {
    try {
      setUpdatingMealId(meal.id);

      const sourceRefs = getMealSourceRefs(meal);
      if (sourceRefs.length === 0) {
        throw new Error("This meal record does not have any writable source references.");
      }

      const orderMealIds = sourceRefs
        .filter((ref): ref is Extract<MealSourceRef, { source: "order_meals" }> => ref.source === "order_meals")
        .map((ref) => ref.id);

      if (orderMealIds.length > 0) {
        const response = await supabase
          .from("order_meals")
          .update({ status: nextStatus })
          .in("id", orderMealIds);

        if (response.error) throw response.error;
      }

      const legacyRefs = sourceRefs.filter(
        (ref): ref is Extract<MealSourceRef, { source: "legacy_snapshot" }> => ref.source === "legacy_snapshot",
      );

      const legacyRefsByPayment = new Map<string, number[]>();
      for (const ref of legacyRefs) {
        const existing = legacyRefsByPayment.get(ref.payment_record_id) || [];
        existing.push(ref.snapshot_index);
        legacyRefsByPayment.set(ref.payment_record_id, existing);
      }

      for (const [paymentRecordId, snapshotIndexes] of legacyRefsByPayment.entries()) {
        const { data: paymentRecord, error: paymentFetchError } = await supabase
          .from("payments")
          .select("payment_gateway_response")
          .eq("id", paymentRecordId)
          .single();

        if (paymentFetchError) throw paymentFetchError;

        const gatewayResponse = paymentRecord?.payment_gateway_response;
        const responseRecord =
          gatewayResponse && typeof gatewayResponse === "object" && !Array.isArray(gatewayResponse)
            ? (gatewayResponse as Record<string, unknown>)
            : null;

        const snapshotRoot = Array.isArray(responseRecord?.meal_snapshot)
          ? [...responseRecord.meal_snapshot]
          : Array.isArray(gatewayResponse)
            ? [...gatewayResponse]
            : [];

        for (const snapshotIndex of snapshotIndexes) {
          const snapshotItem = snapshotRoot[snapshotIndex];
          if (!snapshotItem || typeof snapshotItem !== "object" || Array.isArray(snapshotItem)) {
            throw new Error("Unable to update this legacy meal snapshot.");
          }

          snapshotRoot[snapshotIndex] = {
            ...(snapshotItem as Record<string, unknown>),
            status: nextStatus,
          };
        }

        const nextGatewayResponse =
          responseRecord && "meal_snapshot" in responseRecord
            ? { ...responseRecord, meal_snapshot: snapshotRoot }
            : snapshotRoot;

        const response = await supabase
          .from("payments")
          .update({ payment_gateway_response: nextGatewayResponse })
          .eq("id", paymentRecordId);

        if (response.error) throw response.error;
      }

      const refreshedOrderMealsResponse = await supabase
        .from("order_meals")
        .select("*")
        .eq("order_id", orderId);

      let nextOrderStatus: OrderStatus | null = null;

      if (!refreshedOrderMealsResponse.error) {
        const refreshedMeals = ((refreshedOrderMealsResponse.data as OrderMealRowRecord[] | null) || []).map((row) =>
          normalizeOrderMealRow(row),
        );
        nextOrderStatus = deriveOrderStatusFromMeals(refreshedMeals);
      } else if (isMissingOrderMealsTableError(refreshedOrderMealsResponse.error)) {
        const legacyPaymentRefs = Array.from(legacyRefsByPayment.keys());
        const paymentRecordId = legacyPaymentRefs[0] || null;

        if (paymentRecordId) {
          const { data: paymentRecord, error: paymentFetchError } = await supabase
            .from("payments")
            .select("payment_gateway_response")
            .eq("id", paymentRecordId)
            .single();

          if (paymentFetchError) throw paymentFetchError;

          const legacyMeals = parseLegacyMealSnapshot(orderId, paymentRecord?.payment_gateway_response);
          nextOrderStatus = deriveOrderStatusFromMeals(legacyMeals);
        }
      } else {
        throw refreshedOrderMealsResponse.error;
      }

      if (nextOrderStatus) {
        const { error: orderStatusError } = await supabase
          .from("orders")
          .update({ status: nextOrderStatus })
          .eq("id", orderId);

        if (orderStatusError) throw orderStatusError;
      }

      if (options?.refetch !== false) {
        void fetchOrders();
      }

      if (!options?.silent) {
        toast.success(nextStatus === "delivered" ? "Meal marked as delivered" : "Meal marked as scheduled");
      }
      return true;
    } catch (error) {
      console.error("[Orders] updateMealStatus error", error);
      if (options?.throwOnError) {
        throw error;
      }

      toast.error("Failed to update meal status");
      return false;
    } finally {
      setUpdatingMealId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const customerName = getDeliveryContactName(
        order.delivery_address,
        `${order.profiles.first_name} ${order.profiles.last_name}`.trim(),
      );
      const phone = getDeliveryContactPhone(order.delivery_address, order.profiles.phone_number || "");
      const matchesSearch =
        order.order_number.toLowerCase().includes(search.toLowerCase()) ||
        customerName.toLowerCase().includes(search.toLowerCase()) ||
        phone.toLowerCase().includes(search.toLowerCase());

      const orderDate = new Date(order.created_at);
      const matchesStartDate = !startDate || orderDate >= startDate;
      const matchesEndDate =
        !endDate ||
        orderDate <=
          new Date(
            endDate.getFullYear(),
            endDate.getMonth(),
            endDate.getDate(),
            23,
            59,
            59,
            999,
          );

      const matchesDeliveryDate =
        !deliveryDateFilter ||
        order.meals.some((meal) => meal.scheduled_date === format(deliveryDateFilter, "yyyy-MM-dd")) ||
        order.delivery_date === format(deliveryDateFilter, "yyyy-MM-dd");

      return matchesSearch && matchesStartDate && matchesEndDate && matchesDeliveryDate;
    });
  }, [deliveryDateFilter, endDate, orders, search, startDate]);

  const orderedMealRows = useMemo<OrderedMealRow[]>(() => {
    const rows = orders.flatMap((order) => {
      const fullName = getDeliveryContactName(
        order.delivery_address,
        `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
      );
      const phone = getDeliveryContactPhone(order.delivery_address, order.profiles.phone_number || "");
      const location = formatAddressText(order.delivery_address);

      return order.meals.map((meal) => ({
        meal,
        order,
        fullName,
        phone,
        location,
      }));
    });

    return rows.sort((left, right) => {
      const leftKey = [
        left.meal.scheduled_date || "",
        left.meal.scheduled_time_slot || "",
        left.fullName.toLowerCase(),
        left.meal.meal_name.toLowerCase(),
      ].join("::");
      const rightKey = [
        right.meal.scheduled_date || "",
        right.meal.scheduled_time_slot || "",
        right.fullName.toLowerCase(),
        right.meal.meal_name.toLowerCase(),
      ].join("::");

      return leftKey.localeCompare(rightKey);
    });
  }, [orders]);

  const timeSlotOptions = useMemo(() => {
    return Array.from(
      new Set(orderedMealRows.map((row) => row.meal.scheduled_time_slot).filter(Boolean)),
    ).sort();
  }, [orderedMealRows]);

  const filteredOrderedMeals = useMemo(() => {
    return orderedMealRows.filter((row) => {
      const haystack = [
        row.fullName,
        row.phone,
        row.location,
        row.meal.meal_name,
        row.meal.customer_note || "",
        row.order.order_number,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = haystack.includes(search.toLowerCase());
      const matchesDate =
        !selectedMealDate || row.meal.scheduled_date === format(selectedMealDate, "yyyy-MM-dd");
      const matchesTime = selectedTimeSlot === "all" || row.meal.scheduled_time_slot === selectedTimeSlot;
      const matchesType = selectedMealType === "all" || row.meal.meal_type === selectedMealType;

      return matchesSearch && matchesDate && matchesTime && matchesType;
    });
  }, [orderedMealRows, search, selectedMealDate, selectedMealType, selectedTimeSlot]);

  const orderedMealsSummary = useMemo(() => {
    const delivered = filteredOrderedMeals.filter((row) => row.meal.status === "delivered");
    const remaining = filteredOrderedMeals.filter(
      (row) => row.meal.status !== "delivered" && row.meal.status !== "cancelled",
    );
    const cancelled = filteredOrderedMeals.filter((row) => row.meal.status === "cancelled");

    return {
      delivered,
      remaining,
      cancelled,
      deliveredCount: getMealQuantityTotal(delivered),
      remainingCount: getMealQuantityTotal(remaining),
      cancelledCount: getMealQuantityTotal(cancelled),
    };
  }, [filteredOrderedMeals]);

  const filteredOrderedMealKeys = useMemo(
    () => filteredOrderedMeals.map(getOrderedMealRowKey),
    [filteredOrderedMeals],
  );

  const selectedOrderedMealRows = useMemo(
    () => filteredOrderedMeals.filter((row) => selectedMealRowKeys.includes(getOrderedMealRowKey(row))),
    [filteredOrderedMeals, selectedMealRowKeys],
  );

  const orderedMealsSelectionState = useMemo(() => {
    const selectedVisibleCount = filteredOrderedMealKeys.filter((rowKey) =>
      selectedMealRowKeys.includes(rowKey),
    ).length;

    return {
      allSelected: filteredOrderedMealKeys.length > 0 && selectedVisibleCount === filteredOrderedMealKeys.length,
      someSelected: selectedVisibleCount > 0 && selectedVisibleCount < filteredOrderedMealKeys.length,
      selectedVisibleCount,
    };
  }, [filteredOrderedMealKeys, selectedMealRowKeys]);

  const toggleMealRowSelection = (row: OrderedMealRow, checked: boolean) => {
    const rowKey = getOrderedMealRowKey(row);

    setSelectedMealRowKeys((current) =>
      checked ? Array.from(new Set([...current, rowKey])) : current.filter((value) => value !== rowKey),
    );
  };

  const toggleAllVisibleMeals = (checked: boolean) => {
    setSelectedMealRowKeys((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...filteredOrderedMealKeys]));
      }

      return current.filter((value) => !filteredOrderedMealKeys.includes(value));
    });
  };

  const handleMarkSelectedDelivered = async () => {
    if (selectedOrderedMealRows.length === 0) return;

    try {
      for (const row of selectedOrderedMealRows) {
        await updateMealStatus(row.meal, row.order.id, "delivered", {
          silent: true,
          refetch: false,
          throwOnError: true,
        });
      }

      setSelectedMealRowKeys((current) =>
        current.filter((value) => !selectedOrderedMealRows.some((row) => getOrderedMealRowKey(row) === value)),
      );
      toast.success("Selected meals marked as delivered");
      void fetchOrders();
    } catch (error) {
      console.error("[Orders] handleMarkSelectedDelivered error", error);
      toast.error("Failed to mark selected meals as delivered");
    }
  };

  const handleExportOrders = () => {
    const exportData = filteredOrders.map((order) => ({
      order_number: order.order_number,
      customer_name: getDeliveryContactName(
        order.delivery_address,
        `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
      ),
      phone: getDeliveryContactPhone(order.delivery_address, order.profiles.phone_number || ""),
      total_meals: order.meals.reduce((sum, meal) => sum + meal.quantity, 0),
      payment_status: formatPaymentStatus(order.payment_status),
      meal_breakdown: order.meals
        .map(
          (meal) =>
            `${meal.meal_name} (${meal.scheduled_date || "-"} ${meal.scheduled_time_slot || ""}, ${meal.status})`,
        )
        .join(" | "),
      total_amount: order.total_amount,
      status: order.status,
      created_at: new Date(order.created_at).toLocaleString(),
    }));

    exportToCSV(exportData, "orders", [
      "order_number",
      "customer_name",
      "phone",
      "total_meals",
      "payment_status",
      "meal_breakdown",
      "total_amount",
      "status",
      "created_at",
    ]);
    toast.success("Orders exported successfully");
  };

  const handleExportOrderedMeals = () => {
    const exportData = filteredOrderedMeals.map((row) => ({
      order_number: row.order.order_number,
      full_name: row.fullName,
      phone: row.phone,
      location: row.location,
      meal: row.meal.meal_name,
      quantity: row.meal.quantity,
      delivery_guy: "",
      notes: getMealNoteText(row.meal),
    }));

    exportToExcel(
      exportData,
      "ordered_meals",
      ["order_number", "full_name", "phone", "location", "meal", "quantity", "delivery_guy", "notes"],
      ["Order #", "Full Name", "Phone", "Location", "Meal", "Quantity", "Delivery Guy", "Notes"],
    );
    toast.success("Ordered meals exported successfully");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="page-header">
          <h1 className="font-heading">Orders & Meals</h1>
          <p className="text-muted-foreground mt-1">
            Orders remain the payment bundle, while ordered meals run daily delivery operations.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <TabsList className="bg-muted/50 p-1">
              <TabsTrigger value="ordered-meals" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Ordered Meals
              </TabsTrigger>
              <TabsTrigger value="delivery-log" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Delivery Log
              </TabsTrigger>
              <TabsTrigger value="orders" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Orders View
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative min-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={
                    activeTab === "ordered-meals"
                      ? "Search customer, phone, meal, location..."
                      : "Search order number, customer, phone..."
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 search-input"
                />
              </div>

              {activeTab === "ordered-meals" ? (
                <Button onClick={handleExportOrderedMeals} variant="outline" className="rounded-xl h-10">
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
              ) : (
                <Button onClick={handleExportOrders} variant="outline" className="rounded-xl h-10">
                  <Download className="w-4 h-4 mr-2" />
                  Export Orders
                </Button>
              )}

              {isAdmin && (
                <Button onClick={() => setCreateDialogOpen(true)} className="rounded-xl h-10 px-4 font-semibold bg-gradient-to-r from-primary to-teal-700 shadow-lg shadow-primary/15">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Order
                </Button>
              )}
            </div>
          </div>

          <TabsContent value="ordered-meals" className="space-y-6 mt-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    {selectedMealDate ? format(selectedMealDate, "MMM dd, yyyy") : "All meal dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedMealDate}
                    onSelect={setSelectedMealDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {selectedMealDate && (
                <Button variant="ghost" className="rounded-xl h-10 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setSelectedMealDate(undefined)}>
                  Clear Date
                </Button>
              )}

              <Button variant="secondary" className="rounded-xl h-10" onClick={() => setSelectedMealDate(new Date())}>
                Today's Deliveries
              </Button>

              <Select value={selectedTimeSlot} onValueChange={setSelectedTimeSlot}>
                <SelectTrigger className="w-[180px] rounded-xl h-10 bg-card">
                  <SelectValue placeholder="Time slot" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Times</SelectItem>
                  {timeSlotOptions.map((timeSlot) => (
                    <SelectItem key={timeSlot} value={timeSlot}>
                      {timeSlot}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger className="w-[180px] rounded-xl h-10 bg-card">
                  <SelectValue placeholder="Meal type" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Meal Types</SelectItem>
                  <SelectItem value="fasting">Fasting</SelectItem>
                  <SelectItem value="non-fasting">Non-Fasting</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="secondary"
                className="rounded-xl h-10"
                onClick={() => void handleMarkSelectedDelivered()}
                disabled={selectedOrderedMealRows.length === 0 || updatingMealId !== null}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark selected delivered ({selectedOrderedMealRows.length})
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
                <p className="text-sm font-medium text-muted-foreground">Remaining Meals</p>
                <p className="text-3xl font-heading font-bold text-foreground mt-1">{orderedMealsSummary.remainingCount}</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }} className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
                <p className="text-sm font-medium text-muted-foreground">Delivered Meals</p>
                <p className="text-3xl font-heading font-bold text-foreground mt-1">{orderedMealsSummary.deliveredCount}</p>
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }} className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
                <p className="text-sm font-medium text-muted-foreground">Cancelled Meals</p>
                <p className="text-3xl font-heading font-bold text-foreground mt-1">{orderedMealsSummary.cancelledCount}</p>
              </motion.div>
            </div>

            <div className="grid gap-6">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="modern-table min-w-[900px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-border/50">
                        <TableHead className="w-[56px]">
                          <Checkbox
                            checked={
                              orderedMealsSelectionState.allSelected
                                ? true
                                : orderedMealsSelectionState.someSelected
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(checked) => toggleAllVisibleMeals(Boolean(checked))}
                            className="w-5 h-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                          />
                        </TableHead>
                        <TableHead className="w-[90px]">Order #</TableHead>
                        <TableHead className="min-w-[180px]">Customer</TableHead>
                        <TableHead className="w-[120px]">Contact</TableHead>
                        <TableHead className="min-w-[220px]">Meal Details</TableHead>
                        <TableHead className="w-[60px]">Qty</TableHead>
                        <TableHead className="min-w-[220px]">Notes</TableHead>
                        <TableHead className="w-[140px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              <p className="text-sm text-muted-foreground">Loading meals...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredOrderedMeals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <ShoppingBag className="w-10 h-10 text-muted-foreground/30" />
                              <p className="text-sm text-muted-foreground">No meals found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredOrderedMeals.map((row) => (
                          <TableRow key={getOrderedMealRowKey(row)} className="border-border/50">
                          <TableCell>
                            <Checkbox
                              checked={selectedMealRowKeys.includes(getOrderedMealRowKey(row))}
                              disabled={updatingMealId === row.meal.id}
                              onCheckedChange={(checked) => toggleMealRowSelection(row, Boolean(checked))}
                              className="w-5 h-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs">{row.order.order_number}</TableCell>
                          <TableCell>
                            <p className="font-semibold text-foreground">{row.fullName || "-"}</p>
                            <p className="text-xs text-muted-foreground max-w-[180px] truncate" title={row.location || ""}>{row.location || "-"}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{row.phone || "-"}</TableCell>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="font-semibold text-foreground">{row.meal.meal_name}</div>
                              <div className="text-xs text-muted-foreground">
                                {getMealDayName(row.meal.scheduled_date) || "Unscheduled"}
                                {row.meal.scheduled_date ? `, ${row.meal.scheduled_date}` : ""}
                                {row.meal.scheduled_time_slot ? ` · ${row.meal.scheduled_time_slot}` : ""}
                              </div>
                              <div className="flex gap-1.5 flex-wrap pt-1">
                                <span className="inline-flex items-center rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                                  {row.meal.meal_type}
                                </span>
                                <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${row.meal.status === 'delivered' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                                  {row.meal.status}
                                </Badge>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">{row.meal.quantity}</TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {getMealNoteText(row.meal) || "-"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <label className="flex items-center gap-2 text-sm cursor-pointer group">
                              <div className="relative flex items-center justify-center w-5 h-5">
                                <Checkbox
                                  checked={row.meal.status === "delivered"}
                                  disabled={updatingMealId === row.meal.id}
                                  onCheckedChange={(checked) =>
                                    void updateMealStatus(row.meal, row.order.id, checked ? "delivered" : "scheduled")
                                  }
                                  className="peer w-5 h-5 rounded-md border-muted-foreground/30 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 transition-all"
                                />
                              </div>
                              <span className="font-medium text-foreground group-hover:text-emerald-600 transition-colors">
                                {row.meal.status === "delivered" ? "Delivered" : "Mark delivered"}
                              </span>
                            </label>
                          </TableCell>
                        </TableRow>
                        ))
                      )}
                  </TableBody>
                </Table>
                </div>
              </motion.div>
            </div>
          </TabsContent>

          <TabsContent value="delivery-log" className="space-y-6 mt-6">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card p-5 shadow-card">
              <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                <div>
                  <h3 className="font-heading font-bold text-lg">Delivery Log</h3>
                  <p className="text-sm text-muted-foreground">
                    Delivered meals from the current view, separated from the ordered meals table.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Delivered</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.deliveredCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.remainingCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.cancelledCount}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                {orderedMealsSummary.delivered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <CheckCircle2 className="w-8 h-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">No delivered meals yet.</p>
                  </div>
                ) : (
                  orderedMealsSummary.delivered.map((row) => (
                    <div key={`log-${getOrderedMealRowKey(row)}`} className="rounded-xl border border-border/50 bg-muted/20 p-3 flex gap-3 items-start">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{row.meal.meal_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.fullName || "Unknown"}</p>
                        <p className="text-[10px] text-muted-foreground mt-1 tabular-nums">
                          {row.meal.scheduled_date || "No date"}{row.meal.scheduled_time_slot ? ` · ${row.meal.scheduled_time_slot}` : ""}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-6 mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    {deliveryDateFilter ? `Delivery: ${format(deliveryDateFilter, "MMM dd, yyyy")}` : "All delivery dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={deliveryDateFilter}
                    onSelect={(date) => date && setDeliveryDateFilter(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {deliveryDateFilter && (
                <Button variant="ghost" className="rounded-xl h-10 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeliveryDateFilter(undefined)}>
                  Clear Filter
                </Button>
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    {startDate ? format(startDate, "MMM dd, yyyy") : "Order Start Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent mode="single" selected={startDate} onSelect={setStartDate} initialFocus />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    {endDate ? format(endDate, "MMM dd, yyyy") : "Order End Date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent mode="single" selected={endDate} onSelect={setEndDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="modern-table min-w-[900px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="w-[100px]">Order #</TableHead>
                      <TableHead className="min-w-[180px]">Customer</TableHead>
                      <TableHead className="w-[100px]">Total Meals</TableHead>
                      <TableHead className="min-w-[150px]">Payment</TableHead>
                      <TableHead className="min-w-[200px]">Delivery Summary</TableHead>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[150px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          <p className="text-sm text-muted-foreground">Loading orders...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-3">
                          <ShoppingBag className="w-10 h-10 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground">No orders found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      (() => {
                        const customerName = getDeliveryContactName(
                          order.delivery_address,
                          `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
                        );
                        const customerPhone = getDeliveryContactPhone(
                          order.delivery_address,
                          order.profiles.phone_number || "-",
                        );
                        const activeMeals = order.meals.filter((meal) => meal.status !== "cancelled");
                        const deliveredMeals = order.meals.filter((meal) => meal.status === "delivered");
                        const nextMeal = activeMeals[0] || order.meals[0] || null;

                        return (
                          <TableRow
                            key={order.id}
                            className="cursor-pointer hover:bg-muted/50 border-border/50 transition-colors"
                            onClick={() => {
                              setSelectedOrder(order);
                              setSheetOpen(true);
                            }}
                          >
                            <TableCell className="font-mono text-xs font-semibold">{order.order_number}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-semibold text-foreground">{customerName || "Unknown"}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">{customerPhone || "-"}</p>
                              </div>
                            </TableCell>
                            <TableCell className="font-semibold tabular-nums">{order.meals.reduce((sum, meal) => sum + meal.quantity, 0)}</TableCell>
                            <TableCell>
                              <div className="space-y-1.5">
                                <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${order.payment_status === 'paid' ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-700 ring-amber-600/20'}`}>
                                  {formatPaymentStatus(order.payment_status)}
                                </Badge>
                                <p className="text-xs font-semibold text-foreground tabular-nums">
                                  ETB {order.total_amount.toLocaleString()}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {nextMeal ? (
                                <div className="space-y-1">
                                  <p className="text-sm font-medium text-foreground">
                                    {nextMeal.scheduled_date || "No date"}
                                    {nextMeal.scheduled_time_slot ? `, ${nextMeal.scheduled_time_slot}` : ""}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {activeMeals.reduce((sum, meal) => sum + meal.quantity, 0)} active ·{" "}
                                    {deliveredMeals.reduce((sum, meal) => sum + meal.quantity, 0)} delivered
                                  </p>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">No meals</span>
                              )}
                            </TableCell>
                            <TableCell className="text-muted-foreground tabular-nums">{new Date(order.created_at).toLocaleDateString()}</TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <Select
                                value={(order.status as OrderStatus) || "pending"}
                                onValueChange={(value) => void updateOrderStatus(order.id, value)}
                              >
                                <SelectTrigger className="w-32 h-8 rounded-lg text-xs bg-muted/30 border-border/50">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl">
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="confirmed">Confirmed</SelectItem>
                                  <SelectItem value="preparing">Preparing</SelectItem>
                                  <SelectItem value="delivered">Delivered</SelectItem>
                                  <SelectItem value="cancelled">Cancelled</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })()
                    ))
                  )}
                </TableBody>
              </Table>
              </div>
            </motion.div>
          </TabsContent>
        </Tabs>

        <OrderDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} order={selectedOrder} onUpdate={fetchOrders} />

        <OrderCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={fetchOrders} />
      </div>
    </DashboardLayout>
  );
};

export default Orders;
