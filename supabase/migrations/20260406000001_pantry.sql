-- Pantry items so the user can photograph their fridge/pantry and have AI
-- read the detected ingredients when generating meal plans.

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  quantity_estimate text,
  category text,
  expires_at date,
  source text, -- 'photo' | 'manual'
  created_at timestamptz not null default now()
);

create index if not exists idx_pantry_items_user_id on public.pantry_items(user_id);

alter table public.pantry_items enable row level security;

create policy "Users can view own pantry"
  on public.pantry_items for select
  using (auth.uid() = user_id);

create policy "Admins can view any pantry"
  on public.pantry_items for select
  using (public.is_admin());

create policy "Users can insert own pantry"
  on public.pantry_items for insert
  with check (auth.uid() = user_id);

create policy "Users can update own pantry"
  on public.pantry_items for update
  using (auth.uid() = user_id);

create policy "Users can delete own pantry"
  on public.pantry_items for delete
  using (auth.uid() = user_id);
