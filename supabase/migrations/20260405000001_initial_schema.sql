-- ============================================================================
-- NutriTrack AI — Initial Schema Migration
-- Created: 2026-04-05
-- Description: Complete database setup including enums, tables, triggers,
--              RLS policies, storage buckets, and indexes.
-- ============================================================================

-- ============================================================================
-- 1. CUSTOM ENUM TYPES
-- ============================================================================

CREATE TYPE public.user_role AS ENUM ('user', 'admin');
CREATE TYPE public.gender AS ENUM ('male', 'female');
CREATE TYPE public.activity_level AS ENUM ('sedentary', 'light', 'moderate', 'active', 'very_active');
CREATE TYPE public.goal_type AS ENUM ('lose_weight', 'maintain', 'gain_muscle');
CREATE TYPE public.meal_type AS ENUM ('breakfast', 'morning_snack', 'lunch', 'afternoon_snack', 'dinner');
CREATE TYPE public.log_input_method AS ENUM ('photo', 'audio', 'text', 'manual');
CREATE TYPE public.preference_type AS ENUM ('like', 'dislike', 'allergy', 'intolerance');
CREATE TYPE public.plan_status AS ENUM ('active', 'completed', 'skipped');

-- ============================================================================
-- 2. TABLES
-- ============================================================================

-- --------------------------------------------------------------------------
-- profiles — extends auth.users with app-specific fields
-- --------------------------------------------------------------------------
CREATE TABLE public.profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name          TEXT NOT NULL DEFAULT '',
  role                  public.user_role NOT NULL DEFAULT 'user',
  avatar_url            TEXT,
  gender                public.gender,
  birth_date            DATE,
  height_cm             NUMERIC,
  weight_kg             NUMERIC,
  activity_level        public.activity_level,
  exercise_days_per_week INTEGER,
  exercise_description  TEXT,
  health_notes          TEXT,
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'User profile data extending auth.users';

-- --------------------------------------------------------------------------
-- user_goals — nutrition targets per user
-- --------------------------------------------------------------------------
CREATE TABLE public.user_goals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  starting_weight_kg    NUMERIC NOT NULL,
  target_weight_kg      NUMERIC NOT NULL,
  ideal_weight_kg       NUMERIC,
  daily_calories_target INTEGER NOT NULL,
  protein_g             INTEGER NOT NULL,
  carbs_g               INTEGER NOT NULL,
  fat_g                 INTEGER NOT NULL,
  fiber_g               INTEGER NOT NULL DEFAULT 25,
  meals_per_day         INTEGER NOT NULL DEFAULT 5,
  goal_type             public.goal_type NOT NULL,
  is_current            BOOLEAN NOT NULL DEFAULT true,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only one goal can be current per user at a time
CREATE UNIQUE INDEX idx_user_goals_current
  ON public.user_goals (user_id)
  WHERE is_current = true;

COMMENT ON TABLE public.user_goals IS 'Nutrition and weight goals per user';

-- --------------------------------------------------------------------------
-- food_preferences — likes, dislikes, allergies, intolerances
-- --------------------------------------------------------------------------
CREATE TABLE public.food_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  food_name         TEXT NOT NULL,
  preference_type   public.preference_type NOT NULL,
  category          TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.food_preferences IS 'Per-user food likes, dislikes, allergies, and intolerances';

-- --------------------------------------------------------------------------
-- cuisine_preferences — cuisine likes/dislikes
-- --------------------------------------------------------------------------
CREATE TABLE public.cuisine_preferences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cuisine_name  TEXT NOT NULL,
  is_preferred  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cuisine_preferences IS 'Per-user cuisine preferences';

-- --------------------------------------------------------------------------
-- meal_plans — one plan per user per day
-- --------------------------------------------------------------------------
CREATE TABLE public.meal_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_date       DATE NOT NULL,
  total_calories  INTEGER,
  total_protein_g NUMERIC,
  total_carbs_g   NUMERIC,
  total_fat_g     NUMERIC,
  status          public.plan_status NOT NULL DEFAULT 'active',
  ai_model        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_meal_plans_user_date UNIQUE (user_id, plan_date)
);

COMMENT ON TABLE public.meal_plans IS 'Daily meal plans generated by AI';

-- --------------------------------------------------------------------------
-- meal_plan_items — individual meals within a plan
-- --------------------------------------------------------------------------
CREATE TABLE public.meal_plan_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id     UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  meal_type        public.meal_type NOT NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  meal_name        TEXT NOT NULL,
  description      TEXT,
  ingredients      JSONB NOT NULL DEFAULT '[]'::jsonb,
  calories         INTEGER,
  protein_g        NUMERIC,
  carbs_g          NUMERIC,
  fat_g            NUMERIC,
  fiber_g          NUMERIC,
  prep_time_min    INTEGER,
  is_swapped       BOOLEAN NOT NULL DEFAULT false,
  original_item_id UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.meal_plan_items IS 'Individual meals belonging to a meal plan';

-- --------------------------------------------------------------------------
-- food_log — what the user actually ate
-- --------------------------------------------------------------------------
CREATE TABLE public.food_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  logged_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  meal_type          public.meal_type,
  input_method       public.log_input_method NOT NULL,
  raw_text           TEXT,
  photo_url          TEXT,
  audio_url          TEXT,
  meal_name          TEXT NOT NULL,
  description        TEXT,
  items              JSONB NOT NULL DEFAULT '[]'::jsonb,
  calories           INTEGER,
  protein_g          NUMERIC,
  carbs_g            NUMERIC,
  fat_g              NUMERIC,
  fiber_g            NUMERIC,
  meal_plan_item_id  UUID REFERENCES public.meal_plan_items(id) ON DELETE SET NULL,
  ai_confidence      NUMERIC,
  ai_model           TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.food_log IS 'Actual food consumption logged by the user';

-- --------------------------------------------------------------------------
-- weight_log — daily weigh-ins
-- --------------------------------------------------------------------------
CREATE TABLE public.weight_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_at DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg   NUMERIC NOT NULL,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_weight_log_user_date UNIQUE (user_id, measured_at)
);

COMMENT ON TABLE public.weight_log IS 'Daily weight measurements';

-- --------------------------------------------------------------------------
-- body_measurements — optional body tracking
-- --------------------------------------------------------------------------
CREATE TABLE public.body_measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  measured_at  DATE NOT NULL DEFAULT CURRENT_DATE,
  waist_cm     NUMERIC,
  hip_cm       NUMERIC,
  chest_cm     NUMERIC,
  arm_cm       NUMERIC,
  thigh_cm     NUMERIC,
  body_fat_pct NUMERIC,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.body_measurements IS 'Optional body circumference and composition tracking';

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX idx_user_goals_user_id          ON public.user_goals(user_id);
CREATE INDEX idx_food_preferences_user_id    ON public.food_preferences(user_id);
CREATE INDEX idx_cuisine_preferences_user_id ON public.cuisine_preferences(user_id);
CREATE INDEX idx_meal_plans_user_id          ON public.meal_plans(user_id);
CREATE INDEX idx_meal_plans_plan_date        ON public.meal_plans(plan_date);
CREATE INDEX idx_meal_plan_items_plan_id     ON public.meal_plan_items(meal_plan_id);
CREATE INDEX idx_food_log_user_id            ON public.food_log(user_id);
CREATE INDEX idx_food_log_logged_at          ON public.food_log(logged_at);
CREATE INDEX idx_weight_log_user_id          ON public.weight_log(user_id);
CREATE INDEX idx_weight_log_measured_at      ON public.weight_log(measured_at);
CREATE INDEX idx_body_measurements_user_id   ON public.body_measurements(user_id);
CREATE INDEX idx_body_measurements_date      ON public.body_measurements(measured_at);

-- ============================================================================
-- 4. FUNCTIONS & TRIGGERS
-- ============================================================================

-- --------------------------------------------------------------------------
-- Auto-update updated_at on row modification
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_user_goals_updated_at
  BEFORE UPDATE ON public.user_goals
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_meal_plans_updated_at
  BEFORE UPDATE ON public.meal_plans
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_food_log_updated_at
  BEFORE UPDATE ON public.food_log
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- --------------------------------------------------------------------------
-- Auto-create profile when a new auth user is created
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', '')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_goals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_preferences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cuisine_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plan_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.food_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_log          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.body_measurements   ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Helper: check if current user is admin
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- --------------------------------------------------------------------------
-- profiles policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- user_goals policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own goals"
  ON public.user_goals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own goals"
  ON public.user_goals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own goals"
  ON public.user_goals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own goals"
  ON public.user_goals FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all goals"
  ON public.user_goals FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- food_preferences policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own food preferences"
  ON public.food_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food preferences"
  ON public.food_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food preferences"
  ON public.food_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own food preferences"
  ON public.food_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all food preferences"
  ON public.food_preferences FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- cuisine_preferences policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own cuisine preferences"
  ON public.cuisine_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cuisine preferences"
  ON public.cuisine_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own cuisine preferences"
  ON public.cuisine_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own cuisine preferences"
  ON public.cuisine_preferences FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all cuisine preferences"
  ON public.cuisine_preferences FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- meal_plans policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own meal plans"
  ON public.meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own meal plans"
  ON public.meal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own meal plans"
  ON public.meal_plans FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own meal plans"
  ON public.meal_plans FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all meal plans"
  ON public.meal_plans FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- meal_plan_items policies (access via meal_plan ownership)
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own meal plan items"
  ON public.meal_plan_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
        AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own meal plan items"
  ON public.meal_plan_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
        AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own meal plan items"
  ON public.meal_plan_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
        AND meal_plans.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
        AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own meal plan items"
  ON public.meal_plan_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.meal_plans
      WHERE meal_plans.id = meal_plan_items.meal_plan_id
        AND meal_plans.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all meal plan items"
  ON public.meal_plan_items FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- food_log policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own food logs"
  ON public.food_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own food logs"
  ON public.food_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own food logs"
  ON public.food_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own food logs"
  ON public.food_log FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all food logs"
  ON public.food_log FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- weight_log policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own weight logs"
  ON public.weight_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own weight logs"
  ON public.weight_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own weight logs"
  ON public.weight_log FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own weight logs"
  ON public.weight_log FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all weight logs"
  ON public.weight_log FOR SELECT
  USING (public.is_admin());

-- --------------------------------------------------------------------------
-- body_measurements policies
-- --------------------------------------------------------------------------
CREATE POLICY "Users can view own body measurements"
  ON public.body_measurements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own body measurements"
  ON public.body_measurements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own body measurements"
  ON public.body_measurements FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own body measurements"
  ON public.body_measurements FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all body measurements"
  ON public.body_measurements FOR SELECT
  USING (public.is_admin());

-- ============================================================================
-- 6. STORAGE BUCKETS & POLICIES
-- ============================================================================

-- Create private storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('food-photos', 'food-photos', false),
  ('audio-logs',  'audio-logs',  false);

-- --------------------------------------------------------------------------
-- food-photos storage policies (folder = user_id)
-- --------------------------------------------------------------------------
CREATE POLICY "Users can upload own food photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own food photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own food photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own food photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'food-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- --------------------------------------------------------------------------
-- audio-logs storage policies (folder = user_id)
-- --------------------------------------------------------------------------
CREATE POLICY "Users can upload own audio logs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'audio-logs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own audio logs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'audio-logs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own audio logs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'audio-logs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'audio-logs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own audio logs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'audio-logs'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================================
-- Done. All tables, enums, triggers, RLS policies, storage, and indexes created.
-- ============================================================================
