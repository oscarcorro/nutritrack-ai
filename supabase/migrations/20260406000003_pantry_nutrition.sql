-- Precise nutrition tracking on pantry items so "150g of X" can be
-- calculated exactly instead of estimated.
alter table public.pantry_items
  add column if not exists brand text,
  add column if not exists calories_per_100g numeric,
  add column if not exists protein_g_per_100g numeric,
  add column if not exists carbs_g_per_100g numeric,
  add column if not exists fat_g_per_100g numeric,
  add column if not exists fiber_g_per_100g numeric,
  add column if not exists serving_unit text,
  add column if not exists notes text;
