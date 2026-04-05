-- ============================================================================
-- NutriTrack AI — Audit Fixes Migration
-- Fixes: trigger display_name, role protection, constraints, indexes
-- ============================================================================

-- 1. Fix handle_new_user to read 'display_name' from metadata (was only checking full_name/name)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    )
  );
  RETURN NEW;
END;
$$;

-- 2. Restrict profile updates so users cannot change their own role
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = 'user');

-- Allow admins to update any profile (including role changes)
CREATE POLICY "Admins can update any profile" ON public.profiles
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 3. Add unique constraint on body_measurements per user per date
ALTER TABLE public.body_measurements
  ADD CONSTRAINT uq_body_measurements_user_date UNIQUE (user_id, measured_at);

-- 4. Add foreign key on meal_plan_items.original_item_id
ALTER TABLE public.meal_plan_items
  ADD CONSTRAINT fk_meal_plan_items_original
  FOREIGN KEY (original_item_id) REFERENCES public.meal_plan_items(id) ON DELETE SET NULL;

-- 5. Make JSONB columns NOT NULL with default
ALTER TABLE public.meal_plan_items ALTER COLUMN ingredients SET NOT NULL;
ALTER TABLE public.food_log ALTER COLUMN items SET NOT NULL;

-- 6. Add missing index for reverse lookups on food_log.meal_plan_item_id
CREATE INDEX IF NOT EXISTS idx_food_log_meal_plan_item_id ON public.food_log(meal_plan_item_id);

-- 7. Add unique constraint on cuisine_preferences for upsert support
ALTER TABLE public.cuisine_preferences
  ADD CONSTRAINT uq_cuisine_preferences_user_cuisine UNIQUE (user_id, cuisine_name);
