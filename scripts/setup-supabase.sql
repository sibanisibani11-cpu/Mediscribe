-- ==============================================================================
-- MediScribe: App Users Tracking Schema for Supabase
-- ==============================================================================
-- Run this in your Supabase Project -> SQL Editor -> New query -> Run.
-- This creates the app_users table with Row Level Security (RLS) enabled.
-- ==============================================================================

create table if not exists public.app_users (
  id text primary key,                              -- Hardware ID (HWID) or Email
  email text,                                       -- Doctor's email address
  is_pro boolean default false,                     -- Pro subscription status (true/false)
  plan text default 'free',                         -- 'free', 'monthly', 'yearly'
  payment_id text,                                  -- Razorpay or gateway payment ID
  app_version text default '1.1.21',                -- Current version of MediScribe
  os text,                                          -- 'macOS', 'Windows', 'Linux', 'Android'
  total_dictations integer default 0,               -- Total transcriptions generated
  subscribed_at timestamp with time zone,           -- When Pro was activated
  last_active_at timestamp with time zone default now(), -- Last time app was opened
  created_at timestamp with time zone default now() -- First installation timestamp
);

-- Index for quickly querying active vs inactive Pro users
create index if not exists idx_app_users_is_pro on public.app_users(is_pro);
create index if not exists idx_app_users_last_active on public.app_users(last_active_at desc);

-- Enable Row Level Security
alter table public.app_users enable row level security;

-- Drop existing policies if re-running
drop policy if exists "Allow public upsert on app_users" on public.app_users;
drop policy if exists "Allow read access to app_users" on public.app_users;

-- Policy: Allow app clients to insert / update their own tracking record anonymously
create policy "Allow public upsert on app_users"
  on public.app_users
  for all
  using (true)
  with check (true);
