/* ============================================================
   Sector Map Pins - static/local data store.
   Keyed by sector-map id. Coordinates are normalized percentages
   of the map image, so they stay correct while the viewer zooms/pans.

   Pin shape:
   { id, title, type, x, y, size, block, roadFacing, status, notes, image }
   type: 'available-property' | 'highlighted-property' | 'landmark'
   Client rendering also checks PM_CONFIG.visibility.publicSectorPinTypes,
   so internal-only or future-update pin types stay hidden.
   ============================================================ */
window.PM_SECTOR_PINS = {};
