-- Meal schedule per user (preferred time for each meal type)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS meal_schedule jsonb;
