ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS use_alternate_account BOOLEAN;

UPDATE public.profiles
SET use_alternate_account = FALSE
WHERE use_alternate_account IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN use_alternate_account SET DEFAULT FALSE,
  ALTER COLUMN use_alternate_account SET NOT NULL;
