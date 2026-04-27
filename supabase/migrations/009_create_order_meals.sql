-- Shift orders from bundle-style snapshots to explicit meal units.
-- Each order owns a list of scheduled meals with independent lifecycle state.

CREATE TABLE IF NOT EXISTS public.order_meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  meal_id UUID REFERENCES public.meals(id) ON DELETE SET NULL,
  meal_name TEXT NOT NULL,
  meal_category TEXT,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('fasting', 'non-fasting')),
  dietary_tags TEXT[],
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
  scheduled_date DATE NOT NULL,
  scheduled_time_slot TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'delivered', 'cancelled', 'modified')) DEFAULT 'scheduled',
  customer_note TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_meals_order_id ON public.order_meals(order_id);
CREATE INDEX IF NOT EXISTS idx_order_meals_scheduled_date ON public.order_meals(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_order_meals_status ON public.order_meals(status);

CREATE TRIGGER update_order_meals_updated_at
BEFORE UPDATE ON public.order_meals
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.order_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own order meals" ON public.order_meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_meals.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own order meals" ON public.order_meals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_meals.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own order meals" ON public.order_meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_meals.order_id
        AND orders.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders
      WHERE orders.id = order_meals.order_id
        AND orders.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage all order meals" ON public.order_meals
  FOR ALL USING (is_admin(auth.uid()));
