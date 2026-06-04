CREATE TABLE IF NOT EXISTS public.delivery_riders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_riders_is_active ON public.delivery_riders(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_riders_phone_number ON public.delivery_riders(phone_number);

CREATE TRIGGER update_delivery_riders_updated_at
BEFORE UPDATE ON public.delivery_riders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.delivery_riders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage delivery riders" ON public.delivery_riders
  FOR ALL USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

ALTER TABLE public.order_meals
  ADD COLUMN IF NOT EXISTS assigned_rider_id UUID REFERENCES public.delivery_riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_rider_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_rider_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_order_meals_assigned_rider_id ON public.order_meals(assigned_rider_id);
