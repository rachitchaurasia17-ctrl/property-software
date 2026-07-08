# PlotMap Overlay Guide

PlotMap overlays keep the official map image untouched and render presentation layers above it.

## Premium highlight system (2026-07 rebuild)

The hero look — the map is always in its premium state, not only on selection:

- **Roads** render as raised electric-cyan **glass light strips**: an invisible
  wide hit path, a dark blurred shadow, a semi-transparent cyan body with glow,
  and a thin white-blue core. Rounded caps/joins, no junction dots or rings.
- **Blocks / landmarks / plots** render as **true 3D slabs** built from
  translated copies of the same SVG path: soft ground shadow → stepped darker
  side wall (side→mid gradient) → bright gradient top face with light edge and
  color glow → glossy sheen → inner bevel hairline → fitted white label.
  Small lift variation (10/12/14 viewBox units) — never huge.
- **Sectors** (large zone polygons) render as **luminous glass panels**: a
  glowing edge in the block color plus a near-transparent tint, so the original
  map stays fully readable beneath. They extrude only while selected.
- **Palette** — nine premium colors (gold, magenta, purple, teal, emerald,
  blue, orange, cyan, ruby). Items with the default store color are
  auto-assigned a stable palette color from their id, so a map freshly marked
  in Map Studio gets reference-quality varied colors with zero configuration.
- **Selection** — dim veil over the map; the selected item re-renders above the
  veil with +6 lift, brighter saturation, stronger glow (roads add a slow white
  light-flow pulse). Clicking empty map clears. A/B/C/D group highlighting and
  the client-safe drawer are unchanged.
- Entrance animation is a subtle fade/lift (no bounce) and respects
  `prefers-reduced-motion`.

Anything published from Map Studio flows through
`PMOverlayStore.publishedForClient(mapId)` into this renderer, so **future
masterplans marked in Map Studio highlight automatically** with this look.
Maps without overlay data render the plain image (mount returns null, no
crash). Demo: `app/plotmap/highlight-demo.html` (New Chandigarh reference).

Layer order:

1. Existing official map image
2. SVG road layer
3. SVG block/sector layer
4. HTML selected plot/house layer
5. HTML school/landmark highlight layer
6. HTML blue pin layer
7. Optional info card
8. Coordinate capture panel only when `?overlayCapture=1`

## Files

- `app/plotmap/datasets/overlays.js` stores public overlay data by map id.
- `app/plotmap/overlay-engine.js` renders SVG and HTML overlays.
- `app/plotmap/overlay-capture.js` adds coordinate capture only with `?overlayCapture=1`.
- `app/plotmap/styles/overlays.css` styles raised roads, lifted shapes, selected plots, landmarks, pins, info cards, and capture mode.

## Overlay Data Shape

Each top-level key must match a registry map id, for example:

```js
window.PLOTMAP_OVERLAYS = {
  'masterplan-new-chandigarh-masterplan': {
    viewBox: '0 0 1414 1036',
    roads: [],
    shapes: [],
    selectedPlots: [],
    selectedLandmarks: [],
    pins: []
  }
};
```

Only entries with `public: true` render in the client route.

## Add A Road

Use SVG path coordinates in the map `viewBox`.

```js
{
  id: 'road-pr4',
  label: 'PR-4 Arterial',
  d: 'M258.592 474.5L320.592 483.5L363.092 478.5',
  group: 'A',
  public: true
}
```

Roads render as four paths: an invisible hit path, a soft shadow, a blue glass body, and a white-blue core.

## Add A Block Or Sector Polygon

Use one or more SVG paths.

```js
{
  id: 'sec-zone1',
  label: 'Zone 1',
  type: 'sector',
  group: 'B',
  paths: ['M501.092 300L467.592 308L491.092 379Z'],
  public: true
}
```

Use `type: 'block'`, `type: 'sector'`, or `type: 'landmark'` to pick the visual treatment.

## Add A Selected House Or Plot

Use normalized percentages so the highlight scales with the image.

```js
{
  id: 'plot-214',
  label: 'Plot 214',
  type: 'house',
  x: 39.2,
  y: 47.4,
  w: 3.1,
  h: 3.8,
  public: true
}
```

## Add A School Or Landmark

Use `selectedLandmarks` with percentage coordinates.

```js
{
  id: 'school-strawberry-fields',
  label: 'School',
  type: 'school',
  x: 45.8,
  y: 32.4,
  w: 2.6,
  h: 2.2,
  public: true
}
```

## Add A Pin

Pins can use explicit percentage coordinates or a `targetId` that points to a selected plot/landmark.

```js
{
  id: 'pin-plot214',
  targetId: 'plot-214',
  label: 'Plot 214',
  x: 40.75,
  y: 47.4,
  public: true
}
```

## Coordinate Capture

Open:

```text
http://localhost:5173/app/plotmap/?overlayCapture=1
```

Road mode records clicked points and prints a ready-to-paste SVG path:

```text
M 120 240 L 300 240 L 420 380
```

Rect mode uses two clicks and prints:

```js
{ x: 39.2, y: 47.4, w: 3.1, h: 3.8 }
```

The capture panel is not created on the normal client route.

## Design Handoff Usage

Used:

- New Chandigarh `viewBox`
- `GROUPS`
- `ROADS`
- `SHAPES`
- client-safe labels and pin coordinates
- visual language for raised roads, selected plots, landmarks, and blue pins

Not copied:

- Claude Design wrapper/runtime
- generated studio shell
- add/edit/publish/manage controls
- fake demo map cards
- unnecessary animation-heavy behavior
- uploaded map images

## Map Asset Safety

The overlay engine references map ids and paths only. It does not edit, compress, rename, move, regenerate, or delete official map images.
