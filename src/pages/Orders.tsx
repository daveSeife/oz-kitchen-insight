import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  AlertTriangle,
  Calendar,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  Clock3,
  CreditCard,
  Download,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  UserCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { OrderCreateDialog } from "@/components/orders/OrderCreateDialog";
import { OrderDetailSheet } from "@/components/orders/OrderDetailSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getAdminAccess } from "@/lib/adminAuth";
import { exportToCSV, exportToExcel } from "@/lib/csvExport";
import {
  formatAddressText,
  getDeliveryContactName,
  getDeliveryContactPhone,
  getMealDayName,
  normalizeDeliveryAddress,
  type NormalizedMealRecoveryAction,
  normalizeMealType,
  normalizeOrderMealRow,
  parseLegacyMealSnapshot,
  type NormalizedOrderMeal,
  type NormalizedOrderMealStatus,
} from "@/lib/orderMeals";

type OrderStatus = "pending" | "confirmed" | "preparing" | "delivered" | "cancelled";
type OrderMealRowRecord = Tables<"order_meals">;
type DeliveryRider = Tables<"delivery_riders">;

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
    assigned_rider_id?: string | null;
    assigned_rider_name?: string | null;
    assigned_rider_phone?: string | null;
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

type MealAdminAction = "missed" | "rescheduled" | "cancelled" | "refunded";
type OrdersQueryData = { orders: Order[]; isAdmin: boolean; hasMore: boolean; nextOffset: number };
type OperationalFilter =
  | "all"
  | "scheduled"
  | "delivered"
  | "recovery"
  | "cancelled"
  | "payment-pending"
  | "pending-delivery"
  | "requires-action"
  | "unaccounted";
type SubscriptionFilter =
  | "all"
  | "active"
  | "completing-soon"
  | "completed"
  | "no-meals-scheduled"
  | "payment-pending"
  | "requires-action";
type SubscriptionSortKey = "subscriber" | "remaining" | "nextMeal" | "ends";
type SortDirection = "asc" | "desc";

interface SubscriptionDashboardRow {
  id: string;
  userId: string;
  planId: string;
  customerName: string;
  phone: string;
  planName: string;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string;
  orderCount: number;
  totalMeals: number;
  deliveredMeals: number;
  remainingMeals: number;
  hasFutureMeals: boolean;
  nextMealDate: string | null;
  meals: SubscriptionMealDetail[];
}

interface SubscriptionMealDetail {
  id: string;
  orderId: string;
  orderNumber: string;
  orderPaymentStatus: string;
  mealName: string;
  mealType: string;
  quantity: number;
  status: NormalizedOrderMealStatus;
  scheduledDate: string;
  scheduledTimeSlot: string;
  customerNote: string | null;
}

export const ORDERS_QUERY_KEY = ["orders"] as const;
const SUBSCRIPTIONS_QUERY_KEY = ["subscriptions-dashboard"] as const;
const DELIVERY_RIDERS_QUERY_KEY = ["delivery-riders"] as const;
const ORDER_MEALS_PAGE_SIZE = 250;
const WEEKLY_ORDER_MEALS_PAGE_SIZE = 1000;
const INITIAL_VISIBLE_ORDER_MEALS = 250;
const INITIAL_VISIBLE_ORDERS = 100;
const INITIAL_VISIBLE_DELIVERIES = 200;
const INITIAL_VISIBLE_WEEKLY_CUSTOMERS = 100;
const LOW_REMAINING_MEALS_THRESHOLD = 3;
const VALID_MEAL_STATUSES = new Set(["scheduled", "delivered", "missed", "rescheduled", "modified", "cancelled", "refunded"]);

const WEEKDAY_COLUMNS = [
  { label: "Monday", shortLabel: "Mon", dayOffset: 0 },
  { label: "Tuesday", shortLabel: "Tue", dayOffset: 1 },
  { label: "Wednesday", shortLabel: "Wed", dayOffset: 2 },
  { label: "Thursday", shortLabel: "Thu", dayOffset: 3 },
  { label: "Friday", shortLabel: "Fri", dayOffset: 4 },
] as const;

const SUPABASE_IN_FILTER_BATCH_SIZE = 25;
const toDateKey = (date: Date) => format(date, "yyyy-MM-dd");

const chunkArray = <T,>(items: T[], size: number) => {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
};

const getMondayForWeek = (date: Date) => {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const distanceFromMonday = day === 0 ? 6 : day - 1;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - distanceFromMonday);
  return weekStart;
};

const addDays = (date: Date, amount: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
};

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

const isPaymentConfirmed = (paymentStatus?: string | null) =>
  paymentStatus === "paid" || paymentStatus === "partial" || paymentStatus === "completed";

const isExcludedPaymentStatus = (paymentStatus?: string | null) =>
  paymentStatus === "failed" || paymentStatus === "refunded";

const getExportAddressParts = (deliveryAddress: unknown) => {
  const address = normalizeDeliveryAddress(deliveryAddress);
  const buildingDetails = [address.buildingNumber, address.specialInstructions]
    .filter(Boolean)
    .join(", ");

  return {
    zone: address.zone,
    street: address.street,
    building_details: buildingDetails,
  };
};

const isInactiveMealStatus = (status: NormalizedOrderMealStatus) =>
  status === "cancelled" || status === "refunded";

const isRecoveryMealStatus = (status: NormalizedOrderMealStatus) =>
  status === "missed" || status === "rescheduled" || status === "modified";

const isPendingPaymentStatus = (paymentStatus?: string | null) => !isPaymentConfirmed(paymentStatus) && !isExcludedPaymentStatus(paymentStatus);

const getMealDateTime = (meal: NormalizedOrderMeal) => {
  if (!meal.scheduled_date) return null;

  const timeMatch = (meal.scheduled_time_slot || "").match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/i);
  const date = new Date(meal.scheduled_date);

  if (timeMatch) {
    let hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2] || 0);
    const meridiem = timeMatch[3]?.toUpperCase();

    if (meridiem === "PM" && hours < 12) hours += 12;
    if (meridiem === "AM" && hours === 12) hours = 0;
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(23, 59, 59, 999);
  }

  return Number.isNaN(date.getTime()) ? null : date;
};

const isPendingDeliveryMeal = (row: OrderedMealRow) => {
  if (row.meal.status === "delivered" || isInactiveMealStatus(row.meal.status)) return false;
  const scheduledAt = getMealDateTime(row.meal);
  return scheduledAt ? scheduledAt < new Date() : false;
};

const isUnaccountedMeal = (row: OrderedMealRow) => !VALID_MEAL_STATUSES.has(row.meal.status);

const deriveOrderStatusFromMeals = (meals: NormalizedOrderMeal[], currentStatus?: string | null): OrderStatus => {
  if (meals.length === 0) {
    return (currentStatus as OrderStatus) || "pending";
  }

  const activeMeals = meals.filter((meal) => !isInactiveMealStatus(meal.status));
  if (activeMeals.length === 0) return "cancelled";
  if (activeMeals.every((meal) => meal.status === "delivered")) return "delivered";
  if (
    activeMeals.some((meal) =>
      meal.status === "delivered" ||
      meal.status === "missed" ||
      meal.status === "rescheduled" ||
      meal.status === "modified",
    )
  ) {
    return "preparing";
  }

  if (currentStatus === "pending" || currentStatus === "confirmed" || currentStatus === "preparing") {
    return currentStatus;
  }

  return "confirmed";
};

const Orders = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<SubscriptionDashboardRow | null>(null);
  const [subscriptionSheetOpen, setSubscriptionSheetOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("ordered-meals");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [selectedMealDate, setSelectedMealDate] = useState<Date>(new Date());
  const [selectedWeekDate, setSelectedWeekDate] = useState<Date>(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("all");
  const [selectedMealType, setSelectedMealType] = useState("all");
  const [selectedDeliveryRider, setSelectedDeliveryRider] = useState("all");
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false);
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>("all");
  const [subscriptionFilter, setSubscriptionFilter] = useState<SubscriptionFilter>("all");
  const [subscriptionSort, setSubscriptionSort] = useState<{
    key: SubscriptionSortKey;
    direction: SortDirection;
  } | null>(null);
  const [updatingMealId, setUpdatingMealId] = useState<string | null>(null);
  const [updatingCustomerId, setUpdatingCustomerId] = useState<string | null>(null);
  const [selectedMealRowKeys, setSelectedMealRowKeys] = useState<string[]>([]);
  const [recoveryDialogOpen, setRecoveryDialogOpen] = useState(false);
  const [recoveryTargetRow, setRecoveryTargetRow] = useState<OrderedMealRow | null>(null);
  const [recoveryAction, setRecoveryAction] = useState<MealAdminAction>("missed");
  const [recoveryDate, setRecoveryDate] = useState("");
  const [recoveryTimeSlot, setRecoveryTimeSlot] = useState("");
  const [recoveryReason, setRecoveryReason] = useState("");
  const [recoveryNotes, setRecoveryNotes] = useState("");
  const [recoveryRefundAmount, setRecoveryRefundAmount] = useState("");
  const [visibleOrderedMealCount, setVisibleOrderedMealCount] = useState(INITIAL_VISIBLE_ORDER_MEALS);
  const [visibleOrderCount, setVisibleOrderCount] = useState(INITIAL_VISIBLE_ORDERS);
  const [visibleDeliveryCount, setVisibleDeliveryCount] = useState(INITIAL_VISIBLE_DELIVERIES);
  const [visibleWeeklyCustomerCount, setVisibleWeeklyCustomerCount] = useState(INITIAL_VISIBLE_WEEKLY_CUSTOMERS);
  const selectedMealDateKey = useMemo(() => toDateKey(selectedMealDate), [selectedMealDate]);
  const selectedWeekStartKey = useMemo(() => toDateKey(getMondayForWeek(selectedWeekDate)), [selectedWeekDate]);

  const formatPaymentStatus = (value?: string | null) => {
    if (!value) return "pending";
    if (value === "paid") return "paid";
    return value;
  };

  const getPaymentStatusTone = (value?: string | null) => {
    if (value === "paid" || value === "partial" || value === "completed") {
      return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
    }

    if (value === "failed" || value === "refunded") {
      return "bg-rose-50 text-rose-700 ring-rose-600/20";
    }

    return "bg-amber-50 text-amber-700 ring-amber-600/20";
  };

  const getMealStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-amber-100 text-amber-800",
      modified: "bg-sky-100 text-sky-800",
      missed: "bg-orange-100 text-orange-800",
      rescheduled: "bg-cyan-100 text-cyan-800",
      delivered: "bg-emerald-100 text-emerald-800",
      cancelled: "bg-rose-100 text-rose-800",
      refunded: "bg-slate-100 text-slate-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const getMealRecoveryLabel = (meal: NormalizedOrderMeal) => {
    if (meal.status === "refunded") {
      return meal.refund_amount ? `Refunded ETB ${meal.refund_amount.toLocaleString()}` : "Refunded";
    }

    if (meal.status === "rescheduled") {
      return `Rescheduled to ${meal.scheduled_date || "-"}${meal.scheduled_time_slot ? `, ${meal.scheduled_time_slot}` : ""}`;
    }

    if (meal.status === "missed") {
      return meal.recovery_reason || "Missed delivery under review";
    }

    if (meal.status === "cancelled") {
      return meal.recovery_reason || "Cancelled";
    }

    return null;
  };

  const invalidateOrders = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
  }, [queryClient]);

  const normalizeOrders = async (
    ordersData: Tables<"orders">[],
    paymentsData: LatestPaymentRecord[],
    orderMealsData: OrderMealRowRecord[] | null,
    profilesData: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone_number: string | null;
      assigned_rider_id?: string | null;
      assigned_rider_name?: string | null;
      assigned_rider_phone?: string | null;
    }>,
  ) => {
    const profileMap = Object.fromEntries(
      (profilesData || []).map((profile) => [
        profile.id,
        {
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          phone_number: profile.phone_number || "",
          assigned_rider_id: profile.assigned_rider_id || null,
          assigned_rider_name: profile.assigned_rider_name || null,
          assigned_rider_phone: profile.assigned_rider_phone || null,
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

    for (const row of orderMealsData || []) {
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

    const mealCatalogData: Array<{ id: string; name: string; meal_type: string | null }> = [];
    for (const mealIdBatch of chunkArray(Array.from(mealIds), SUPABASE_IN_FILTER_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("meals")
        .select("id, name, meal_type")
        .in("id", mealIdBatch);

      if (error) throw error;
      mealCatalogData.push(...(data || []));
    }

    const mealCatalogMap = new Map(
      mealCatalogData.map((meal) => [meal.id, meal]),
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

    return (ordersData || []).map((order) => {
      const structuredMeals = (mealsByOrder.get(order.id) || []).map(enrichMeal);
      const fallbackMeals = (fallbackMealsByOrder.get(order.id) || []).map(enrichMeal);

      const meals = (structuredMeals.length > 0 ? structuredMeals : dedupeMeals(fallbackMeals)).sort((a, b) => {
        const left = `${a.scheduled_date || ""} ${a.scheduled_time_slot || ""}`;
        const right = `${b.scheduled_date || ""} ${b.scheduled_time_slot || ""}`;
        return left.localeCompare(right);
      });

      return {
        ...order,
        status: order.status || "pending",
        payment_status: order.payment_status || "pending",
        profiles: profileMap[order.user_id] || {
          first_name: "",
          last_name: "",
          phone_number: "",
          assigned_rider_id: null,
          assigned_rider_name: null,
          assigned_rider_phone: null,
        },
        meals,
      };
    });
  };

  const fetchOrders = async ({ pageParam = 0 }: { pageParam?: unknown }): Promise<OrdersQueryData> => {
    const pageOffset = typeof pageParam === "number" ? pageParam : 0;
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { orders: [], isAdmin: false, hasMore: false, nextOffset: 0 };
    }

    const adminAccess = await getAdminAccess(user.id);
    const currentUserIsAdmin = adminAccess.hasAccess;

    const orderMealsQuery = supabase
      .from("order_meals")
      .select(
        "id, order_id, assigned_rider_id, assigned_rider_name, assigned_rider_phone, meal_id, meal_name, scheduled_date, scheduled_time_slot, status, quantity, unit_price, metadata, customer_note, created_at"
      )
      .eq("scheduled_date", selectedMealDateKey)
      .order("scheduled_time_slot", { ascending: true })
      .order("created_at", { ascending: true })
      .range(pageOffset, pageOffset + ORDER_MEALS_PAGE_SIZE);

    const { data: orderMealsPage, error: orderMealsPageError } = await orderMealsQuery;
    if (orderMealsPageError && !isMissingOrderMealsTableError(orderMealsPageError)) {
      throw orderMealsPageError;
    }

    const orderMealsData = ((orderMealsPage || []) as OrderMealRowRecord[]).slice(0, ORDER_MEALS_PAGE_SIZE);
    const hasMoreOrderMeals = (orderMealsPage || []).length > ORDER_MEALS_PAGE_SIZE;
    const orderIds = Array.from(new Set(orderMealsData.map((meal) => meal.order_id)));

    let ordersQuery = orderIds.length > 0
      ? supabase
          .from("orders")
          .select(
            "id, user_id, order_number, total_amount, status, payment_status, created_at, delivery_address, delivery_date, delivery_time_slot, notes, subtotal, delivery_fee, discount_amount, payment_method, meal_plan_id"
          )
          .in("id", orderIds)
      : null;

    if (ordersQuery && !currentUserIsAdmin) {
      ordersQuery = ordersQuery.eq("user_id", user.id);
    }

    const { data: fetchedOrders, error: ordersError } = ordersQuery
      ? await ordersQuery
      : { data: [], error: null };

    if (ordersError) throw ordersError;

    const orderSort = new Map(orderIds.map((orderId, index) => [orderId, index]));
    const ordersData = ((fetchedOrders || []) as Tables<"orders">[]).sort(
      (left, right) => (orderSort.get(left.id) ?? 0) - (orderSort.get(right.id) ?? 0),
    );
    const visibleOrderIds = new Set(ordersData.map((order) => order.id));
    const visibleOrderMealsData = orderMealsData.filter((meal) => visibleOrderIds.has(meal.order_id));
    const userIds = Array.from(new Set(ordersData.map((order) => order.user_id).filter(Boolean)));

    const [{ data: profilesData, error: profilesError }, { data: paymentsData, error: paymentsError }] =
      await Promise.all([
        userIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, first_name, last_name, phone_number, assigned_rider_id, assigned_rider_name, assigned_rider_phone")
              .in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        orderIds.length > 0
          ? supabase
              .from("payments")
              .select("id, order_id, payment_gateway_response, created_at")
              .in("order_id", orderIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (profilesError) throw profilesError;
    if (paymentsError) throw paymentsError;

    const normalizedOrders = await normalizeOrders(
      ordersData,
      (paymentsData || []) as LatestPaymentRecord[],
      visibleOrderMealsData,
      profilesData || [],
    );

    const nextOffset = pageOffset + ORDER_MEALS_PAGE_SIZE;
    return {
      orders: normalizedOrders,
      isAdmin: currentUserIsAdmin,
      hasMore: hasMoreOrderMeals,
      nextOffset,
    };
  };

  const fetchWeeklyOrders = async (): Promise<Order[]> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const adminAccess = await getAdminAccess(user.id);
    const currentUserIsAdmin = adminAccess.hasAccess;
    const weekStart = getMondayForWeek(selectedWeekDate);
    const weekEnd = addDays(weekStart, 4);
    const weekStartKey = toDateKey(weekStart);
    const weekEndKey = toDateKey(weekEnd);
    const orderMealsData: OrderMealRowRecord[] = [];
    let pageOffset = 0;

    while (true) {
      const { data, error } = await supabase
        .from("order_meals")
        .select(
          "id, order_id, assigned_rider_id, assigned_rider_name, assigned_rider_phone, meal_id, meal_name, scheduled_date, scheduled_time_slot, status, quantity, unit_price, metadata, customer_note, created_at"
        )
        .gte("scheduled_date", weekStartKey)
        .lte("scheduled_date", weekEndKey)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time_slot", { ascending: true })
        .order("created_at", { ascending: true })
        .range(pageOffset, pageOffset + WEEKLY_ORDER_MEALS_PAGE_SIZE - 1);

      if (error) {
        if (isMissingOrderMealsTableError(error)) return [];
        throw error;
      }

      const rows = (data || []) as OrderMealRowRecord[];
      orderMealsData.push(...rows);

      if (rows.length < WEEKLY_ORDER_MEALS_PAGE_SIZE) break;
      pageOffset += WEEKLY_ORDER_MEALS_PAGE_SIZE;
    }

    const orderIds = Array.from(new Set(orderMealsData.map((meal) => meal.order_id)));
    if (orderIds.length === 0) return [];

    let ordersQuery = supabase.from("orders").select("*").in("id", orderIds);
    if (!currentUserIsAdmin) {
      ordersQuery = ordersQuery.eq("user_id", user.id);
    }

    const { data: fetchedOrders, error: ordersError } = await ordersQuery;
    if (ordersError) throw ordersError;

    const orderSort = new Map(orderIds.map((orderId, index) => [orderId, index]));
    const ordersData = ((fetchedOrders || []) as Tables<"orders">[]).sort(
      (left, right) => (orderSort.get(left.id) ?? 0) - (orderSort.get(right.id) ?? 0),
    );
    const visibleOrderIds = new Set(ordersData.map((order) => order.id));
    const visibleOrderMealsData = orderMealsData.filter((meal) => visibleOrderIds.has(meal.order_id));
    const normalizedOrderIds = ordersData.map((order) => order.id);
    const userIds = Array.from(new Set(ordersData.map((order) => order.user_id).filter(Boolean)));

    const [{ data: profilesData, error: profilesError }, { data: paymentsData, error: paymentsError }] =
      await Promise.all([
        userIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, first_name, last_name, phone_number, assigned_rider_id, assigned_rider_name, assigned_rider_phone")
              .in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        normalizedOrderIds.length > 0
          ? supabase
              .from("payments")
              .select("id, order_id, payment_gateway_response, created_at")
              .in("order_id", normalizedOrderIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (profilesError) throw profilesError;
    if (paymentsError) throw paymentsError;

    return normalizeOrders(
      ordersData,
      (paymentsData || []) as LatestPaymentRecord[],
      visibleOrderMealsData,
      profilesData || [],
    );
  };

  const fetchSubscriptions = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return [];

    const adminAccess = await getAdminAccess(user.id);
    const currentUserIsAdmin = adminAccess.hasAccess;

    type SubscriptionDashboardQueryRow = Pick<
      Tables<"user_subscriptions">,
      "id" | "user_id" | "plan_id" | "status" | "payment_status" | "start_date" | "end_date" | "created_at"
    >;

    let subscriptionsQuery = supabase
      .from("user_subscriptions")
      .select("id, user_id, plan_id, status, payment_status, start_date, end_date, created_at")
      .order("created_at", { ascending: false });

    if (!currentUserIsAdmin) {
      subscriptionsQuery = subscriptionsQuery.eq("user_id", user.id);
    }

    const { data: subscriptionRowsData, error: subscriptionsError } = await subscriptionsQuery;
    let subscriptionRows = (subscriptionRowsData || []) as SubscriptionDashboardQueryRow[];

    if (subscriptionsError) {
      console.warn(
        "[Orders] user_subscriptions payment_status query failed; retrying without payment_status",
        subscriptionsError,
      );

      let fallbackSubscriptionsQuery = supabase
        .from("user_subscriptions")
        .select("id, user_id, plan_id, status, start_date, end_date, created_at")
        .order("created_at", { ascending: false });

      if (!currentUserIsAdmin) {
        fallbackSubscriptionsQuery = fallbackSubscriptionsQuery.eq("user_id", user.id);
      }

      const { data: fallbackSubscriptionRows, error: fallbackSubscriptionsError } =
        await fallbackSubscriptionsQuery;

      if (fallbackSubscriptionsError) throw fallbackSubscriptionsError;

      subscriptionRows = (fallbackSubscriptionRows || []).map((subscription) => ({
        ...subscription,
        payment_status: "pending",
      })) as SubscriptionDashboardQueryRow[];
    }

    const userIds = Array.from(new Set((subscriptionRows || []).map((subscription) => subscription.user_id)));
    const planIds = Array.from(new Set((subscriptionRows || []).map((subscription) => subscription.plan_id)));

    const buildBaseSubscriptionRows = (): SubscriptionDashboardRow[] =>
      (subscriptionRows || []).map((subscription) => ({
        id: subscription.id,
        userId: subscription.user_id,
        planId: subscription.plan_id,
        customerName: "Unknown user",
        phone: "",
        planName: "Unknown plan",
        status: subscription.status || "unknown",
        paymentStatus: subscription.payment_status || "pending",
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        orderCount: 0,
        totalMeals: 0,
        deliveredMeals: 0,
        remainingMeals: 0,
        hasFutureMeals: false,
        nextMealDate: null,
        meals: [],
      }));

    try {
    const profilesData: Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      phone_number: string | null;
    }> = [];
    const plansData: Array<{ id: string; name: string }> = [];

    for (const userIdBatch of chunkArray(userIds, SUPABASE_IN_FILTER_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, phone_number")
        .in("id", userIdBatch);

      if (error) throw error;
      profilesData.push(...(data || []));
    }

    for (const planIdBatch of chunkArray(planIds, SUPABASE_IN_FILTER_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, name")
        .in("id", planIdBatch);

      if (error) throw error;
      plansData.push(...(data || []));
    }

    const ordersData: Tables<"orders">[] = [];
    for (const userIdBatch of chunkArray(userIds, SUPABASE_IN_FILTER_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, user_id, order_number, total_amount, status, payment_status, created_at, delivery_address, delivery_date, delivery_time_slot, notes, subtotal, delivery_fee, discount_amount, payment_method, meal_plan_id"
        )
        .in("user_id", userIdBatch);

      if (error) throw error;
      ordersData.push(...((data || []) as Tables<"orders">[]));
    }

    const orderIds = Array.from(new Set(ordersData.map((order) => order.id)));
    const orderMealsData: OrderMealRowRecord[] = [];
    const orderMealsPageSize = 1000;

    for (const orderIdBatch of chunkArray(orderIds, SUPABASE_IN_FILTER_BATCH_SIZE)) {
      let orderMealsOffset = 0;

      while (orderIdBatch.length > 0) {
        const { data, error } = await supabase
          .from("order_meals")
          .select(
            "id, order_id, assigned_rider_id, assigned_rider_name, assigned_rider_phone, meal_id, meal_name, scheduled_date, scheduled_time_slot, status, quantity, unit_price, metadata, customer_note, created_at"
          )
          .in("order_id", orderIdBatch)
          .order("scheduled_date", { ascending: true })
          .order("scheduled_time_slot", { ascending: true })
          .range(orderMealsOffset, orderMealsOffset + orderMealsPageSize - 1);

        if (error) {
          if (isMissingOrderMealsTableError(error)) break;
          throw error;
        }

        const rows = (data || []) as OrderMealRowRecord[];
        orderMealsData.push(...rows);
        if (rows.length < orderMealsPageSize) break;
        orderMealsOffset += orderMealsPageSize;
      }
    }

    const paymentsData: LatestPaymentRecord[] = [];
    for (const orderIdBatch of chunkArray(orderIds, SUPABASE_IN_FILTER_BATCH_SIZE)) {
      const { data, error } = await supabase
        .from("payments")
        .select("id, order_id, payment_gateway_response, created_at")
        .in("order_id", orderIdBatch)
        .order("created_at", { ascending: false });

      if (error) throw error;
      paymentsData.push(...((data || []) as LatestPaymentRecord[]));
    }

    const normalizedOrders = await normalizeOrders(
      ordersData,
      paymentsData,
      orderMealsData,
      profilesData || [],
    );

    const ordersByUser = new Map<string, Order[]>();
    for (const order of normalizedOrders) {
      const existing = ordersByUser.get(order.user_id) || [];
      existing.push(order);
      ordersByUser.set(order.user_id, existing);
    }

    const profileMap = new Map((profilesData || []).map((profile) => [profile.id, profile]));
    const planMap = new Map((plansData || []).map((plan) => [plan.id, plan]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isDateInSubscriptionWindow = (dateValue: string | null | undefined, startDate: string, endDate: string) => {
      if (!dateValue) return false;
      const date = new Date(dateValue);
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (Number.isNaN(date.getTime())) return false;
      if (!Number.isNaN(start.getTime()) && date < start) return false;
      if (!Number.isNaN(end.getTime()) && date > end) return false;

      return true;
    };

    const isOrderInSubscription = (
      order: Order,
      subscription: Pick<Tables<"user_subscriptions">, "user_id" | "plan_id" | "start_date" | "end_date">,
    ) => {
      if (order.user_id !== subscription.user_id) return false;

      const planMatches = order.meal_plan_id === subscription.plan_id;
      const planUnknown = !order.meal_plan_id;
      const orderDateMatches = isDateInSubscriptionWindow(
        order.delivery_date || order.created_at,
        subscription.start_date,
        subscription.end_date,
      );
      const mealDateMatches = order.meals.some((meal) =>
        isDateInSubscriptionWindow(meal.scheduled_date, subscription.start_date, subscription.end_date),
      );

      return planMatches || (planUnknown && (orderDateMatches || mealDateMatches));
    };

    return (subscriptionRows || []).map((subscription) => {
      const profile = profileMap.get(subscription.user_id);
      const plan = planMap.get(subscription.plan_id);
      const subscriptionOrders = (ordersByUser.get(subscription.user_id) || []).filter((order) =>
        isOrderInSubscription(order, subscription),
      );
      const meals = subscriptionOrders
        .flatMap((order) =>
          order.meals.map((meal) => ({
            id: `${order.id}:${getMealRefKey(meal)}`,
            orderId: order.id,
            orderNumber: order.order_number,
            orderPaymentStatus: order.payment_status || "pending",
            mealName: meal.meal_name,
            mealType: meal.meal_type,
            quantity: meal.quantity || 0,
            status: meal.status,
            scheduledDate: meal.scheduled_date,
            scheduledTimeSlot: meal.scheduled_time_slot,
            customerNote: meal.customer_note,
          })),
        )
        .sort((left, right) =>
          [
            left.scheduledDate || "",
            left.scheduledTimeSlot || "",
            left.mealName.toLowerCase(),
          ]
            .join("::")
            .localeCompare(
              [
                right.scheduledDate || "",
                right.scheduledTimeSlot || "",
                right.mealName.toLowerCase(),
              ].join("::"),
            ),
        );
      const activeMeals = meals.filter((meal) => !isInactiveMealStatus(meal.status));
      const futureMeals = activeMeals.filter((meal) => {
        if (meal.status === "delivered") return false;
        const scheduledAt = getMealDateTime({
          scheduled_date: meal.scheduledDate,
          scheduled_time_slot: meal.scheduledTimeSlot,
        } as NormalizedOrderMeal);
        return scheduledAt ? scheduledAt >= today : false;
      });
      const sortedFutureMeals = [...futureMeals].sort((left, right) => {
        const leftTime = getMealDateTime({
          scheduled_date: left.scheduledDate,
          scheduled_time_slot: left.scheduledTimeSlot,
        } as NormalizedOrderMeal)?.getTime() || Number.MAX_SAFE_INTEGER;
        const rightTime = getMealDateTime({
          scheduled_date: right.scheduledDate,
          scheduled_time_slot: right.scheduledTimeSlot,
        } as NormalizedOrderMeal)?.getTime() || Number.MAX_SAFE_INTEGER;

        return leftTime - rightTime;
      });
      const paidOrderCount = subscriptionOrders.filter((order) => isPaymentConfirmed(order.payment_status)).length;
      const unpaidOrderCount = subscriptionOrders.filter((order) => isPendingPaymentStatus(order.payment_status)).length;
      const resolvedPaymentStatus =
        subscriptionOrders.length === 0
          ? subscription.payment_status || "pending"
          : paidOrderCount === subscriptionOrders.length
            ? "paid"
            : paidOrderCount > 0 && unpaidOrderCount > 0
              ? "partial"
              : subscriptionOrders.some((order) => order.payment_status === "failed")
                ? "failed"
                : subscriptionOrders.some((order) => order.payment_status === "refunded")
                  ? "refunded"
                  : "pending";

      return {
        id: subscription.id,
        userId: subscription.user_id,
        planId: subscription.plan_id,
        customerName: `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown user",
        phone: profile?.phone_number || "",
        planName: plan?.name || "Unknown plan",
        status: subscription.status || "unknown",
        paymentStatus: resolvedPaymentStatus,
        startDate: subscription.start_date,
        endDate: subscription.end_date,
        orderCount: subscriptionOrders.length,
        totalMeals: meals.reduce((sum, meal) => sum + meal.quantity, 0),
        deliveredMeals: meals
          .filter((meal) => meal.status === "delivered")
          .reduce((sum, meal) => sum + meal.quantity, 0),
        remainingMeals: futureMeals.reduce((sum, meal) => sum + meal.quantity, 0),
        hasFutureMeals: futureMeals.length > 0,
        nextMealDate: sortedFutureMeals[0]?.scheduledDate || null,
        meals,
      } satisfies SubscriptionDashboardRow;
    });
    } catch (error) {
      console.error("[Orders] fetchSubscriptions enrichment error", error);
      return buildBaseSubscriptionRows();
    }
  };

  const fetchDeliveryRiders = async () => {
    const { data, error } = await supabase
      .from("delivery_riders")
      .select("*")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;
    return (data || []) as DeliveryRider[];
  };

  const {
    data: ordersQueryData,
    error: ordersError,
    isLoading: loading,
    isFetchingNextPage: loadingMoreOrders,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: [...ORDERS_QUERY_KEY, selectedMealDateKey],
    queryFn: fetchOrders,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextOffset : undefined),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const {
    data: subscriptionRows = [],
    error: subscriptionsError,
    isLoading: subscriptionsLoading,
  } = useQuery({
    queryKey: SUBSCRIPTIONS_QUERY_KEY,
    queryFn: fetchSubscriptions,
    enabled: activeTab === "subscriptions",
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const {
    data: weeklyOrders = [],
    error: weeklyOrdersError,
    isLoading: weeklyOrdersLoading,
    isFetching: weeklyOrdersFetching,
  } = useQuery({
    queryKey: [...ORDERS_QUERY_KEY, "weekly", selectedWeekStartKey],
    queryFn: fetchWeeklyOrders,
    enabled: activeTab === "weekly-meals",
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const {
    data: deliveryRiders = [],
    error: deliveryRidersError,
  } = useQuery({
    queryKey: DELIVERY_RIDERS_QUERY_KEY,
    queryFn: fetchDeliveryRiders,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const orders = useMemo(() => {
    const orderMap = new Map<string, Order>();
    for (const page of ordersQueryData?.pages || []) {
      for (const order of page.orders) {
        if (!orderMap.has(order.id)) {
          orderMap.set(order.id, order);
        }
      }
    }

    return Array.from(orderMap.values());
  }, [ordersQueryData?.pages]);
  const isAdmin = ordersQueryData?.pages[0]?.isAdmin || false;
  const selectedOrderId = selectedOrder?.id;

  useEffect(() => {
    if (!selectedOrderId) return;

    const refreshedOrder = orders.find((order) => order.id === selectedOrderId) || null;
    setSelectedOrder(refreshedOrder);
    if (!refreshedOrder) {
      setSheetOpen(false);
    }
  }, [orders, selectedOrderId]);

  useEffect(() => {
    if (!ordersError) return;
    console.error("[Orders] fetchOrders error", ordersError);
    toast.error("Failed to fetch orders");
  }, [ordersError]);

  useEffect(() => {
    if (!subscriptionsError) return;
    console.error("[Orders] fetchSubscriptions error", subscriptionsError);
    toast.error("Failed to fetch subscriptions");
  }, [subscriptionsError]);

  useEffect(() => {
    if (!weeklyOrdersError) return;
    console.error("[Orders] fetchWeeklyOrders error", weeklyOrdersError);
    toast.error("Failed to fetch weekly meals");
  }, [weeklyOrdersError]);

  useEffect(() => {
    if (!deliveryRidersError) return;
    console.error("[Orders] fetchDeliveryRiders error", deliveryRidersError);
    toast.error("Failed to fetch delivery riders");
  }, [deliveryRidersError]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const targetOrder = orders.find((order) => order.id === orderId);
      if (
        targetOrder &&
        ["confirmed", "preparing", "delivered"].includes(newStatus) &&
        !isPaymentConfirmed(targetOrder.payment_status)
      ) {
        toast.error("Confirm payment before moving this order into fulfilment.");
        return;
      }

      const { error } = await supabase.from("orders").update({ status: newStatus }).eq("id", orderId);

      if (error) throw error;
      queryClient.setQueryData<OrdersQueryData>(ORDERS_QUERY_KEY, (current) =>
        current
          ? {
              ...current,
              orders: current.orders.map((order) =>
                order.id === orderId ? { ...order, status: newStatus } : order,
              ),
            }
          : current,
      );
      setSelectedOrder((current) =>
        current?.id === orderId ? { ...current, status: newStatus } : current,
      );
      toast.success("Order status updated");
    } catch (error) {
      toast.error("Failed to update order status");
    }
  };

  const updateMealRecord = async (
    meal: NormalizedOrderMeal,
    order: Order,
    updates: Partial<Tables<"order_meals">> & {
      status?: NormalizedOrderMealStatus;
      recovery_action?: NormalizedMealRecoveryAction | null;
    },
    successMessage: string,
    options?: { silent?: boolean; refetch?: boolean; throwOnError?: boolean; syncOrderStatus?: boolean },
  ) => {
    try {
      setUpdatingMealId(meal.id);

      if (
        (updates.status === "delivered" || updates.status === "missed" || updates.status === "rescheduled") &&
        !isPaymentConfirmed(order.payment_status)
      ) {
        throw new Error("Confirm payment before progressing this meal.");
      }

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
          .update(updates)
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
            ...updates,
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

      let nextOrderStatus: OrderStatus | null = null;

      if (options?.syncOrderStatus !== false) {
        const refreshedOrderMealsResponse = await supabase
          .from("order_meals")
          .select("*")
          .eq("order_id", order.id);

        if (!refreshedOrderMealsResponse.error) {
          const refreshedMeals = ((refreshedOrderMealsResponse.data as OrderMealRowRecord[] | null) || []).map((row) =>
            normalizeOrderMealRow(row),
          );
          nextOrderStatus = deriveOrderStatusFromMeals(refreshedMeals, order.status);
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

            const legacyMeals = parseLegacyMealSnapshot(order.id, paymentRecord?.payment_gateway_response);
            nextOrderStatus = deriveOrderStatusFromMeals(legacyMeals, order.status);
          }
        } else {
          throw refreshedOrderMealsResponse.error;
        }
      }

      if (nextOrderStatus) {
        const { error: orderStatusError } = await supabase
          .from("orders")
          .update({ status: nextOrderStatus })
          .eq("id", order.id);

        if (orderStatusError) throw orderStatusError;
      }

      if (options?.refetch !== false) {
        invalidateOrders();
      }

      if (!options?.silent) {
        toast.success(successMessage);
      }
      return true;
    } catch (error) {
      console.error("[Orders] updateMealStatus error", error);
      if (options?.throwOnError) {
        throw error;
      }

      toast.error(error instanceof Error ? error.message : "Failed to update meal");
      return false;
    } finally {
      setUpdatingMealId(null);
    }
  };

  const updateMealStatus = async (
    meal: NormalizedOrderMeal,
    order: Order,
    nextStatus: "scheduled" | "delivered",
    options?: { silent?: boolean; refetch?: boolean; throwOnError?: boolean; syncOrderStatus?: boolean },
  ) => {
    return updateMealRecord(
      meal,
      order,
      {
        status: nextStatus,
        recovery_action: nextStatus === "scheduled" ? "none" : meal.recovery_action,
        recovery_reason: nextStatus === "scheduled" ? null : meal.recovery_reason,
        recovery_notes: nextStatus === "scheduled" ? null : meal.recovery_notes,
        refund_amount: nextStatus === "scheduled" ? null : meal.refund_amount,
      },
      nextStatus === "delivered" ? "Meal marked as delivered" : "Meal returned to scheduled",
      options,
    );
  };

  const handleAssignDeliveryRider = async (row: OrderedMealRow, riderId: string) => {
    const rider = deliveryRiders.find((item) => item.id === riderId) || null;

    try {
      setUpdatingCustomerId(row.order.user_id);

      const { error } = await supabase
        .from("profiles")
        .update({
          assigned_rider_id: rider?.id || null,
          assigned_rider_name: rider?.name || null,
          assigned_rider_phone: rider?.phone_number || null,
        })
        .eq("id", row.order.user_id);

      if (error) throw error;

      await queryClient.invalidateQueries({ queryKey: ORDERS_QUERY_KEY });
      toast.success(rider ? `${rider.name} assigned to ${row.fullName || "customer"}` : "Customer rider assignment removed");
    } catch (error) {
      console.error("[Orders] handleAssignDeliveryRider error", error);
      toast.error(error instanceof Error ? error.message : "Failed to update customer rider");
    } finally {
      setUpdatingCustomerId(null);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (isExcludedPaymentStatus(order.payment_status)) {
        return false;
      }

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

      return matchesSearch && matchesStartDate && matchesEndDate;
    });
  }, [endDate, orders, search, startDate]);

  const displayedFilteredOrders = useMemo(
    () => filteredOrders.slice(0, visibleOrderCount),
    [filteredOrders, visibleOrderCount],
  );

  const orderedMealRows = useMemo<OrderedMealRow[]>(() => {
    const rows = orders.flatMap((order) => {
      if (isExcludedPaymentStatus(order.payment_status)) {
        return [];
      }

      const fullName = getDeliveryContactName(
        order.delivery_address,
        `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
      );
      const phone = getDeliveryContactPhone(order.delivery_address, order.profiles.phone_number || "");
      const location = formatAddressText(order.delivery_address);

      return order.meals.map((meal) => ({
        meal: {
          ...meal,
          assigned_rider_id: order.profiles.assigned_rider_id || meal.assigned_rider_id,
          assigned_rider_name: order.profiles.assigned_rider_name || meal.assigned_rider_name,
          assigned_rider_phone: order.profiles.assigned_rider_phone || meal.assigned_rider_phone,
        },
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

  const weeklyOrderedMealRows = useMemo<OrderedMealRow[]>(() => {
    const rows = weeklyOrders.flatMap((order) => {
      if (isExcludedPaymentStatus(order.payment_status)) {
        return [];
      }

      const fullName = getDeliveryContactName(
        order.delivery_address,
        `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
      );
      const phone = getDeliveryContactPhone(order.delivery_address, order.profiles.phone_number || "");
      const location = formatAddressText(order.delivery_address);

      return order.meals.map((meal) => ({
        meal: {
          ...meal,
          assigned_rider_id: order.profiles.assigned_rider_id || meal.assigned_rider_id,
          assigned_rider_name: order.profiles.assigned_rider_name || meal.assigned_rider_name,
          assigned_rider_phone: order.profiles.assigned_rider_phone || meal.assigned_rider_phone,
        },
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
  }, [weeklyOrders]);

  const timeSlotOptions = useMemo(() => {
    return Array.from(
      new Set(orderedMealRows.map((row) => row.meal.scheduled_time_slot).filter(Boolean)),
    ).sort();
  }, [orderedMealRows]);

  const baseFilteredOrderedMeals = useMemo(() => {
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

  const filteredOrderedMeals = useMemo(() => {
    return baseFilteredOrderedMeals.filter((row) => {
      if (operationalFilter === "all") return true;
      if (operationalFilter === "scheduled") {
        return (
          row.meal.status !== "delivered" &&
          !isInactiveMealStatus(row.meal.status) &&
          !isRecoveryMealStatus(row.meal.status)
        );
      }
      if (operationalFilter === "delivered") return row.meal.status === "delivered";
      if (operationalFilter === "recovery") return isRecoveryMealStatus(row.meal.status);
      if (operationalFilter === "cancelled") return isInactiveMealStatus(row.meal.status);
      if (operationalFilter === "payment-pending") return isPendingPaymentStatus(row.order.payment_status);
      if (operationalFilter === "pending-delivery") return isPendingDeliveryMeal(row);
      if (operationalFilter === "requires-action") {
        return isPendingPaymentStatus(row.order.payment_status) || isPendingDeliveryMeal(row) || isRecoveryMealStatus(row.meal.status);
      }
      if (operationalFilter === "unaccounted") return isUnaccountedMeal(row);

      return true;
    });
  }, [baseFilteredOrderedMeals, operationalFilter]);

  const displayedFilteredOrderedMeals = useMemo(
    () => filteredOrderedMeals.slice(0, visibleOrderedMealCount),
    [filteredOrderedMeals, visibleOrderedMealCount],
  );

  const deliveryManagementRows = useMemo(() => {
    const filteredRows = baseFilteredOrderedMeals.filter((row) => {
      const isUnassigned = !row.meal.assigned_rider_id && !row.meal.assigned_rider_name;
      const matchesUnassigned = !showUnassignedOnly || isUnassigned;
      const matchesRider =
        selectedDeliveryRider === "all" || row.meal.assigned_rider_id === selectedDeliveryRider;

      return matchesUnassigned && matchesRider;
    });

    return Array.from(
      new Map(filteredRows.map((row) => [row.order.user_id, row])).values(),
    ).sort((left, right) => left.fullName.localeCompare(right.fullName));
  }, [baseFilteredOrderedMeals, selectedDeliveryRider, showUnassignedOnly]);

  const selectedRiderAssignedCount = useMemo(() => {
    if (selectedDeliveryRider === "all") return 0;
    return new Set(
      baseFilteredOrderedMeals
        .filter((row) => row.meal.assigned_rider_id === selectedDeliveryRider)
        .map((row) => row.order.user_id),
    ).size;
  }, [baseFilteredOrderedMeals, selectedDeliveryRider]);

  const orderedMealsSummary = useMemo(() => {
    const delivered = baseFilteredOrderedMeals.filter((row) => row.meal.status === "delivered");
    const remaining = baseFilteredOrderedMeals.filter(
      (row) =>
        row.meal.status !== "delivered" &&
        !isInactiveMealStatus(row.meal.status) &&
        !isRecoveryMealStatus(row.meal.status),
    );
    const recovery = baseFilteredOrderedMeals.filter((row) => isRecoveryMealStatus(row.meal.status));
    const cancelled = baseFilteredOrderedMeals.filter((row) => isInactiveMealStatus(row.meal.status));
    const paymentPending = baseFilteredOrderedMeals.filter((row) => isPendingPaymentStatus(row.order.payment_status));
    const pendingDelivery = baseFilteredOrderedMeals.filter((row) => isPendingDeliveryMeal(row));
    const requiresAction = baseFilteredOrderedMeals.filter(
      (row) => isPendingPaymentStatus(row.order.payment_status) || isPendingDeliveryMeal(row) || isRecoveryMealStatus(row.meal.status),
    );
    const unaccounted = baseFilteredOrderedMeals.filter((row) => isUnaccountedMeal(row));

    const deliveredCount = getMealQuantityTotal(delivered);
    const remainingCount = getMealQuantityTotal(remaining);
    const recoveryCount = getMealQuantityTotal(recovery);
    const cancelledCount = getMealQuantityTotal(cancelled);
    const paymentPendingCount = getMealQuantityTotal(paymentPending);
    const pendingDeliveryCount = getMealQuantityTotal(pendingDelivery);
    const requiresActionCount = getMealQuantityTotal(requiresAction);
    const unaccountedCount = getMealQuantityTotal(unaccounted);
    const totalCount = getMealQuantityTotal(baseFilteredOrderedMeals);

    return {
      delivered,
      remaining,
      recovery,
      cancelled,
      paymentPending,
      pendingDelivery,
      requiresAction,
      unaccounted,
      deliveredCount,
      remainingCount,
      recoveryCount,
      cancelledCount,
      paymentPendingCount,
      pendingDeliveryCount,
      requiresActionCount,
      unaccountedCount,
      totalCount,
    };
  }, [baseFilteredOrderedMeals]);

  const displayedDeliveredMeals = useMemo(
    () => orderedMealsSummary.delivered.slice(0, visibleDeliveryCount),
    [orderedMealsSummary.delivered, visibleDeliveryCount],
  );

  const subscriptionsDashboard = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isActiveSubscription = (subscription: SubscriptionDashboardRow) => {
      const status = subscription.status.toLowerCase();
      const inactiveStatuses = new Set(["cancelled", "canceled", "expired", "inactive", "failed", "completed"]);
      const endDate = new Date(subscription.endDate);

      return !inactiveStatuses.has(status) && (Number.isNaN(endDate.getTime()) || endDate >= today);
    };

    const isCompletedSubscription = (subscription: SubscriptionDashboardRow) => {
      const status = subscription.status.toLowerCase();
      const endDate = new Date(subscription.endDate);
      const allKnownMealsDelivered =
        subscription.totalMeals > 0 &&
        subscription.remainingMeals === 0 &&
        subscription.deliveredMeals >= subscription.totalMeals;

      return (
        status === "completed" ||
        status === "expired" ||
        allKnownMealsDelivered ||
        (!Number.isNaN(endDate.getTime()) && endDate < today && subscription.remainingMeals === 0)
      );
    };

    const isUnpaidSubscription = (subscription: SubscriptionDashboardRow) => {
      const paymentStatus = (subscription.paymentStatus || "").toLowerCase();
      return !isPaymentConfirmed(paymentStatus) && !isExcludedPaymentStatus(paymentStatus);
    };
    const hasMatchedOrders = (subscription: SubscriptionDashboardRow) => subscription.orderCount > 0;
    const hasMatchedMeals = (subscription: SubscriptionDashboardRow) => subscription.totalMeals > 0;

    const completed = subscriptionRows.filter(
      (subscription) => hasMatchedOrders(subscription) && isCompletedSubscription(subscription),
    );
    const active = subscriptionRows.filter(
      (subscription) =>
        hasMatchedMeals(subscription) &&
        isActiveSubscription(subscription) &&
        !isCompletedSubscription(subscription),
    );
    const completingSoon = subscriptionRows.filter(
      (subscription) =>
        isActiveSubscription(subscription) &&
        !isCompletedSubscription(subscription) &&
        subscription.remainingMeals > 0 &&
        subscription.remainingMeals <= LOW_REMAINING_MEALS_THRESHOLD,
    );
    const noMealsScheduled = subscriptionRows.filter(
      (subscription) =>
        isActiveSubscription(subscription) &&
        !isCompletedSubscription(subscription) &&
        !subscription.hasFutureMeals,
    );
    const paymentPending = subscriptionRows.filter(
      (subscription) => hasMatchedOrders(subscription) && isUnpaidSubscription(subscription),
    );
    const requiresAction = subscriptionRows.filter(
      (subscription) =>
        hasMatchedOrders(subscription) &&
        (
          completingSoon.some((row) => row.id === subscription.id) ||
          noMealsScheduled.some((row) => row.id === subscription.id) ||
          paymentPending.some((row) => row.id === subscription.id)
        ),
    );

    const filteredRows = subscriptionRows.filter((subscription) => {
      const haystack = [
        subscription.customerName,
        subscription.phone,
        subscription.planName,
        subscription.status,
        subscription.paymentStatus,
      ]
        .join(" ")
        .toLowerCase();

      if (!haystack.includes(search.toLowerCase())) return false;
      if (subscriptionFilter === "all") return true;
      if (subscriptionFilter === "active") return active.some((row) => row.id === subscription.id);
      if (subscriptionFilter === "completing-soon") return completingSoon.some((row) => row.id === subscription.id);
      if (subscriptionFilter === "completed") return completed.some((row) => row.id === subscription.id);
      if (subscriptionFilter === "no-meals-scheduled") return noMealsScheduled.some((row) => row.id === subscription.id);
      if (subscriptionFilter === "payment-pending") return paymentPending.some((row) => row.id === subscription.id);
      if (subscriptionFilter === "requires-action") return requiresAction.some((row) => row.id === subscription.id);

      return true;
    });
    const sortedFilteredRows = subscriptionSort
      ? [...filteredRows].sort((left, right) => {
          const direction = subscriptionSort.direction === "asc" ? 1 : -1;

          if (subscriptionSort.key === "subscriber") {
            return left.customerName.localeCompare(right.customerName) * direction;
          }

          if (subscriptionSort.key === "remaining") {
            return (left.remainingMeals - right.remainingMeals) * direction;
          }

          const getDateValue = (value?: string | null) => {
            if (!value) return null;
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? null : date.getTime();
          };

          const leftDate = getDateValue(subscriptionSort.key === "nextMeal" ? left.nextMealDate : left.endDate);
          const rightDate = getDateValue(subscriptionSort.key === "nextMeal" ? right.nextMealDate : right.endDate);

          if (leftDate === null && rightDate === null) return 0;
          if (leftDate === null) return 1;
          if (rightDate === null) return -1;

          return (leftDate - rightDate) * direction;
        })
      : filteredRows;

    return {
      rows: subscriptionRows,
      filteredRows: sortedFilteredRows,
      activeCount: active.length,
      completingSoonCount: completingSoon.length,
      completedCount: completed.length,
      noMealsScheduledCount: noMealsScheduled.length,
      paymentPendingCount: paymentPending.length,
      requiresActionCount: requiresAction.length,
    };
  }, [search, subscriptionFilter, subscriptionRows, subscriptionSort]);

  const filteredOrderedMealKeys = useMemo(
    () => displayedFilteredOrderedMeals.map(getOrderedMealRowKey),
    [displayedFilteredOrderedMeals],
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

  const weeklyMealSchedule = useMemo(() => {
    const weekStart = getMondayForWeek(selectedWeekDate);
    const weekDates = WEEKDAY_COLUMNS.map((day) => {
      const date = addDays(weekStart, day.dayOffset);
      return {
        ...day,
        date,
        dateKey: toDateKey(date),
      };
    });
    const weekdayDateKeys = new Set(weekDates.map((day) => day.dateKey));
    const scheduleGroups = new Map<
      string,
      {
        key: string;
        fullName: string;
        phone: string;
        location: string;
        orderNumbers: Set<string>;
        mealsByDate: Record<string, OrderedMealRow[]>;
      }
    >();

    for (const row of weeklyOrderedMealRows) {
      if (!row.meal.scheduled_date || !weekdayDateKeys.has(row.meal.scheduled_date)) {
        continue;
      }

      const haystack = [
        row.fullName,
        row.phone,
        row.location,
        row.meal.meal_name,
        row.order.order_number,
        row.meal.customer_note || "",
      ]
        .join(" ")
        .toLowerCase();

      if (search && !haystack.includes(search.toLowerCase())) {
        continue;
      }

      const customerKey = [row.order.user_id, row.fullName, row.phone, row.location].join("::");
      const existingGroup =
        scheduleGroups.get(customerKey) ||
        {
          key: customerKey,
          fullName: row.fullName,
          phone: row.phone,
          location: row.location,
          orderNumbers: new Set<string>(),
          mealsByDate: Object.fromEntries(weekDates.map((day) => [day.dateKey, []])) as Record<
            string,
            OrderedMealRow[]
          >,
        };

      existingGroup.orderNumbers.add(row.order.order_number);
      existingGroup.mealsByDate[row.meal.scheduled_date].push(row);
      scheduleGroups.set(customerKey, existingGroup);
    }

    const customers = Array.from(scheduleGroups.values())
      .map((group) => ({
        ...group,
        orderNumbers: Array.from(group.orderNumbers).sort(),
      }))
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    return {
      weekStart,
      weekEnd: addDays(weekStart, 4),
      weekDates,
      customers,
    };
  }, [search, selectedWeekDate, weeklyOrderedMealRows]);

  const displayedWeeklyCustomers = useMemo(
    () => weeklyMealSchedule.customers.slice(0, visibleWeeklyCustomerCount),
    [visibleWeeklyCustomerCount, weeklyMealSchedule.customers],
  );

  useEffect(() => {
    setVisibleOrderedMealCount(INITIAL_VISIBLE_ORDER_MEALS);
    setVisibleDeliveryCount(INITIAL_VISIBLE_DELIVERIES);
  }, [operationalFilter, search, selectedMealDate, selectedMealType, selectedTimeSlot]);

  useEffect(() => {
    setVisibleOrderCount(INITIAL_VISIBLE_ORDERS);
  }, [endDate, search, startDate]);

  useEffect(() => {
    setVisibleWeeklyCustomerCount(INITIAL_VISIBLE_WEEKLY_CUSTOMERS);
  }, [search, selectedWeekDate]);

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

    const deliverableRows = selectedOrderedMealRows.filter((row) => row.meal.status !== "delivered");
    if (deliverableRows.length === 0) {
      toast.info("Selected meals are already delivered.");
      setSelectedMealRowKeys((current) =>
        current.filter((value) => !selectedOrderedMealRows.some((row) => getOrderedMealRowKey(row) === value)),
      );
      return;
    }

    const blockedMeals = deliverableRows.filter((row) => !isPaymentConfirmed(row.order.payment_status));
    if (blockedMeals.length > 0) {
      toast.error("Some selected meals cannot be delivered until payment is confirmed.");
      return;
    }

    try {
      for (const row of deliverableRows) {
        await updateMealStatus(row.meal, row.order, "delivered", {
          silent: true,
          refetch: false,
          throwOnError: true,
        });
      }

      setSelectedMealRowKeys((current) =>
        current.filter((value) => !selectedOrderedMealRows.some((row) => getOrderedMealRowKey(row) === value)),
      );
      toast.success("Selected meals marked as delivered");
      invalidateOrders();
    } catch (error) {
      console.error("[Orders] handleMarkSelectedDelivered error", error);
      toast.error("Failed to mark selected meals as delivered");
    }
  };

  const openRecoveryDialog = (row: OrderedMealRow, action: MealAdminAction = "missed") => {
    setRecoveryTargetRow(row);
    setRecoveryAction(action);
    setRecoveryDate(row.meal.scheduled_date || "");
    setRecoveryTimeSlot(row.meal.scheduled_time_slot || "");
    setRecoveryReason(row.meal.recovery_reason || "");
    setRecoveryNotes(row.meal.recovery_notes || "");
    setRecoveryRefundAmount(
      row.meal.refund_amount !== null && row.meal.refund_amount !== undefined
        ? String(row.meal.refund_amount)
        : String(row.meal.quantity * row.meal.unit_price),
    );
    setRecoveryDialogOpen(true);
  };

  const resetRecoveryDialog = () => {
    setRecoveryDialogOpen(false);
    setRecoveryTargetRow(null);
    setRecoveryAction("missed");
    setRecoveryDate("");
    setRecoveryTimeSlot("");
    setRecoveryReason("");
    setRecoveryNotes("");
    setRecoveryRefundAmount("");
  };

  const handleApplyRecoveryAction = async () => {
    if (!recoveryTargetRow) return;

    const { meal, order } = recoveryTargetRow;
    const baseUpdates: Partial<Tables<"order_meals">> & {
      status?: NormalizedOrderMealStatus;
      recovery_action?: NormalizedMealRecoveryAction | null;
    } = {
      recovery_reason: recoveryReason.trim() || null,
      recovery_notes: recoveryNotes.trim() || null,
      original_scheduled_date: meal.original_scheduled_date || meal.scheduled_date || null,
      original_scheduled_time_slot: meal.original_scheduled_time_slot || meal.scheduled_time_slot || null,
    };

    try {
      if (recoveryAction === "missed") {
        await updateMealRecord(
          meal,
          order,
          {
            ...baseUpdates,
            status: "missed",
            recovery_action: "missed",
          },
          "Meal marked as missed for follow-up",
          { throwOnError: true },
        );
      }

      if (recoveryAction === "rescheduled") {
        if (!recoveryDate || !recoveryTimeSlot.trim()) {
          toast.error("Choose the new delivery date and time slot before rescheduling.");
          return;
        }

        await updateMealRecord(
          meal,
          order,
          {
            ...baseUpdates,
            status: "rescheduled",
            recovery_action: "rescheduled",
            scheduled_date: recoveryDate,
            scheduled_time_slot: recoveryTimeSlot.trim(),
          },
          "Meal rescheduled successfully",
          { throwOnError: true },
        );
      }

      if (recoveryAction === "cancelled") {
        await updateMealRecord(
          meal,
          order,
          {
            ...baseUpdates,
            status: "cancelled",
            recovery_action: "cancelled",
          },
          "Meal cancelled",
          { throwOnError: true },
        );
      }

      if (recoveryAction === "refunded") {
        const parsedRefundAmount = Number(recoveryRefundAmount);
        if (Number.isNaN(parsedRefundAmount) || parsedRefundAmount < 0) {
          toast.error("Enter a valid refund amount.");
          return;
        }

        await updateMealRecord(
          meal,
          order,
          {
            ...baseUpdates,
            status: "refunded",
            recovery_action: "refunded",
            refund_amount: parsedRefundAmount,
          },
          "Meal marked for refund handling",
          { throwOnError: true },
        );
      }

      resetRecoveryDialog();
    } catch (error) {
      console.error("[Orders] handleApplyRecoveryAction error", error);
      toast.error(error instanceof Error ? error.message : "Failed to update meal recovery action");
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
      delivery_date: order.delivery_date || order.meals.find((meal) => meal.scheduled_date)?.scheduled_date || "",
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
      "delivery_date",
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
    const confirmedMealRows = filteredOrderedMeals.filter((row) =>
      isPaymentConfirmed(row.order.payment_status),
    );
    const excludedCount = filteredOrderedMeals.length - confirmedMealRows.length;

    if (confirmedMealRows.length === 0) {
      toast.error(
        filteredOrderedMeals.length > 0
          ? "No confirmed or paid meal rows to export. Unpaid orders were excluded."
          : "No ordered meals to export.",
      );
      return;
    }

    const exportData = confirmedMealRows.map((row) => {
      const addressParts = getExportAddressParts(row.order.delivery_address);

      return {
        order_number: row.order.order_number,
        full_name: row.fullName,
        phone: row.phone,
        zone: addressParts.zone,
        street: addressParts.street,
        building_details: addressParts.building_details,
        delivery_date: row.meal.scheduled_date || row.order.delivery_date || "",
        meal: row.meal.meal_name,
        quantity: row.meal.quantity,
        delivery_guy: row.meal.assigned_rider_name || "",
        delivery_phone: row.meal.assigned_rider_phone || "",
        notes: getMealNoteText(row.meal),
      };
    });

    exportToExcel(
      exportData,
      "ordered_meals",
      ["order_number", "full_name", "phone", "zone", "street", "building_details", "delivery_date", "meal", "quantity", "delivery_guy", "delivery_phone", "notes"],
      ["Order #", "Full Name", "Phone", "Zone", "Street", "Building / Instructions", "Delivery Date", "Meal", "Quantity", "Delivery Guy", "Delivery Phone", "Notes"],
      ["phone", "delivery_phone"],
    );
    toast.success(
      excludedCount > 0
        ? `Ordered meals exported successfully. ${excludedCount} unpaid meal row${excludedCount === 1 ? "" : "s"} excluded.`
        : "Ordered meals exported successfully",
    );
  };

  const handleExportWeeklyMeals = () => {
    if (weeklyMealSchedule.customers.length === 0) {
      toast.error("No weekly meals to export.");
      return;
    }

    const exportData = weeklyMealSchedule.customers.map((customer) => {
      const row: Record<string, string> = {
        full_name: customer.fullName,
        phone: customer.phone,
        location: customer.location,
        order_numbers: customer.orderNumbers.join(", "),
        week: `${toDateKey(weeklyMealSchedule.weekStart)} to ${toDateKey(weeklyMealSchedule.weekEnd)}`,
      };

      for (const day of weeklyMealSchedule.weekDates) {
        const meals = customer.mealsByDate[day.dateKey] || [];
        const dayKey = day.label.toLowerCase();

        row[`${dayKey}_date`] = day.dateKey;
        row[`${dayKey}_has_meal`] = meals.length > 0 ? "Yes" : "No";
        row[`${dayKey}_meals`] = meals
          .map((mealRow) => {
            const quantityText = mealRow.meal.quantity > 1 ? ` x${mealRow.meal.quantity}` : "";
            const timeText = mealRow.meal.scheduled_time_slot ? ` (${mealRow.meal.scheduled_time_slot})` : "";
            return `${mealRow.meal.meal_name}${quantityText}${timeText}`;
          })
          .join(" | ");
      }

      return row;
    });

    const weekdayHeaders = weeklyMealSchedule.weekDates.flatMap((day) => {
      const dayKey = day.label.toLowerCase();
      return [`${dayKey}_date`, `${dayKey}_has_meal`, `${dayKey}_meals`];
    });
    const weekdayLabels = weeklyMealSchedule.weekDates.flatMap((day) => [
      `${day.label} Date`,
      day.label,
      `${day.label} Meals`,
    ]);

    exportToExcel(
      exportData,
      "weekly_meals",
      ["full_name", "phone", "location", "order_numbers", "week", ...weekdayHeaders],
      ["Full Name", "Phone", "Location", "Order #", "Week", ...weekdayLabels],
    );
    toast.success("Weekly meals exported successfully");
  };

  const operationalMetrics: Array<{
    key: OperationalFilter;
    label: string;
    value: number;
    icon: typeof ShoppingBag;
    tone: string;
  }> = [
    { key: "all", label: "Total Meals (units)", value: orderedMealsSummary.totalCount, icon: ShoppingBag, tone: "text-primary bg-primary/10" },
    { key: "scheduled", label: "Scheduled", value: orderedMealsSummary.remainingCount, icon: Calendar, tone: "text-amber-700 bg-amber-100" },
    { key: "delivered", label: "Delivered", value: orderedMealsSummary.deliveredCount, icon: CheckCircle2, tone: "text-emerald-700 bg-emerald-100" },
    { key: "recovery", label: "Recovery", value: orderedMealsSummary.recoveryCount, icon: RotateCcw, tone: "text-orange-700 bg-orange-100" },
    { key: "cancelled", label: "Cancelled", value: orderedMealsSummary.cancelledCount, icon: XCircle, tone: "text-rose-700 bg-rose-100" },
    { key: "payment-pending", label: "Payment Pending", value: orderedMealsSummary.paymentPendingCount, icon: CreditCard, tone: "text-amber-700 bg-amber-100" },
    { key: "pending-delivery", label: "Pending Delivery", value: orderedMealsSummary.pendingDeliveryCount, icon: Clock3, tone: "text-sky-700 bg-sky-100" },
    { key: "requires-action", label: "Orders Requiring Action", value: orderedMealsSummary.requiresActionCount, icon: AlertTriangle, tone: "text-red-700 bg-red-100" },
    { key: "unaccounted", label: "Unaccounted Orders", value: orderedMealsSummary.unaccountedCount, icon: ClipboardList, tone: "text-slate-700 bg-slate-100" },
  ];

  const subscriptionMetrics: Array<{
    key: SubscriptionFilter;
    label: string;
    value: number;
    icon: typeof ShoppingBag;
    tone: string;
  }> = [
    { key: "active", label: "Active Subscriptions", value: subscriptionsDashboard.activeCount, icon: UserCheck, tone: "text-emerald-700 bg-emerald-100" },
    { key: "completing-soon", label: "Completing Soon", value: subscriptionsDashboard.completingSoonCount, icon: Clock3, tone: "text-amber-700 bg-amber-100" },
    { key: "completed", label: "Subscription Completed", value: subscriptionsDashboard.completedCount, icon: CheckCircle2, tone: "text-slate-700 bg-slate-100" },
    { key: "no-meals-scheduled", label: "No Meals Scheduled", value: subscriptionsDashboard.noMealsScheduledCount, icon: CalendarX, tone: "text-sky-700 bg-sky-100" },
    { key: "payment-pending", label: "Payment Pending", value: subscriptionsDashboard.paymentPendingCount, icon: CreditCard, tone: "text-amber-700 bg-amber-100" },
    { key: "requires-action", label: "Requires Action", value: subscriptionsDashboard.requiresActionCount, icon: AlertTriangle, tone: "text-red-700 bg-red-100" },
  ];

  const handleSubscriptionSort = (key: SubscriptionSortKey) => {
    setSubscriptionSort((current) => {
      if (!current || current.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  const getSubscriptionSortLabel = (key: SubscriptionSortKey) => {
    if (subscriptionSort?.key !== key) return "";
    return subscriptionSort.direction === "asc" ? " asc" : " desc";
  };

  const renderSubscriptionSortHeader = (
    key: SubscriptionSortKey,
    label: string,
    className = "",
  ) => (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 rounded-md text-left font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => handleSubscriptionSort(key)}
      >
        <span>{label}</span>
        <span className="text-[10px] uppercase text-muted-foreground">
          {getSubscriptionSortLabel(key)}
        </span>
      </button>
    </TableHead>
  );

  const renderRiderAssignmentControl = (row: OrderedMealRow) => (
    <div className="space-y-2">
      <div className="min-h-[40px]">
        {row.meal.assigned_rider_name ? (
          <div>
            <p className="font-semibold text-foreground">{row.meal.assigned_rider_name}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {row.meal.assigned_rider_phone || "-"}
            </p>
          </div>
        ) : (
          <Badge variant="outline" className="border-dashed text-muted-foreground">
            Unassigned
          </Badge>
        )}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={row.meal.assigned_rider_id ? "outline" : "default"}
            className="w-full rounded-lg"
            disabled={updatingCustomerId === row.order.user_id || deliveryRiders.length === 0}
          >
            <Truck className="w-4 h-4 mr-2" />
            {row.meal.assigned_rider_id ? "Change" : "Assign"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {deliveryRiders.map((rider) => (
            <DropdownMenuItem
              key={rider.id}
              onClick={() => void handleAssignDeliveryRider(row, rider.id)}
            >
              {rider.name}
            </DropdownMenuItem>
          ))}
          {row.meal.assigned_rider_id && (
            <DropdownMenuItem onClick={() => void handleAssignDeliveryRider(row, "unassigned")}>
              Remove assignment
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {deliveryRiders.length === 0 && (
        <p className="text-[10px] text-muted-foreground text-center">
          Add riders in Rider Management
        </p>
      )}
    </div>
  );

  const renderLoadMoreOrders = (emptyLabel = "Load more for this date") => (
    <div className="flex flex-col items-center gap-2 py-4">
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="rounded-xl h-10 bg-card"
          disabled={loadingMoreOrders}
          onClick={() => void fetchNextPage()}
        >
          {loadingMoreOrders ? "Loading more..." : emptyLabel}
        </Button>
      ) : orders.length > 0 ? (
        <p className="text-xs text-muted-foreground">All loaded meals for this date are shown.</p>
      ) : null}
      {orders.length > 0 && (
        <p className="text-[11px] text-muted-foreground tabular-nums">
          Loaded {orders.length} orders for {format(selectedMealDate, "MMM dd, yyyy")}. Select another date to fetch another day.
        </p>
      )}
    </div>
  );

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
              <TabsTrigger value="delivery-management" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Delivery Management
              </TabsTrigger>
              <TabsTrigger value="delivery-log" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Delivery Log
              </TabsTrigger>
              <TabsTrigger value="weekly-meals" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Weekly Meals
              </TabsTrigger>
              <TabsTrigger value="subscriptions" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Subscriptions
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
                      : activeTab === "delivery-management"
                        ? "Search delivery assignments..."
                      : activeTab === "weekly-meals"
                        ? "Search weekly meals..."
                        : activeTab === "subscriptions"
                          ? "Search subscriptions..."
                          : "Search order number, customer, phone..."
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 search-input"
                />
              </div>

              {activeTab === "ordered-meals" || activeTab === "delivery-management" ? (
                <Button onClick={handleExportOrderedMeals} variant="outline" className="rounded-xl h-10">
                  <Download className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
              ) : activeTab === "weekly-meals" ? (
                <Button onClick={handleExportWeeklyMeals} variant="outline" className="rounded-xl h-10">
                  <Download className="w-4 h-4 mr-2" />
                  Export Weekly Excel
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
                    Meal date: {format(selectedMealDate, "MMM dd, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedMealDate}
                    onSelect={(date) => date && setSelectedMealDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

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

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {operationalMetrics.map((metric, index) => {
                const Icon = metric.icon;
                const isActive = operationalFilter === metric.key;

                return (
                  <motion.button
                    key={metric.key}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.04 }}
                    onClick={() => setOperationalFilter(metric.key)}
                    className={`rounded-xl border bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "border-primary ring-2 ring-primary/20" : "border-border/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                        <p className="text-3xl font-heading font-bold text-foreground mt-1">{metric.value}</p>
                      </div>
                      <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${metric.tone}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {operationalFilter !== "all" && (
              <Button variant="ghost" className="rounded-xl h-9 text-muted-foreground" onClick={() => setOperationalFilter("all")}>
                Clear status filter
              </Button>
            )}

            <div className="grid gap-6">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="modern-table min-w-[1080px]">
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
                        <TableHead className="min-w-[170px]">Assigned Rider</TableHead>
                        <TableHead className="w-[60px]">Qty</TableHead>
                        <TableHead className="min-w-[220px]">Notes</TableHead>
                        <TableHead className="w-[140px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loading ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                              <p className="text-sm text-muted-foreground">Loading meals...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : filteredOrderedMeals.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12">
                            <div className="flex flex-col items-center gap-3">
                              <ShoppingBag className="w-10 h-10 text-muted-foreground/30" />
                              <p className="text-sm text-muted-foreground">No meals found</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedFilteredOrderedMeals.map((row) => (
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
                                <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${getMealStatusColor(row.meal.status)}`}>
                                  {row.meal.status}
                                </Badge>
                              </div>
                              {getMealRecoveryLabel(row.meal) && (
                                <p className="text-[11px] text-muted-foreground">
                                  {getMealRecoveryLabel(row.meal)}
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {renderRiderAssignmentControl(row)}
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">{row.meal.quantity}</TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {getMealNoteText(row.meal) || "-"}
                            </p>
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              {row.meal.status === "delivered" ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="w-full justify-center rounded-lg font-semibold text-emerald-700 bg-emerald-50"
                                  disabled
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Delivered
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  className="w-full justify-center rounded-lg font-semibold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-sm"
                                  disabled={updatingMealId === row.meal.id || !isPaymentConfirmed(row.order.payment_status)}
                                  onClick={() => void updateMealStatus(row.meal, row.order, "delivered")}
                                >
                                  <CheckCircle2 className="w-4 h-4 mr-2" />
                                  Mark as Delivered
                                </Button>
                              )}

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="w-full justify-center rounded-lg"
                                    disabled={updatingMealId === row.meal.id}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem
                                    onClick={() => openRecoveryDialog(row, "rescheduled")}
                                    disabled={updatingMealId === row.meal.id}
                                  >
                                    <Clock3 className="w-4 h-4 mr-2" />
                                    Reschedule
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openRecoveryDialog(row, "missed")}
                                    disabled={updatingMealId === row.meal.id}
                                  >
                                    <AlertTriangle className="w-4 h-4 mr-2" />
                                    Mark as Missed
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openRecoveryDialog(row, "cancelled")}
                                    disabled={updatingMealId === row.meal.id}
                                  >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Cancel
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => openRecoveryDialog(row, "refunded")}
                                    disabled={updatingMealId === row.meal.id}
                                  >
                                    <Wallet className="w-4 h-4 mr-2" />
                                    Refund
                                  </DropdownMenuItem>
                                  {row.meal.status !== "scheduled" && (
                                    <DropdownMenuItem
                                      onClick={() => void updateMealStatus(row.meal, row.order, "scheduled")}
                                      disabled={updatingMealId === row.meal.id}
                                    >
                                      <RotateCcw className="w-4 h-4 mr-2" />
                                      Reset to Scheduled
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>

                              {!isPaymentConfirmed(row.order.payment_status) && (
                                <p className="text-[10px] text-amber-600 text-center mt-1 px-2 py-1 bg-amber-50 rounded">
                                  ⚠️ Payment pending
                                </p>
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
              {filteredOrderedMeals.length > displayedFilteredOrderedMeals.length && (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    className="rounded-xl h-10"
                    onClick={() => setVisibleOrderedMealCount((count) => count + INITIAL_VISIBLE_ORDER_MEALS)}
                  >
                    Show more loaded meals
                  </Button>
                </div>
              )}
              {renderLoadMoreOrders("Load more meals for this date")}
            </div>
          </TabsContent>

          <TabsContent value="delivery-management" className="space-y-6 mt-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    Meal date: {format(selectedMealDate, "MMM dd, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedMealDate}
                    onSelect={(date) => date && setSelectedMealDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button variant="secondary" className="rounded-xl h-10" onClick={() => setSelectedMealDate(new Date())}>
                Today's Deliveries
              </Button>

              <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/50 bg-card px-3 text-sm font-medium">
                <Checkbox
                  checked={showUnassignedOnly}
                  onCheckedChange={(checked) => setShowUnassignedOnly(Boolean(checked))}
                  className="w-4 h-4 rounded-md"
                />
                Unassigned Only
              </label>

              <Select value={selectedDeliveryRider} onValueChange={setSelectedDeliveryRider}>
                <SelectTrigger className="w-[220px] rounded-xl h-10 bg-card">
                  <SelectValue placeholder="Filter by rider" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Riders</SelectItem>
                  {deliveryRiders.map((rider) => (
                    <SelectItem key={rider.id} value={rider.id}>
                      {rider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {selectedDeliveryRider !== "all" && (
                <Badge variant="outline" className="h-10 rounded-xl px-3 text-sm bg-card">
                  {selectedRiderAssignedCount} assigned
                </Badge>
              )}
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="modern-table min-w-[1040px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      <TableHead className="min-w-[190px]">Customer Name</TableHead>
                      <TableHead className="w-[140px]">Phone Number</TableHead>
                      <TableHead className="min-w-[260px]">Address</TableHead>
                      <TableHead className="min-w-[190px]">Assigned Rider</TableHead>
                      <TableHead className="w-[190px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm text-muted-foreground">Loading delivery assignments...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : deliveryManagementRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <Truck className="w-10 h-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No delivery assignments found</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      deliveryManagementRows.map((row) => (
                        <TableRow key={`delivery-${getOrderedMealRowKey(row)}`} className="border-border/50">
                          <TableCell>
                            <p className="font-semibold text-foreground">{row.fullName || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">
                              {baseFilteredOrderedMeals.filter((mealRow) => mealRow.order.user_id === row.order.user_id).length} delivery rows in view
                            </p>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{row.phone || "-"}</TableCell>
                          <TableCell>
                            <p className="text-sm text-muted-foreground line-clamp-2" title={row.location || ""}>
                              {row.location || "-"}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {row.meal.scheduled_date || "No date"}
                              {row.meal.scheduled_time_slot ? ` - ${row.meal.scheduled_time_slot}` : ""}
                            </p>
                          </TableCell>
                          <TableCell>
                            {row.meal.assigned_rider_name ? (
                              <div>
                                <p className="font-semibold text-foreground">{row.meal.assigned_rider_name}</p>
                                <p className="text-xs text-muted-foreground tabular-nums">
                                  {row.meal.assigned_rider_phone || "-"}
                                </p>
                              </div>
                            ) : (
                              <Badge variant="outline" className="border-dashed text-muted-foreground">
                                Unassigned
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={row.meal.assigned_rider_id ? "outline" : "default"}
                                  className="w-full rounded-lg"
                                  disabled={updatingCustomerId === row.order.user_id || deliveryRiders.length === 0}
                                >
                                  <Truck className="w-4 h-4 mr-2" />
                                  {row.meal.assigned_rider_id ? "Change" : "Assign"}
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                {deliveryRiders.map((rider) => (
                                  <DropdownMenuItem
                                    key={rider.id}
                                    onClick={() => void handleAssignDeliveryRider(row, rider.id)}
                                  >
                                    {rider.name}
                                  </DropdownMenuItem>
                                ))}
                                {row.meal.assigned_rider_id && (
                                  <DropdownMenuItem onClick={() => void handleAssignDeliveryRider(row, "unassigned")}>
                                    Remove assignment
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {deliveryRiders.length === 0 && (
                              <p className="mt-1 text-[10px] text-muted-foreground text-center">
                                Add riders in Rider Management
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
            {renderLoadMoreOrders("Load more assignments for this date")}
          </TabsContent>

          <TabsContent value="weekly-meals" className="space-y-6 mt-6">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="outline"
                className="rounded-xl h-10 bg-card"
                onClick={() => setSelectedWeekDate((current) => addDays(current, -7))}
              >
                Previous Week
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    {format(weeklyMealSchedule.weekStart, "MMM dd")} - {format(weeklyMealSchedule.weekEnd, "MMM dd, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedWeekDate}
                    onSelect={(date) => date && setSelectedWeekDate(getMondayForWeek(date))}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button
                variant="outline"
                className="rounded-xl h-10 bg-card"
                onClick={() => setSelectedWeekDate((current) => addDays(current, 7))}
              >
                Next Week
              </Button>

              <Button variant="secondary" className="rounded-xl h-10" onClick={() => setSelectedWeekDate(new Date())}>
                This Week
              </Button>
            </div>

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="border-b border-border/50 bg-muted/20 px-5 py-4">
                <h3 className="font-heading font-bold text-lg">Weekly Customer Meal Plan</h3>
                <p className="text-sm text-muted-foreground">
                  Customer information with meals grouped from Monday to Friday.
                </p>
              </div>

              <div className="overflow-x-auto">
                <div className="min-w-[1180px]">
                  <div className="grid grid-cols-[280px_repeat(5,minmax(170px,1fr))] border-b border-border/50 bg-muted/40">
                    <div className="px-4 py-3 text-xs font-semibold uppercase text-muted-foreground">
                      Customer
                    </div>
                    {weeklyMealSchedule.weekDates.map((day) => (
                      <div key={day.dateKey} className="border-l border-border/50 px-4 py-3">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">{day.label}</p>
                        <p className="text-sm font-semibold text-foreground">{format(day.date, "MMM dd")}</p>
                      </div>
                    ))}
                  </div>

                  {weeklyOrdersLoading || weeklyOrdersFetching ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                      <p className="text-sm text-muted-foreground mt-3">Loading weekly meals...</p>
                    </div>
                  ) : weeklyMealSchedule.customers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Calendar className="w-10 h-10 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground mt-3">No meals scheduled for this week.</p>
                    </div>
                  ) : (
                    displayedWeeklyCustomers.map((customer) => (
                      <div key={customer.key} className="grid grid-cols-[280px_repeat(5,minmax(170px,1fr))] border-b border-border/50 last:border-b-0">
                        <div className="px-4 py-4">
                          <p className="font-semibold text-foreground">{customer.fullName || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">{customer.phone || "-"}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2" title={customer.location || ""}>
                            {customer.location || "-"}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                            {customer.orderNumbers.join(", ")}
                          </p>
                        </div>

                        {weeklyMealSchedule.weekDates.map((day) => {
                          const meals = customer.mealsByDate[day.dateKey] || [];

                          return (
                            <div key={`${customer.key}-${day.dateKey}`} className="border-l border-border/50 px-3 py-3">
                              {meals.length === 0 ? (
                                <span className="text-xs text-muted-foreground">-</span>
                              ) : (
                                <div className="space-y-2">
                                  {meals.map((row) => (
                                    <div key={getOrderedMealRowKey(row)} className="rounded-lg border border-border/50 bg-background p-2">
                                      <div className="flex items-start justify-between gap-2">
                                        <p className="text-sm font-semibold text-foreground leading-snug">{row.meal.meal_name}</p>
                                        <span className="text-xs font-semibold tabular-nums">x{row.meal.quantity}</span>
                                      </div>
                                      {row.meal.scheduled_time_slot && (
                                        <p className="text-[11px] text-muted-foreground mt-1">{row.meal.scheduled_time_slot}</p>
                                      )}
                                      <div className="flex gap-1.5 flex-wrap mt-2">
                                        <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${getMealStatusColor(row.meal.status)}`}>
                                          {row.meal.status}
                                        </Badge>
                                        <span className="inline-flex items-center rounded-md bg-muted/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                                          {row.meal.meal_type}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-6 mt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subscriptionMetrics.map((metric, index) => {
                const Icon = metric.icon;
                const isActive = subscriptionFilter === metric.key;

                return (
                  <motion.button
                    key={metric.key}
                    type="button"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.04 }}
                    onClick={() => setSubscriptionFilter(metric.key)}
                    className={`rounded-xl border bg-card p-5 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      isActive ? "border-primary ring-2 ring-primary/20" : "border-border/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{metric.label}</p>
                        <p className="text-3xl font-heading font-bold text-foreground mt-1">{metric.value}</p>
                      </div>
                      <span className={`w-10 h-10 rounded-lg flex items-center justify-center ${metric.tone}`}>
                        <Icon className="w-5 h-5" />
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {subscriptionFilter !== "all" && (
              <Button variant="ghost" className="rounded-xl h-9 text-muted-foreground" onClick={() => setSubscriptionFilter("all")}>
                Clear subscription filter
              </Button>
            )}

            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="rounded-xl border border-border/50 bg-card shadow-card overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="modern-table min-w-[940px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-border/50">
                      {renderSubscriptionSortHeader("subscriber", "Subscriber", "min-w-[190px]")}
                      <TableHead className="min-w-[170px]">Plan</TableHead>
                      <TableHead className="w-[130px]">Status</TableHead>
                      <TableHead className="w-[140px]">Payment</TableHead>
                      <TableHead className="w-[130px]">Orders</TableHead>
                      {renderSubscriptionSortHeader("remaining", "Remaining", "w-[130px]")}
                      {renderSubscriptionSortHeader("nextMeal", "Next Meal", "w-[130px]")}
                      {renderSubscriptionSortHeader("ends", "Ends", "w-[130px]")}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscriptionsLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm text-muted-foreground">Loading subscriptions...</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : subscriptionsDashboard.filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-12">
                          <div className="flex flex-col items-center gap-3">
                            <UserCheck className="w-10 h-10 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground">No subscriptions found</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      subscriptionsDashboard.filteredRows.map((subscription) => (
                        <TableRow
                          key={subscription.id}
                          className="cursor-pointer border-border/50 transition-colors hover:bg-muted/50"
                          onClick={() => {
                            setSelectedSubscription(subscription);
                            setSubscriptionSheetOpen(true);
                          }}
                        >
                          <TableCell>
                            <p className="font-semibold text-foreground">{subscription.customerName}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">{subscription.phone || "-"}</p>
                          </TableCell>
                          <TableCell className="font-medium text-foreground">{subscription.planName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px] border-0 ring-1 ring-inset bg-muted/70 text-muted-foreground">
                              {subscription.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${getPaymentStatusTone(subscription.paymentStatus)}`}>
                              {formatPaymentStatus(subscription.paymentStatus)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {subscription.orderCount} / {subscription.totalMeals} meals
                          </TableCell>
                          <TableCell className="font-semibold tabular-nums">{subscription.remainingMeals}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{subscription.nextMealDate || "-"}</TableCell>
                          <TableCell className="text-muted-foreground tabular-nums">{new Date(subscription.endDate).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </motion.div>
            {weeklyMealSchedule.customers.length > displayedWeeklyCustomers.length && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl h-10"
                  onClick={() => setVisibleWeeklyCustomerCount((count) => count + INITIAL_VISIBLE_WEEKLY_CUSTOMERS)}
                >
                  Show more loaded customers
                </Button>
              </div>
            )}
            {weeklyOrders.length > 0 && (
              <p className="text-center text-[11px] text-muted-foreground tabular-nums">
                Loaded {weeklyOrders.length} orders for this selected week.
              </p>
            )}
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
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Delivered</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.deliveredCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Scheduled</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.remainingCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Recovery Queue</p>
                    <p className="text-2xl font-heading font-bold">{orderedMealsSummary.recoveryCount}</p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3 min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Cancelled / Refunded</p>
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
                  displayedDeliveredMeals.map((row) => (
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
            {orderedMealsSummary.delivered.length > displayedDeliveredMeals.length && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl h-10"
                  onClick={() => setVisibleDeliveryCount((count) => count + INITIAL_VISIBLE_DELIVERIES)}
                >
                  Show more loaded deliveries
                </Button>
              </div>
            )}
            {renderLoadMoreOrders("Load more deliveries for this date")}
          </TabsContent>

          <TabsContent value="orders" className="space-y-6 mt-6">
            <div className="flex items-center gap-4 flex-wrap">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="rounded-xl h-10 bg-card">
                    <Calendar className="w-4 h-4 mr-2" />
                    Meal date: {format(selectedMealDate, "MMM dd, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-xl" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedMealDate}
                    onSelect={(date) => date && setSelectedMealDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Button variant="secondary" className="rounded-xl h-10" onClick={() => setSelectedMealDate(new Date())}>
                Today's Orders
              </Button>

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
                    displayedFilteredOrders.map((order) => (
                      (() => {
                        const customerName = getDeliveryContactName(
                          order.delivery_address,
                          `${order.profiles.first_name || ""} ${order.profiles.last_name || ""}`.trim(),
                        );
                        const customerPhone = getDeliveryContactPhone(
                          order.delivery_address,
                          order.profiles.phone_number || "-",
                        );
                        const activeMeals = order.meals.filter((meal) => !isInactiveMealStatus(meal.status));
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
                                <Badge variant="outline" className={`text-[10px] border-0 ring-1 ring-inset ${getPaymentStatusTone(order.payment_status)}`}>
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
            {filteredOrders.length > displayedFilteredOrders.length && (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="secondary"
                  className="rounded-xl h-10"
                  onClick={() => setVisibleOrderCount((count) => count + INITIAL_VISIBLE_ORDERS)}
                >
                  Show more loaded orders
                </Button>
              </div>
            )}
            {renderLoadMoreOrders()}
          </TabsContent>
        </Tabs>

        <Dialog open={recoveryDialogOpen} onOpenChange={(open) => (open ? setRecoveryDialogOpen(true) : resetRecoveryDialog())}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Meal Recovery Handling</DialogTitle>
              <DialogDescription>
                Record the recovery action for missed or incorrectly handled meals.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="rounded-xl border border-border/50 bg-muted/20 p-3 text-sm">
                <p className="font-semibold">{recoveryTargetRow?.meal.meal_name || "Meal"}</p>
                <p className="text-muted-foreground">
                  {recoveryTargetRow?.order.order_number || "-"}
                  {recoveryTargetRow?.meal.scheduled_date ? ` · ${recoveryTargetRow.meal.scheduled_date}` : ""}
                  {recoveryTargetRow?.meal.scheduled_time_slot ? ` · ${recoveryTargetRow.meal.scheduled_time_slot}` : ""}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="recovery-action">Recovery action</Label>
                <Select value={recoveryAction} onValueChange={(value) => setRecoveryAction(value as MealAdminAction)}>
                  <SelectTrigger id="recovery-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="missed">Mark as missed</SelectItem>
                    <SelectItem value="rescheduled">Reschedule delivery</SelectItem>
                    <SelectItem value="cancelled">Cancel meal</SelectItem>
                    <SelectItem value="refunded">Refund meal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {recoveryAction === "rescheduled" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="recovery-date">New date</Label>
                    <Input
                      id="recovery-date"
                      type="date"
                      value={recoveryDate}
                      onChange={(event) => setRecoveryDate(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="recovery-time">New time slot</Label>
                    <Input
                      id="recovery-time"
                      value={recoveryTimeSlot}
                      onChange={(event) => setRecoveryTimeSlot(event.target.value)}
                      placeholder="e.g. Lunch 12:00 - 14:00"
                    />
                  </div>
                </div>
              )}

              {recoveryAction === "refunded" && (
                <div className="space-y-2">
                  <Label htmlFor="recovery-refund">Refund amount</Label>
                  <Input
                    id="recovery-refund"
                    type="number"
                    min="0"
                    step="0.01"
                    value={recoveryRefundAmount}
                    onChange={(event) => setRecoveryRefundAmount(event.target.value)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="recovery-reason">Reason</Label>
                <Input
                  id="recovery-reason"
                  value={recoveryReason}
                  onChange={(event) => setRecoveryReason(event.target.value)}
                  placeholder="Admin delivery miss, kitchen issue, customer unreachable..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recovery-notes">Notes</Label>
                <Textarea
                  id="recovery-notes"
                  value={recoveryNotes}
                  onChange={(event) => setRecoveryNotes(event.target.value)}
                  placeholder="Add the recovery/refund context for the operations team."
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetRecoveryDialog}>
                Close
              </Button>
              <Button type="button" onClick={() => void handleApplyRecoveryAction()}>
                Save Recovery Action
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Sheet open={subscriptionSheetOpen} onOpenChange={setSubscriptionSheetOpen}>
          <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
            {selectedSubscription && (
              <div className="space-y-6">
                <SheetHeader>
                  <SheetTitle>{selectedSubscription.customerName}</SheetTitle>
                  <SheetDescription>
                    Subscription details, remaining meals, and the full delivery schedule across all matched orders.
                  </SheetDescription>
                </SheetHeader>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-2xl font-heading font-bold tabular-nums">
                      {selectedSubscription.remainingMeals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Delivered</p>
                    <p className="text-2xl font-heading font-bold tabular-nums">
                      {selectedSubscription.deliveredMeals}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">Total Meals</p>
                    <p className="text-2xl font-heading font-bold tabular-nums">
                      {selectedSubscription.totalMeals}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Plan</p>
                      <p className="font-semibold text-foreground">{selectedSubscription.planName}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-0 ring-1 ring-inset bg-muted/70 text-muted-foreground">
                      {selectedSubscription.status}
                    </Badge>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Payment</p>
                      <Badge variant="outline" className={`mt-1 text-[10px] border-0 ring-1 ring-inset ${getPaymentStatusTone(selectedSubscription.paymentStatus)}`}>
                        {formatPaymentStatus(selectedSubscription.paymentStatus)}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium tabular-nums">{selectedSubscription.phone || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Start</p>
                      <p className="text-sm font-medium tabular-nums">
                        {selectedSubscription.startDate ? new Date(selectedSubscription.startDate).toLocaleDateString() : "-"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">End</p>
                      <p className="text-sm font-medium tabular-nums">
                        {selectedSubscription.endDate ? new Date(selectedSubscription.endDate).toLocaleDateString() : "-"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-heading font-bold text-lg">Meal Schedule</h3>
                      <p className="text-sm text-muted-foreground">
                        {selectedSubscription.orderCount} matched orders, {selectedSubscription.meals.length} meal rows.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Next: {selectedSubscription.nextMealDate || "-"}
                    </Badge>
                  </div>

                  {selectedSubscription.meals.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/70 p-8 text-center">
                      <CalendarX className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">
                        No meals are attached to this subscription yet.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {selectedSubscription.meals.map((meal) => (
                        <div key={meal.id} className="rounded-xl border border-border/50 bg-muted/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground">{meal.mealName}</p>
                              <p className="text-xs text-muted-foreground">
                                {meal.scheduledDate || "No date"}
                                {meal.scheduledTimeSlot ? `, ${meal.scheduledTimeSlot}` : ""}
                                {meal.mealType ? ` - ${meal.mealType}` : ""}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                                Order {meal.orderNumber} - Qty {meal.quantity}
                              </p>
                              {meal.customerNote && (
                                <p className="mt-2 rounded-lg bg-background/70 px-2 py-1 text-xs text-muted-foreground">
                                  {meal.customerNote}
                                </p>
                              )}
                            </div>
                            <Badge className={`${getMealStatusColor(meal.status)} border-0 text-[10px]`}>
                              {meal.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>

        <OrderDetailSheet open={sheetOpen} onOpenChange={setSheetOpen} order={selectedOrder} onUpdate={invalidateOrders} />

        <OrderCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} onSuccess={invalidateOrders} />
      </div>
    </DashboardLayout>
  );
};

export default Orders;
