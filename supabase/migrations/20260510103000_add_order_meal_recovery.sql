ALTER TABLE public.order_meals
  DROP CONSTRAINT IF EXISTS order_meals_status_check;

ALTER TABLE public.order_meals
  ADD CONSTRAINT order_meals_status_check
  CHECK (
    status IN (
      'scheduled',
      'delivered',
      'cancelled',
      'modified',
      'missed',
      'rescheduled',
      'refunded'
    )
  );

ALTER TABLE public.order_meals
  ADD COLUMN IF NOT EXISTS recovery_action TEXT
    CHECK (recovery_action IN ('none', 'missed', 'rescheduled', 'cancelled', 'refunded')),
  ADD COLUMN IF NOT EXISTS recovery_reason TEXT,
  ADD COLUMN IF NOT EXISTS recovery_notes TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount DECIMAL(10,2) CHECK (refund_amount IS NULL OR refund_amount >= 0),
  ADD COLUMN IF NOT EXISTS original_scheduled_date DATE,
  ADD COLUMN IF NOT EXISTS original_scheduled_time_slot TEXT;

UPDATE public.order_meals
SET
  recovery_action = COALESCE(recovery_action, 'none'),
  original_scheduled_date = COALESCE(original_scheduled_date, scheduled_date),
  original_scheduled_time_slot = COALESCE(original_scheduled_time_slot, scheduled_time_slot)
WHERE
  recovery_action IS NULL
  OR original_scheduled_date IS NULL
  OR original_scheduled_time_slot IS NULL;
