-- ============================================================
-- PlotMap — Supabase setup for the A/B/C/D highlight-set buttons
-- Run ONCE in your Supabase Dashboard -> SQL Editor
-- Project: czmkfmkmgqlienmdihul
-- Safe to re-run (idempotent).
-- ============================================================

create table if not exists public.prebuilt_maps (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- The frontend + admin editor use the publishable (anon) key.
-- Allow anon read + write for this internal dealer tool.
-- (Tighten later — see HANDOFF.md "For Codex: security".)
alter table public.prebuilt_maps enable row level security;

drop policy if exists "plotmap public read"  on public.prebuilt_maps;
drop policy if exists "plotmap public write" on public.prebuilt_maps;
create policy "plotmap public read"  on public.prebuilt_maps for select using (true);
create policy "plotmap public write" on public.prebuilt_maps for all   using (true) with check (true);

-- Seed the 4 buttons (A, B, C, D) only if missing, so the site shows them immediately.
insert into public.prebuilt_maps (label, blocks)
select v.label, '[]'::jsonb
from (values ('A'), ('B'), ('C'), ('D')) as v(label)
where not exists (
  select 1 from public.prebuilt_maps p where upper(trim(p.label)) = v.label
);
