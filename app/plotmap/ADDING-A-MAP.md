# Adding A New Masterplan To PlotMap

PlotMap is a framework-free SPA. The Easy Map is a reusable engine, and
Aerocity/Aerotropolis (`datasets/tricity.dataset.js`) is the golden dataset
pattern. Adding a city should be data/assets work, not an `app.js` rewrite.

## Steps

1. Create `app/plotmap/datasets/<city>.dataset.js`.

   ```js
   window.PM.registerDataset('<dataset-id>', {
     name: 'My City',
     EASY_W: 1440, EASY_H: 960,
     IMG_W: 4599, IMG_H: 3069,
     categories: ['roads','commercial','green'],
     assets: {
       original: '/public/plotmap-assets/mycity/original.jpg',
       overlayGeo: '/app/plotmap/mycity.geo.json',
       sector: '/public/plotmap-assets/mycity/sector-fallback.jpg'
     },
     keyRoads: [],
     blocks: [],
     zones: [],
     pins: [],
     properties: [],
     sectorMaps: [],
     filters: { type:{}, area:{}, location:{}, size:{} }
   });
   ```

2. Add the script to `app/plotmap/index.html` after `data.js`.

   ```html
   <script src="./datasets/<city>.dataset.js"></script>
   ```

3. Point an area at it in `data.js`.

   ```js
   { id:'mycity', name:'My City', live:true, hook:'Airport Road', dataset:'<dataset-id>' }
   ```

## Dataset Contract

- `categories`: ordered list of shared category ids from `PM.categories`.
- `assets.original`: official proof layer for Original Map.
- `assets.overlayGeo`: optional extracted geometry for Original Map road highlights.
- `assets.sector`: fallback sector proof image.
- `keyRoads`: named, clickable, sidebar-visible roads only.
- `blocks`, `zones`, `pins`: verified client-facing items only.
- `sectorMaps`: use `status:'ready'` plus `asset` only when the map should appear in the client UI.
- `properties`: client presentation fields only.

The app filters incomplete items before rendering. Missing ids, names, category ids,
or required geometry make an item invisible rather than guessed.

## Key Roads Vs Internal Roads

Key roads are named, clickable, sidebar-visible, category-listed, and highlighted
on the Original Map when selected. `cyanIdx` must come from a verified overlay
export/order.

Internal roads are background-only. Keep them unnamed, non-clickable, out of the
sidebar, below key roads visually, and do not treat them as missing data.

## SVG / Figma Conventions

Figma/SVG provides geometry. Dataset/config provides meaning.

Recommended SVG ids:

- `ROAD-Airport-Road`, `ROAD-PR-7-Road`
- `BLOCK-...`
- `ZONE-...`
- `PIN-...`
- `SECTOR-...`

Group background-only internal road paths under `internal roads`.

## Sector Maps

`View All Maps` switches between city/masterplan/area datasets through `PM.areas`.
`View All Sector Maps` lists ready sector/block maps inside the selected dataset.

Ready sector maps should look like:

```js
{
  id:'sm-example',
  area:'Example Area',
  block:'Block A',
  name:'Example Area - Block A',
  asset:'/public/plotmap-assets/example/block-a.jpg',
  status:'ready'
}
```

If a sector map image is not available, leave it `status:'planned'` or omit it.
The client UI hides it.

## Safety Checks

Run this before shipping client-facing changes:

```sh
node tools/audit-plotmap.js
```

The audit scans PlotMap runtime files and datasets for client-facing price language
and technical validation words such as `verify`, `missing`, `unmatched`, and `debug`.

## Handoff Notes

Antigravity/Codex should wire new maps by adding assets, registering a dataset,
and filling verified categories/items. Do not rebuild PlotMap in React, add a
build step, or hardcode per-city behavior into `app.js`.

Claude or another visual-polish pass can later improve Easy Map styling, label
placement, and presentation polish after the data contract is wired.
