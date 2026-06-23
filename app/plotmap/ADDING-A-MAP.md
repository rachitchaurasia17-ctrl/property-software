# Adding a new masterplan to PlotMap

PlotMap's Easy Map is a **reusable engine**. Aerocity/Aerotropolis
(`datasets/tricity.dataset.js`) is the first example. Adding a new city is data-only —
no engine changes.

## Steps

1. **Create a dataset file** `datasets/<city>.dataset.js`:

   ```js
   window.PM.registerDataset('<dataset-id>', {
     name: 'My City',
     EASY_W: 1440, EASY_H: 960,        // Easy Map design canvas
     IMG_W: 4599,  IMG_H: 3069,        // original image / overlay geometry space
     assets: {
       original:   '/public/.../mycity-original-web.jpg', // Original-Map proof image
       overlayGeo: '/app/plotmap/<city>.geo.json',        // road geometry for Original highlights (optional)
       sector:     '/public/.../mycity-sector.jpg'         // sector-map proof image
     },
     keyRoads: [ /* { id, name, easyD, labelAt, cyanIdx?, mapsUrl?, related?, photos? } */ ],
     blocks:   [ /* { id, area, cat:'aerocity-blk'|'aerot-blk', name, x,y,w,h } */ ],
     zones:    [ /* { id, cat, name, x,y,w,h, dashed?, pins?, mapsUrl?, related? } */ ],
     pins:     [ /* { id, cat, name, at:[x,y], mapsUrl?, related? } */ ],
     properties:[/* { id, plotNumber, size, area, block, blockId, plotType, roadFacing, availability, near:[], plotAt:[%,%] } */ ],
     sectorMaps:[ /* { id, area, block, name, status:'ready'|'soon' } */ ],
     filters:  { type:{...}, area:{...}, location:{...}, size:{...} }
   });
   ```

   - **Easy Map geometry** (`easyD` paths, block/zone `x,y,w,h`) is authored in the
     `EASY_W × EASY_H` design canvas — a clean, premium schematic, *not* the raw overlay SVG.
   - **`cyanIdx`** on a road links it to a path in `overlayGeo` so the **Original Map**
     can highlight the real road over the official image. Omit if you have no overlay geometry.
   - **`cat`** values must be one of `PM.categories` ids in `data.js` (shared taxonomy / colors).
   - **No price fields** — client-facing only.

2. **Register it** by adding the script to `index.html` (after `data.js`):
   ```html
   <script src="./datasets/<city>.dataset.js"></script>
   ```

3. **Point an area at it** in `data.js` → `PM.areas`:
   ```js
   { id:'mycity', name:'My City', live:true, hook:'…', dataset:'<dataset-id>' }
   ```
   (Set `live:false, dataset:null` for "Coming soon".)

That's it. The engine renders the Easy Map, Original Map, categories → select-first
preview → photos/details, property tags + filters, sector-map proof, smooth zoom,
presentation mode — all from the dataset.

## Generating overlay geometry (optional)
If you have an overlay SVG (Figma export) aligned to the original image, extract its
paths by stroke colour into `<city>.geo.json`:
`{ "viewBox": "0 0 W H", "cyan": ["M…"], "red": [...], "black": [...] }`
(cyan = key roads → referenced by `cyanIdx`).
