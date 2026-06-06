ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_rider_id UUID REFERENCES public.delivery_riders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_rider_name TEXT,
  ADD COLUMN IF NOT EXISTS assigned_rider_phone TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_assigned_rider_id ON public.profiles(assigned_rider_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admins can update customer rider assignments'
  ) THEN
    CREATE POLICY "Admins can update customer rider assignments" ON public.profiles
      FOR UPDATE
      USING (is_admin(auth.uid()))
      WITH CHECK (is_admin(auth.uid()));
  END IF;
END $$;
