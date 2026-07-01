/* ============================================================
   Dataset: Mega Aerocity Map
   A future city map is added by copying this shape:
     easy canvas size, original image + overlay geometry, and the
     annotation arrays (roads/blocks/zones/pins), sectorMaps, properties.
   No price anywhere — client-facing only.
    ============================================================ */
const PM_TRICITY_REGISTRY = window.PM_MAP_REGISTRY || null;
const PM_TRICITY_REGISTRY_MAPS = PM_TRICITY_REGISTRY && Array.isArray(PM_TRICITY_REGISTRY.maps) ? PM_TRICITY_REGISTRY.maps : [];
const PM_TRICITY_MASTERPLANS = PM_TRICITY_REGISTRY_MAPS.filter(map => map && map.type === 'masterplan' && map.status === 'active');
const PM_TRICITY_SECTOR_MAPS = PM_TRICITY_REGISTRY_MAPS.filter(map => map && map.type === 'sector' && map.status === 'active');
const PM_TRICITY_DEFAULT_MASTERPLAN = PM_TRICITY_MASTERPLANS[0] || null;
const PM_TRICITY_SRC = (map, kind) => {
  if (!map) return null;
  return kind === 'easy'
    ? (map.easyMapSrc || map.originalMapSrc || null)
    : (map.originalMapSrc || map.easyMapSrc || null);
};

window.PM.registerDataset('tricity-aerotropolis', {
  name: PM_TRICITY_DEFAULT_MASTERPLAN ? PM_TRICITY_DEFAULT_MASTERPLAN.title : 'Mega Aerocity Map',
  EASY_W: 1440, EASY_H: 960,        // Easy Map design canvas
  IMG_W: 4599, IMG_H: 3069,         // Original PNG / overlay space
  categories: ['roads','blocks','sectors','commercial','institutions','it','green','growth','entry','landmarks'],

  assets: {
    original:   PM_TRICITY_SRC(PM_TRICITY_DEFAULT_MASTERPLAN, 'original') || '/public/plotmap-assets/aerotropolis-original-web.jpg',
    overlay:    PM_TRICITY_REGISTRY ? null : '/public/plotmap-assets/aerotropolis-overlays.svg',
    overlayGeo: PM_TRICITY_REGISTRY ? null : '/app/plotmap/geo.json',          // extracted geometry for Original-Map highlights (also enables Easy Map)
    markings:   PM_TRICITY_SRC(PM_TRICITY_DEFAULT_MASTERPLAN, 'easy') || (PM_TRICITY_REGISTRY ? null : '/public/plotmap-assets/markings.jpg'),
    sector:     PM_TRICITY_SRC(PM_TRICITY_SECTOR_MAPS[0], 'original') || '/public/plotmap-assets/sector-map.jpg'
  },

  /* KEY ROADS: easyD = clean path (design space); svgId -> overlay geometry (Original).
     tier drives Easy Map road hierarchy: 'major' (primary connectivity, strongest),
     'arterial' (important sector roads), 'secondary' (lighter internal links). */
  keyRoads: [
    { id:'airport-road', name:'Airport Road', tier:'major', svgId:'ROAD-Airport-Road', easyD:'M 70 250 C 470 215 980 225 1370 205', labelAt:[770,205], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Airport+Road+Mohali', related:['Aerocity','IT City Side'] },
    { id:'pr7',  name:'PR-7 Road', tier:'major',  svgId:'ROAD-PR-7-Road', easyD:'M 585 110 L 600 910', labelAt:[600,150], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR7+Road+Mohali', related:['Aerocity','Sector 66B'] },
    { id:'mohali-sirhind', name:'Mohali–Sirhind Road', tier:'arterial', svgId:'ROAD-Mohali-Sirhind-Road', easyD:'M 960 110 L 985 910', labelAt:[985,150], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Sirhind+Road', related:['Aerocity Blocks'] },
    { id:'pr8',  name:'PR-8 Road', tier:'arterial',  svgId:'ROAD-PR-8-Road', easyD:'M 70 705 C 470 685 980 690 1370 705', labelAt:[300,690], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR8+Road+Mohali', related:['Aerocity Blocks'] },
    { id:'bharatmala', name:'Zirakpur–Banur Corridor', label:'Bharatmala Corridor', tier:'major', svgId:'ROAD-Bharatmala-Zirakpur-Banur-Corridor', easyD:'M 70 880 L 1370 690', labelAt:[1010,765], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Zirakpur+Banur+Highway', related:['Aerocity','Future Growth'] },
    { id:'pr11', name:'PR-11 Road', tier:'arterial', svgId:'ROAD-PR-11-Road', easyD:'M 70 560 C 360 552 760 556 1370 545', labelAt:[1180,548], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR11+Road+Mohali', related:['Aerocity'] },
    { id:'pr12', name:'PR-12 Road', tier:'arterial', svgId:'ROAD-PR-12-Road', easyD:'M 1180 120 L 1205 900', labelAt:[1205,160], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR12+Road+Mohali', related:['Aerocity'] },
    { id:'railway', name:'Railway Station Road', tier:'arterial', svgId:'ROAD-Mohali-Railway-Station-Road', easyD:'M 1010 255 C 1130 380 1210 560 1290 880', labelAt:[1235,720], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Railway+Station', related:['Aerocity'] },
    { id:'pr5', name:'PR-5 Road', tier:'secondary', svgId:'ROAD-PR-5-Road', easyD:'M 300 430 L 940 430', labelAt:[420,430], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR5+Road+Mohali', related:['Aerocity Blocks'] }
  ],

  /* blocks/sectors: svgId -> geo.json gives the REAL traced boundary used by BOTH
     the Original Map and the Easy Map. x/y/w/h are schematic fallback coordinates
     only (used by the rect filter and as a focus fallback when a shape has no
     traced geometry); they are NOT the Easy Map geometry and are never drawn when
     a geo path exists. To add a block: trace its boundary into geo.json and point
     svgId at it — do not approximate with x/y/w/h. */
  blocks: [
    { id:'ac-a', area:'Aerocity', cat:'sectors', name:'Sector 66A', svgId:'SECTOR-Aerocity-Sector-66A', color:'#4DB6AC', x:300, y:300, w:150, h:115 },
    { id:'ac-b', area:'Aerocity', cat:'sectors', name:'Sector 66B', svgId:'SECTOR-Aerocity-Sector-66B', color:'#7986CB', x:300, y:445, w:150, h:115 },
    { id:'ac-c', area:'Aerocity', cat:'sectors', name:'Sector 82', svgId:'SECTOR-Aerocity-Sector-82', color:'#FF8A65', x:300, y:590, w:150, h:115 },
    { id:'ac-1', area:'Aerocity', cat:'sectors', name:'Sector 82A', svgId:'SECTOR-Aerocity-Sector-82A', color:'#81C784', x:140, y:445, w:135, h:115 },
    { id:'ac-83a', area:'Aerocity', cat:'sectors', name:'Sector 83A', svgId:'SECTOR-Aerocity-Sector-83A', color:'#E57373', x:300, y:445, w:135, h:115 },
    { id:'ac-101', area:'Aerocity', cat:'sectors', name:'Sector 101', svgId:'SECTOR-Aerocity-Sector-101', color:'#E0B04A', x:300, y:445, w:135, h:115 },
    { id:'ac-102', area:'Aerocity', cat:'sectors', name:'Sector 102 Alpha', svgId:'SECTOR-Aerocity-Sector-102-Alpha', color:'#3B82F6', x:300, y:445, w:135, h:115 },
    { id:'ac-82c', area:'Aerocity', cat:'sectors', name:'Sector 82-C', svgId:'SECTOR-Aerocity-Sector-82-C', color:'#B39DDB', x:300, y:445, w:135, h:115 },

    { id:'at-a', area:'Aerocity', cat:'blocks', name:'Block A', svgId:'BLOCK-Aerotropolis-Block-A', color:'#E0B04A', x:660, y:430, w:150, h:120 }, // warm gold
    { id:'at-b', area:'Aerocity', cat:'blocks', name:'Block B', svgId:'BLOCK-Aerotropolis-Block-B', color:'#3B82F6', x:825, y:430, w:150, h:120 }, // premium blue
    { id:'at-c', area:'Aerocity', cat:'blocks', name:'Block C', svgId:'BLOCK-Aerotropolis-Block-C', color:'#81C784', x:660, y:565, w:150, h:120 }, // mint green
    { id:'at-d', area:'Aerocity', cat:'blocks', name:'Block D', svgId:'BLOCK-Aerotropolis-Block-D', color:'#E57373', x:825, y:565, w:150, h:120 }, // rose
    { id:'at-e', area:'Aerocity', cat:'blocks', name:'Block E', svgId:'BLOCK-Aerotropolis-Block-E', color:'#B39DDB', x:825, y:565, w:150, h:120 }, // violet
    { id:'at-f', area:'Aerocity', cat:'blocks', name:'Block F', svgId:'BLOCK-Aerotropolis-Block-F', color:'#4DB6AC', x:825, y:565, w:150, h:120 }, // teal
    { id:'at-g', area:'Aerocity', cat:'blocks', name:'Block G', svgId:'BLOCK-Aerotropolis-Block-G', color:'#FFB74D', x:825, y:565, w:150, h:120 }, // amber orange
    { id:'at-h', area:'Aerocity', cat:'blocks', name:'Block H', svgId:'BLOCK-Aerotropolis-Block-H', color:'#7986CB', x:825, y:565, w:150, h:120 }, // indigo
    { id:'at-i', area:'Aerocity', cat:'blocks', name:'Block I', svgId:'BLOCK-Aerotropolis-Block-I', color:'#AED581', x:825, y:565, w:150, h:120 }, // olive/lime
    { id:'at-j', area:'Aerocity', cat:'blocks', name:'Block J', svgId:'BLOCK-Aerotropolis-Block-J', color:'#FF8A65', x:825, y:565, w:150, h:120 }  // coral
  ],

  /* zones: commercial zones have traced geometry (svgId -> geo.json) and appear on
     BOTH maps. green-belt and growth have NO svgId yet — they are NOT drawn on the
     Easy Map (it never invents geometry); trace their polygons into geo.json and add
     an svgId to surface them. x/y/w/h are schematic fallback only. */
  zones: [
    { id:'commercial-a', cat:'commercial', name:'Commercial Zone C1', svgId:'ZONE-Commercial-Zone-A', labelAt: [3550, 1340], x:1010, y:430, w:200, h:170, photos:true },
    { id:'commercial-b', cat:'commercial', name:'Commercial Zone C2', svgId:'ZONE-Commercial-Zone-B', labelAt: [2990, 1120], x:1010, y:430, w:200, h:170, photos:true },
    { id:'commercial-c', cat:'commercial', name:'Commercial Zone C3', svgId:'ZONE-Commercial-Zone-C', labelAt: [2820, 1349], x:1010, y:430, w:200, h:170, photos:true },
    { id:'commercial-c2', cat:'commercial', name:'Commercial Zone C4', svgId:'ZONE-Commercial-Zone-C_2', labelAt: [2820, 1413], x:1010, y:430, w:200, h:170, photos:true },
    { id:'green-belt', cat:'green', name:'Green & Open Belt', x:120, y:610, w:300, h:250, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Green+Belt', related:['Aerocity'], photos:true }, // needs tracing: add svgId -> geo.json to show on Easy Map
    { id:'growth', cat:'growth', name:'Future Growth Pockets', x:620, y:730, w:360, h:140, dashed:true, related:['Aerocity','Future Growth'], photos:true } // needs tracing: add svgId -> geo.json to show on Easy Map
  ],

  /* pins: svgId -> geo.json is the REAL marker location, used by BOTH maps. `at`
     is a schematic Easy-Map [x,y] fallback only — entry/exit pins have no svgId, so
     they appear on the Original Map (via `at`) but are NOT drawn on the geometry-
     accurate Easy Map until traced. Trace a marker into geo.json to surface it. */
  pins: [
    { id:'pin-city-centre', cat:'landmarks', name:'City Centre', svgId:'PIN-Mohali-City-Centre', at:[1130,360], photos:true },
    { id:'pin-jubilee', cat:'landmarks', name:'Jubilee Square', svgId:'PIN-Jubilee-Square', at:[1130,360], photos:true },
    { id:'pin-cp67', cat:'landmarks', name:'CP67 Mall', svgId:'PIN-CP67-Mall', at:[1130,360], photos:true },
    { id:'medicity',  cat:'landmarks', name:'Medicity', svgId:'PIN-Institute-Mohali', at:[1130,360], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Medicity+Mohali', related:['Aerocity'], photos:true },

    { id:'pin-iiser', cat:'institutions', name:'IISER Mohali', svgId:'PIN-IISER-Mohali', at:[700,315], photos:true },
    { id:'pin-nabi', cat:'institutions', name:'NABI', svgId:'PIN-NABI-Mohali', at:[700,315], photos:true },
    { id:'pin-isb', cat:'institutions', name:'ISB Mohali', svgId:'PIN-ISB-Mohali', at:[700,315], photos:true },
    { id:'pin-amity', cat:'institutions', name:'Amity University', svgId:'PIN-Amity-University-Punjab', at:[700,315], photos:true },
    { id:'pin-plaksha', cat:'institutions', name:'Plaksha University', svgId:'PIN-Plaksha-University', at:[850,315], photos:true },
    { id:'pin-manav', cat:'institutions', name:'Manav Rachna School', svgId:'PIN-Manav-Rachna-International-School', at:[850,315], photos:true },

    { id:'pin-biotech', cat:'it', name:'Biotech Park', svgId:'PIN-Biotech-Park', at:[1030,630], photos:true },
    { id:'pin-hdfc', cat:'it', name:'HDFC IT City', svgId:'PIN-HDFC-IT-City', at:[1030,630], photos:true },
    { id:'pin-infosys', cat:'it', name:'Infosys', svgId:'PIN-Infosys-Mohali', at:[1030,630], photos:true },

    { id:'entry-zirakpur', cat:'entry', name:'Zirakpur Entry', at:[150,170], related:['Airport Road'] },
    { id:'exit-airport',   cat:'entry', name:'Airport Exit',   at:[1320,235], related:['Airport Road'] },
    { id:'exit-banur',     cat:'entry', name:'Banur Exit',     at:[760,915], related:['Bharatmala Corridor'] }
  ],

  properties: [
    { id:'p-a42', plotNumber:'A-42', size:'125 sq.yd', area:'Aerocity', block:'Block A', blockId:'at-a', plotType:'Residential Plot', roadFacing:'Road Facing', availability:'Available', near:['airport-road','commercial-belt'], plotAt:[44,52] },
    { id:'p-a7',  plotNumber:'A-7',  size:'250 sq.yd', area:'Aerocity', block:'Block B', blockId:'at-b', plotType:'Corner Plot', roadFacing:'Corner Facing', availability:'Available', near:['pr7','commercial-belt'], plotAt:[60,40] },
    { id:'p-b22', plotNumber:'B-22', size:'150 sq.yd', area:'Aerocity', block:'Block C', blockId:'at-c', plotType:'Commercial Plot', roadFacing:'Main Road', availability:'Available', near:['commercial-belt','pr8'], plotAt:[30,46] },
    { id:'p-p304',plotNumber:'D-04', size:'500 sq.yd', area:'Aerocity', block:'Block D', blockId:'at-d', plotType:'Villa', roadFacing:'60ft Road', availability:'Available', near:['green-belt','bharatmala'], plotAt:[68,28] },
    { id:'p-c15', plotNumber:'C-15', size:'200 sq.yd', area:'Aerocity', block:'Sector 66A', blockId:'ac-a', plotType:'Residential Plot', roadFacing:'200ft Road', availability:'Available', near:['airport-road','it-hub'], plotAt:[38,33] },
    { id:'p-d11', plotNumber:'B-11', size:'125 sq.yd', area:'Aerocity', block:'Sector 66B', blockId:'ac-b', plotType:'Park Facing', roadFacing:'Park Facing', availability:'Available', near:['medicity','airport-road'], plotAt:[26,58] },
    { id:'p-p109',plotNumber:'C-09', size:'300 sq.yd', area:'Aerocity', block:'Sector 82', blockId:'ac-c', plotType:'Villa', roadFacing:'Corner Facing', availability:'Available', near:['it-hub','green-belt'], plotAt:[55,60] },
    { id:'p-p518',plotNumber:'P1-18',size:'150 sq.yd', area:'Aerocity', block:'Sector 82A', blockId:'ac-1', plotType:'Residential Plot', roadFacing:'Road Facing', availability:'Available', near:['education-hub','pr7'], plotAt:[50,70] }
  ],

  sectorMaps: PM_TRICITY_SECTOR_MAPS.length ? PM_TRICITY_SECTOR_MAPS.map(map => ({
    id: map.id,
    area: map.area,
    block: map.title,
    name: map.title,
    asset: PM_TRICITY_SRC(map, 'original'),
    easyMapSrc: map.easyMapSrc,
    originalMapSrc: map.originalMapSrc,
    hasEasyMap: map.hasEasyMap,
    hasOriginalMap: map.hasOriginalMap,
    dimensions: map.dimensions,
    status:'ready'
  })) : [
    { id:'sm-ac-a', area:'Aerocity', block:'Sector 66A', name:'Aerocity — Sector 66A', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-ac-b', area:'Aerocity', block:'Sector 66B', name:'Aerocity — Sector 66B', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-ac-c', area:'Aerocity', block:'Sector 82', name:'Aerocity — Sector 82', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-ac-1', area:'Aerocity', block:'Sector 82A', name:'Aerocity — Sector 82A', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-at-a', area:'Aerocity', block:'Block A', name:'Aerocity — Block A', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-at-b', area:'Aerocity', block:'Block B', name:'Aerocity — Block B', asset:'/public/plotmap-assets/sector-map.jpg', status:'ready' },
    { id:'sm-at-c', area:'Aerocity', block:'Block C', name:'Aerocity — Block C', status:'planned' },
    { id:'sm-at-d', area:'Aerocity', block:'Block D', name:'Aerocity — Block D', status:'planned' }
  ],

  filters: {
    type:     { label:'Property Type', values:['Residential Plot','Commercial Plot','Villa','Park Facing','Corner Plot','Road Facing'] },
    area:     { label:'Area', values:['Aerocity'] },
    location: { label:'Location', values:[
      { val:'airport-road', label:'Near Airport Road' }, { val:'pr7', label:'Near PR-7' },
      { val:'commercial-belt', label:'Near Commercial Belt' }, { val:'education-hub', label:'Near Education Hub' },
      { val:'it-hub', label:'Near IT City' }, { val:'green-belt', label:'Near Green / Open Area' } ] },
    size:     { label:'Size', values:['125 sq.yd','150 sq.yd','200 sq.yd','250 sq.yd','300 sq.yd','500 sq.yd'] }
  }
});
