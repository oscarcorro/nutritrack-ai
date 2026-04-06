-- Intensity level for the user's active goal — tunes how aggressive the
-- calorie deficit (cutting) or surplus (bulking) is.
-- Values: 'light', 'moderate', 'aggressive'. Maintain goals ignore it.
alter table public.user_goals
  add column if not exists intensity text not null default 'moderate'
  check (intensity in ('light', 'moderate', 'aggressive'));
