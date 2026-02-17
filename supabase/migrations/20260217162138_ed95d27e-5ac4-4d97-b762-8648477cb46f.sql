
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS birth_date text,
  ADD COLUMN IF NOT EXISTS income text,
  ADD COLUMN IF NOT EXISTS profession text,
  ADD COLUMN IF NOT EXISTS vehicles text,
  ADD COLUMN IF NOT EXISTS banks text;
