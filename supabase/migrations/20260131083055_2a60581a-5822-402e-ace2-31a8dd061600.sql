-- Add is_chefs_choice column to meals table
ALTER TABLE public.meals 
ADD COLUMN IF NOT EXISTS is_chefs_choice boolean DEFAULT false;

-- Create index for querying chef's choice meals
CREATE INDEX IF NOT EXISTS idx_meals_chefs_choice ON public.meals (is_chefs_choice) WHERE is_chefs_choice = true;