/* ============================================================
   Sector Map Pins — static/local data store.
   Keyed by sector-map id (manifest entry id). Coordinates are NORMALIZED
   PERCENTAGES (x,y in 0..100) of the map image, so they stay correct while
   the viewer zooms/pans. No price anywhere — client-facing only.

   To add a pin: open Admin (/admin/), pick a map, click to drop a pin, edit the
   fields, then copy the exported JSON for that map into the object below under
   the map's id. See app/plotmap/LAUNCH-MAP-WORKFLOW.md.

   Pin shape:
   { id, title, type, x, y, size, block, roadFacing, status, notes, image }
   type: 'available-property' | 'highlighted-property' | 'landmark' | 'future-update'
   ============================================================ */
window.PM_SECTOR_PINS = {
  // Example pins on one map so the system is visibly working — edit/replace via Admin.
  "panchkula-sector-20-panchkula-sector-20": [
    { id: "pin-demo-1", title: "Plot 123", type: "available-property", x: 38.5, y: 47.0, size: "250 sq.yd", block: "Block B", roadFacing: "30 ft road", status: "Available", notes: "Near the central green." },
    { id: "pin-demo-2", title: "Corner Plot", type: "highlighted-property", x: 61.2, y: 58.4, size: "300 sq.yd", block: "Block C", roadFacing: "Corner, 40 ft road", status: "Available", notes: "Two-side open corner." },
    { id: "pin-demo-3", title: "Community Park", type: "landmark", x: 50.0, y: 35.0, status: "Existing", notes: "Central recreation area." }
  ]
};
