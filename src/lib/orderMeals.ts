export type NormalizedOrderMealStatus =
  | "scheduled"
  | "delivered"
  | "cancelled"
  | "modified"
  | "missed"
  | "rescheduled"
  | "refunded";

export type NormalizedMealRecoveryAction =
  | "none"
  | "missed"
  | "rescheduled"
  | "cancelled"
  | "refunded";

export interface NormalizedOrderMeal {
  id: string;
  order_id: string;
  meal_id: string | null;
  meal_name: string;
  meal_category: string | null;
  meal_type: string;
  dietary_tags: string[];
  quantity: number;
  unit_price: number;
  scheduled_date: string;
  scheduled_time_slot: string;
  status: NormalizedOrderMealStatus;
  customer_note: string | null;
  recovery_action: NormalizedMealRecoveryAction | null;
  recovery_reason: string | null;
  recovery_notes: string | null;
  refund_amount: number | null;
  original_scheduled_date: string | null;
  original_scheduled_time_slot: string | null;
  metadata: Record<string, unknown>;
  created_at?: string | null;
  updated_at?: string | null;
  source: "order_meals" | "legacy_snapshot";
}

export interface OrderMealScheduleSummary {
  deliveryDate: string | null;
  deliveryTimeSlot: string | null;
}

export interface NormalizedDeliveryAddress {
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  street: string;
  city: string;
  zone: string;
  buildingNumber: string;
  floor: string;
  landmark: string;
  specialInstructions: string;
  raw: Record<string, unknown>;
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && !Number.isNaN(value) ? value : fallback;

const asStatus = (value: unknown): NormalizedOrderMealStatus => {
  if (
    value === "scheduled" ||
    value === "delivered" ||
    value === "cancelled" ||
    value === "modified" ||
    value === "missed" ||
    value === "rescheduled" ||
    value === "refunded"
  ) {
    return value;
  }

  if (value === "canceled") {
    return "cancelled";
  }

  return "scheduled";
};

const asRecoveryAction = (value: unknown): NormalizedMealRecoveryAction | null => {
  if (
    value === "none" ||
    value === "missed" ||
    value === "rescheduled" ||
    value === "cancelled" ||
    value === "refunded"
  ) {
    return value;
  }

  return null;
};

const pickMealName = (item: Record<string, unknown>) => {
  if (typeof item.meal_name === "string" && item.meal_name) return item.meal_name;
  if (typeof item.name === "string" && item.name) return item.name;
  if (typeof item.meal === "string" && item.meal) return item.meal;

  const meal = item.meal;
  if (meal && typeof meal === "object" && "name" in meal && typeof meal.name === "string") {
    return meal.name;
  }

  const meals = item.meals;
  if (meals && typeof meals === "object" && "name" in meals && typeof meals.name === "string") {
    return meals.name;
  }

  return "Meal";
};

const pickMealId = (item: Record<string, unknown>) => {
  const candidates = [
    item.meal_id,
    item.sourceMealId,
    item.optionId,
    item.id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
};

const pickMealCategory = (item: Record<string, unknown>) => {
  return asString(item.meal_category) || asString(item.category) || null;
};

const inferMealTypeFromRecord = (item: Record<string, unknown>, fallback = "non-fasting") => {
  const category = pickMealCategory(item)?.toLowerCase() || "";
  const mealName = pickMealName(item).toLowerCase();
  const dietaryTags = asArray(item.dietary_tags)
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.toLowerCase());

  const hasFastingSignal =
    category.includes("fasting") ||
    mealName.includes("fasting") ||
    mealName.includes("tsom") ||
    dietaryTags.includes("fasting") ||
    dietaryTags.includes("vegan") ||
    dietaryTags.includes("vegetarian");

  if (hasFastingSignal) return "fasting";
  return fallback;
};

const mergeFirstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
};

export const normalizeMealType = (value: unknown, fallback = "non-fasting"): string => {
  if (typeof value !== "string") return fallback;

  const normalized = value.trim().toLowerCase();

  if (
    normalized === "fasting" ||
    normalized === "non-fasting" ||
    normalized === "non fasting"
  ) {
    return normalized === "non fasting" ? "non-fasting" : normalized;
  }

  if (
    normalized === "veg" ||
    normalized === "vegetarian" ||
    normalized === "vegan" ||
    normalized === "fast" ||
    normalized === "tsom"
  ) {
    return "fasting";
  }

  if (
    normalized === "regular" ||
    normalized === "normal" ||
    normalized === "meat" ||
    normalized === "nonfasting"
  ) {
    return "non-fasting";
  }

  return fallback;
};

const pickMealType = (item: Record<string, unknown>, fallback = "non-fasting") => {
  if (typeof item.is_fasting === "boolean") {
    return item.is_fasting ? "fasting" : "non-fasting";
  }

  if (typeof item.fasting === "boolean") {
    return item.fasting ? "fasting" : "non-fasting";
  }

  if (typeof item.meal_type === "string" && item.meal_type.trim()) {
    return normalizeMealType(item.meal_type, fallback);
  }

  if (typeof item.type === "string" && item.type.trim()) {
    return normalizeMealType(item.type, fallback);
  }

  return inferMealTypeFromRecord(item, fallback);
};

const cleanNoteText = (value: unknown) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return null;
  }

  return trimmed;
};

const pickDate = (item: Record<string, unknown>, fallback = "") => {
  return (
    asString(item.scheduled_date) ||
    asString(item.delivery_date) ||
    asString(item.dateISO) ||
    asString(item.date_iso) ||
    fallback
  );
};

const pickTime = (item: Record<string, unknown>, fallback = "") => {
  return (
    asString(item.scheduled_time_slot) ||
    asString(item.delivery_time_slot) ||
    asString(item.deliveryTimeSlot) ||
    asString(item.delivery_time) ||
    fallback
  );
};

export const normalizeOrderMealRow = (row: Record<string, unknown>): NormalizedOrderMeal => {
  const metadata = row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {};

  return {
    id: asString(row.id),
    order_id: asString(row.order_id),
    meal_id: pickMealId(row),
    meal_name: pickMealName(row),
    meal_category: pickMealCategory(row),
    meal_type: pickMealType(row),
    dietary_tags: asArray(row.dietary_tags).filter((tag): tag is string => typeof tag === "string"),
    quantity: asNumber(row.quantity, 1),
    unit_price: asNumber(row.unit_price, 0),
    scheduled_date: pickDate(row),
    scheduled_time_slot: pickTime(row),
    status: asStatus(row.status),
    customer_note: cleanNoteText(row.customer_note) || cleanNoteText(row.note),
    metadata,
    recovery_action: asRecoveryAction(row.recovery_action ?? metadata.recovery_action),
    recovery_reason: cleanNoteText(row.recovery_reason) || cleanNoteText(metadata.recovery_reason),
    recovery_notes: cleanNoteText(row.recovery_notes) || cleanNoteText(metadata.recovery_notes),
    refund_amount:
      typeof row.refund_amount === "number" && !Number.isNaN(row.refund_amount)
        ? row.refund_amount
        : typeof metadata.refund_amount === "number" && !Number.isNaN(metadata.refund_amount)
          ? metadata.refund_amount
          : null,
    original_scheduled_date: asString(row.original_scheduled_date || metadata.original_scheduled_date) || null,
    original_scheduled_time_slot:
      asString(row.original_scheduled_time_slot || metadata.original_scheduled_time_slot) || null,
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    source: "order_meals",
  };
};

export const parseLegacyMealSnapshot = (
  orderId: string,
  snapshot: unknown,
  fallbackDate?: string | null,
  fallbackTime?: string | null,
  paymentRecordId?: string | null,
): NormalizedOrderMeal[] => {
  const root =
    snapshot && typeof snapshot === "object" && "meal_snapshot" in snapshot
      ? (snapshot as Record<string, unknown>).meal_snapshot
      : snapshot;

  const items = asArray(root);

  return items.map((item, index) => {
    const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};

    return {
      id: `legacy-${orderId}-${index}`,
      order_id: orderId,
      meal_id: pickMealId(record),
      meal_name: pickMealName(record),
      meal_category: pickMealCategory(record),
      meal_type: pickMealType(record),
      dietary_tags: asArray(record.dietary_tags).filter((tag): tag is string => typeof tag === "string"),
      quantity: asNumber(record.quantity, 1),
      unit_price: asNumber(record.unit_price, 0),
      scheduled_date: pickDate(record, fallbackDate || ""),
      scheduled_time_slot: pickTime(record, fallbackTime || ""),
      status: asStatus(record.status),
      customer_note:
        cleanNoteText(record.customer_note) ||
        cleanNoteText(record.special_instructions) ||
        cleanNoteText(record.note),
      recovery_action: asRecoveryAction(record.recovery_action),
      recovery_reason: cleanNoteText(record.recovery_reason),
      recovery_notes: cleanNoteText(record.recovery_notes),
      refund_amount:
        typeof record.refund_amount === "number" && !Number.isNaN(record.refund_amount)
          ? record.refund_amount
          : null,
      original_scheduled_date: asString(record.original_scheduled_date) || null,
      original_scheduled_time_slot: asString(record.original_scheduled_time_slot) || null,
      metadata: {
        ...record,
        payment_record_id: paymentRecordId,
        snapshot_index: index,
      },
      created_at: null,
      updated_at: null,
      source: "legacy_snapshot",
    };
  });
};

export const getMealDayName = (scheduledDate?: string | null) => {
  if (!scheduledDate) return "";

  return new Date(`${scheduledDate}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
  });
};

export const normalizeDeliveryAddress = (deliveryAddress: unknown): NormalizedDeliveryAddress => {
  const root = asRecord(deliveryAddress);
  const nestedStreet = asRecord(root.street);

  return {
    contactName: mergeFirstString(root.contact_name, root.contactName, root.fullName),
    contactPhone: mergeFirstString(root.contact_phone, root.contactPhone, root.phone),
    contactEmail: mergeFirstString(root.contact_email, root.contactEmail, root.email),
    street: mergeFirstString(root.address_line_1, root.street, nestedStreet.street),
    city: mergeFirstString(root.city, nestedStreet.city),
    zone: mergeFirstString(root.zone, nestedStreet.zone),
    buildingNumber: mergeFirstString(root.building_number, root.buildingNumber, nestedStreet.building_number),
    floor: mergeFirstString(root.floor, nestedStreet.floor),
    landmark: mergeFirstString(root.landmark, nestedStreet.landmark),
    specialInstructions: mergeFirstString(
      root.special_instructions,
      root.specialInstructions,
      nestedStreet.special_instructions,
    ),
    raw: root,
  };
};

export const getDeliveryContactName = (deliveryAddress: unknown, fallback = "") =>
  normalizeDeliveryAddress(deliveryAddress).contactName || fallback;

export const getDeliveryContactPhone = (deliveryAddress: unknown, fallback = "") =>
  normalizeDeliveryAddress(deliveryAddress).contactPhone || fallback;

export const getDeliverySpecialInstructions = (deliveryAddress: unknown) =>
  normalizeDeliveryAddress(deliveryAddress).specialInstructions;

export const getMealSortKey = (meal: Pick<NormalizedOrderMeal, "scheduled_date" | "scheduled_time_slot" | "meal_name" | "created_at">) =>
  [
    meal.scheduled_date || "",
    meal.scheduled_time_slot || "",
    meal.meal_name || "",
    meal.created_at || "",
  ].join("|");

export const sortNormalizedMeals = <T extends Pick<NormalizedOrderMeal, "scheduled_date" | "scheduled_time_slot" | "meal_name" | "created_at">>(meals: T[]) =>
  [...meals].sort((left, right) => getMealSortKey(left).localeCompare(getMealSortKey(right)));

export const getPrimaryMealSchedule = (
  meals: Array<Pick<NormalizedOrderMeal, "scheduled_date" | "scheduled_time_slot" | "meal_name" | "created_at" | "status">>,
): OrderMealScheduleSummary => {
  const activeMeals = sortNormalizedMeals(meals.filter((meal) => meal.status !== "cancelled"));
  const nextMeal = activeMeals[0] || null;

  return {
    deliveryDate: nextMeal?.scheduled_date || null,
    deliveryTimeSlot: nextMeal?.scheduled_time_slot || null,
  };
};

export const formatAddressText = (deliveryAddress: unknown) => {
  if (!deliveryAddress) return "";

  if (typeof deliveryAddress === "string") {
    return deliveryAddress;
  }

  const normalized = normalizeDeliveryAddress(deliveryAddress);
  return [
    normalized.street,
    normalized.city,
    normalized.zone ? `Zone ${normalized.zone}` : "",
    normalized.buildingNumber ? `Bldg ${normalized.buildingNumber}` : "",
    normalized.floor ? `Floor ${normalized.floor}` : "",
    normalized.landmark ? `Landmark: ${normalized.landmark}` : "",
  ]
    .filter(Boolean)
    .join(", ");
};
