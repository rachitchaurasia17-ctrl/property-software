-- PlotMap Dealer 360 server-time rate-limit fixtures.
-- STAGING ONLY. Run after 20260719_dealer360_analytics_draft.sql.
-- The old client timestamps and fresh server ingestion timestamps prove that
-- rate limiting cannot be bypassed by backdating p_created_at.

insert into public.presentation_events (
  id, dealer_id, session_id, event_type, area, metadata, created_at, ingested_at
)
select
  'pevt-staging-rate-' || lpad(g::text, 3, '0'),
  'dealer-staging-rate',
  'staging-rate-session-' || lpad(g::text, 3, '0'),
  'app_open',
  'Staging City',
  '{"source":"client_presentation","surface":"presentation"}'::jsonb,
  now() - interval '47 hours',
  now()
from generate_series(1, 300) g
on conflict (id) do update set
  created_at = excluded.created_at,
  ingested_at = excluded.ingested_at;
