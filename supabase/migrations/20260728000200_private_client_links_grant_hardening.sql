-- PlotMap Private Client Links grant hardening.
-- Production carried legacy broad table grants that RLS currently masked.
-- Remove them so anonymous users have no direct share_links privileges and
-- authenticated users retain only the DML required by dealer-scoped RLS.

revoke all on table public.share_links from anon;
revoke all on table public.share_links from authenticated;
grant select, insert, update, delete on table public.share_links to authenticated;

revoke all on table public.client_link_events from anon;
revoke all on table public.client_link_events from authenticated;
grant select on table public.client_link_events to authenticated;

revoke all on table public.client_link_access_windows from anon, authenticated;
