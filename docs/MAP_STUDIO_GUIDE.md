# Map Studio Guide

Last updated: 2026-07-06.

Map Studio (`/admin/map-studio.html`) is where the team marks maps and publishes them to Client Presentation. Requires the `mapstudio.manage` permission; **publishing** additionally requires `mapstudio.publish`.

## The three flows

1. **Publish Masterplan** — pick the big city map, choose saved roads/blocks/sectors/landmarks, sort them into A / B / C / D groups, publish. In Client Presentation, tapping A/B/C/D highlights that group.
2. **Publish Sector Map** — detailed proof map. Tap to mark roads, plots, pockets, pins and labels. Save keeps everything as **Draft** (invisible to clients); Publish makes the item live.
3. **Manage Published Maps** — everything currently live for clients; hide, regroup, or unpublish per item.

## Draft vs Publish (the core rule)

- **Draft** = saved for the team only. Clients never see drafts.
- **Published + Client visible** = live in Client Presentation immediately after sync.
- Members without publish permission see "Saved as draft" when they try to publish — the owner (or a member with publish access) publishes it later.

## Linking properties

From Properties → *Place on map* deep-links into Map Studio with the pin tool armed for that property (`?map=<id>&tool=pin&property=<id>`). The pin carries `propertyId`, which powers "On map: <map>" status on the property card and *View on map* in the client presentation.

## Language rules

Never use these words in any user-facing Map Studio copy: SVG, polygon, coordinates, geometry, vector, path, layer. Say: map, marking, area, outline, pin, label.

## Dense sector maps

For dense sector maps, zoom in before tapping; every marked item can be renamed and grouped after marking. Prefer a few clear markings over tracing everything — clients need orientation, not a CAD drawing.

## Audit

Publishing, hiding, and deleting markings are audit-logged automatically (`overlay_published`, `overlay_hidden`, `overlay_deleted`) with map and item ids.
