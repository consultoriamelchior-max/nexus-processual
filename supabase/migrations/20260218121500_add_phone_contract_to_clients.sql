
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS phone_contract TEXT;

-- Update existing data: for now, we don't know which is which, so we leave it null or copy phone.
-- But since it's a new field, null is fine.
