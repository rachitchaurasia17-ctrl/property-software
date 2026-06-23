/* ============================================================
   PlotMap — Aerocity / Aerotropolis client data (NO PRICE)
   Easy Map is an AUTHORED premium schematic in a 1440x960 design
   canvas (clean, labeled, colored) — not raw overlay geometry.
   Original Map highlights still use the real overlay (geo.json cyanIdx).
   ============================================================ */
window.PM = {
  EASY_W: 1440, EASY_H: 960,           // Easy Map design canvas
  IMG_W: 4599, IMG_H: 3069,            // Original PNG / overlay space

  assets: {
    original:    '/public/plotmap-assets/aerotropolis-original-web.jpg',
    overlay:     '/public/plotmap-assets/aerotropolis-overlays.svg',
    sector:      '/public/plotmap-assets/sector-map.jpg'
  },

  areas: [
    { id:'aerotropolis', name:'Aerotropolis', sub:'GMADA · 6500 acs', live:true,  hook:'Airport Road · Bharatmala Corridor' },
    { id:'aerocity',     name:'Aerocity',     sub:'Mohali',           live:true,  hook:'Airport Road · IT City frontage' },
    { id:'zirakpur',     name:'Zirakpur',     sub:'',                 live:false },
    { id:'mohali',       name:'Mohali',       sub:'',                 live:false },
    { id:'new-chandigarh',name:'New Chandigarh',sub:'Mullanpur',      live:false },
    { id:'panchkula',    name:'Panchkula',    sub:'',                 live:false },
    { id:'chandigarh',   name:'Chandigarh',   sub:'',                 live:false }
  ],

  categories: [
    { id:'roads',        label:'Key Roads & Connectivity', color:'#16356A', kind:'line' },
    { id:'aerocity-blk', label:'Aerocity Blocks',          color:'#2E5A86', kind:'block' },
    { id:'aerot-blk',    label:'Aerotropolis Blocks',      color:'#3F6B4A', kind:'block' },
    { id:'commercial',   label:'Commercial & Market',      color:'#B8823A', kind:'zone' },
    { id:'institutions', label:'Institutions & Education',  color:'#7A4A6E', kind:'zone' },
    { id:'it',           label:'IT & Employment Hubs',      color:'#2F7E78', kind:'zone' },
    { id:'medical',      label:'Medical & Healthcare',      color:'#B5604F', kind:'pin' },
    { id:'green',        label:'Green & Open Areas',        color:'#6E9456', kind:'zone' },
    { id:'growth',       label:'Future Growth Areas',       color:'#9A6A1E', kind:'zone' },
    { id:'entry',        label:'Entry & Exit Points',       color:'#5A6B7E', kind:'pin' }
  ],

  /* ---- KEY ROADS: easyD = clean path in design space; cyanIdx -> geo.cyan (Original) ---- */
  keyRoads: [
    { id:'airport-road', name:'Airport Road', cyanIdx:6, easyD:'M 70 250 C 470 215 980 225 1370 205', labelAt:[770,205], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Airport+Road+Mohali', related:['Aerocity','IT City Side','Aerotropolis'] },
    { id:'pr7',  name:'PR-7 Road',  cyanIdx:4, easyD:'M 585 110 L 600 910', labelAt:[600,150], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR7+Road+Mohali', related:['Aerocity','Sector 66B'] },
    { id:'mohali-sirhind', name:'Mohali–Sirhind Road', cyanIdx:3, easyD:'M 960 110 L 985 910', labelAt:[985,150], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Sirhind+Road', related:['Aerotropolis Blocks'] },
    { id:'pr8',  name:'PR-8 Road',  cyanIdx:2, easyD:'M 70 705 C 470 685 980 690 1370 705', labelAt:[300,690], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR8+Road+Mohali', related:['Aerotropolis Blocks'] },
    { id:'bharatmala', name:'Bharatmala / Zirakpur–Banur Corridor', verify:true, cyanIdx:5, easyD:'M 70 880 L 1370 690', labelAt:[1010,765], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Zirakpur+Banur+Highway', related:['Aerotropolis','Future Growth'] },
    { id:'pr11', name:'PR-11 Road', cyanIdx:8, easyD:'M 70 560 C 360 552 760 556 1370 545', labelAt:[1180,548], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR11+Road+Mohali', related:['Aerocity'] },
    { id:'pr12', name:'PR-12 Road', cyanIdx:1, easyD:'M 1180 120 L 1205 900', labelAt:[1205,160], vertical:true, photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR12+Road+Mohali', related:['Aerotropolis'] },
    { id:'railway', name:'Mohali Railway Station Road', cyanIdx:7, easyD:'M 1010 255 C 1130 380 1210 560 1290 880', labelAt:[1235,720], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Railway+Station', related:['Aerocity'] },
    { id:'aerocity-link', name:'Aerocity Link Road', cyanIdx:0, easyD:'M 300 430 L 940 430', labelAt:[420,430], photos:true, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Mohali', related:['Aerocity Blocks'] }
  ],

  /* ---- BLOCKS: filled labeled polygons (design space rounded rects) ---- */
  blocks: [
    { id:'ac-a', area:'Aerocity', cat:'aerocity-blk', name:'Block A', x:300, y:300, w:150, h:115 },
    { id:'ac-b', area:'Aerocity', cat:'aerocity-blk', name:'Block B', x:300, y:445, w:150, h:115 },
    { id:'ac-c', area:'Aerocity', cat:'aerocity-blk', name:'Block C', x:300, y:590, w:150, h:115 },
    { id:'ac-1', area:'Aerocity', cat:'aerocity-blk', name:'Pocket 1', x:140, y:445, w:135, h:115 },
    { id:'at-a', area:'Aerotropolis', cat:'aerot-blk', name:'Block A', x:660, y:430, w:150, h:120 },
    { id:'at-b', area:'Aerotropolis', cat:'aerot-blk', name:'Block B', x:825, y:430, w:150, h:120 },
    { id:'at-c', area:'Aerotropolis', cat:'aerot-blk', name:'Block C', x:660, y:565, w:150, h:120 },
    { id:'at-d', area:'Aerotropolis', cat:'aerot-blk', name:'Block D', x:825, y:565, w:150, h:120 }
  ],

  /* ---- ZONES: filled labeled areas (design space) ---- */
  zones: [
    { id:'commercial-belt', cat:'commercial', name:'Commercial Belt', x:1010, y:430, w:200, h:170, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Commercial+Mohali', related:['Aerocity','Aerotropolis Blocks'], photos:true },
    { id:'education-hub', cat:'institutions', name:'Education & Institutional Hub', x:620, y:250, w:360, h:130, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Knowledge+City+Mohali', related:['Aerocity','Amity University','Plaksha University'], photos:true,
      pins:[ { name:'Amity University Punjab', at:[700,315] }, { name:'Plaksha University', at:[850,315] }, { name:'Knowledge City', at:[935,300] } ] },
    { id:'it-hub', cat:'it', name:'IT City / Employment Hub', x:1030, y:630, w:200, h:160, mapsUrl:'https://www.google.com/maps/search/?api=1&query=IT+City+Mohali', related:['Aerocity','IT City Side'], photos:true },
    { id:'green-belt', cat:'green', name:'Green & Open Belt', x:120, y:610, w:300, h:250, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Green+Belt', related:['Aerocity','Aerotropolis'], photos:true },
    { id:'growth', cat:'growth', name:'Future Growth Pockets', x:620, y:730, w:360, h:140, dashed:true, related:['Aerotropolis','Future Growth'], photos:true }
  ],

  /* ---- PINS (point landmarks; design space) ---- */
  pins: [
    { id:'medicity',  cat:'medical', name:'Medicity · Multi-speciality', at:[1130,360], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Medicity+Mohali', related:['Aerotropolis'], photos:true },
    { id:'civil-hosp',cat:'medical', name:'Civil Hospital', at:[470,250], related:['Aerocity'], photos:true },
    { id:'entry-zirakpur', cat:'entry', name:'Zirakpur Entry', at:[150,170], related:['Airport Road'] },
    { id:'exit-airport',   cat:'entry', name:'Airport Exit',   at:[1320,235], related:['Airport Road'] },
    { id:'exit-banur',     cat:'entry', name:'Banur Exit',     at:[760,915], related:['Bharatmala Corridor'] }
  ],

  /* ---- PROPERTIES (small demo set; NO PRICE). tagAt = design space ---- */
  properties: [
    { id:'p-a42', plotNumber:'A-42', size:'125 sq.yd', area:'Aerotropolis', block:'Block A', blockId:'at-a', plotType:'Residential Plot', roadFacing:'Road Facing', availability:'Available', near:['airport-road','commercial-belt'], plotAt:[44,52] },
    { id:'p-a7',  plotNumber:'A-7',  size:'250 sq.yd', area:'Aerotropolis', block:'Block B', blockId:'at-b', plotType:'Corner Plot', roadFacing:'Corner Facing', availability:'Available', near:['pr7','commercial-belt'], plotAt:[60,40] },
    { id:'p-b22', plotNumber:'B-22', size:'150 sq.yd', area:'Aerotropolis', block:'Block C', blockId:'at-c', plotType:'Commercial Plot', roadFacing:'Main Road', availability:'Available', near:['commercial-belt','pr8'], plotAt:[30,46] },
    { id:'p-p304',plotNumber:'D-04', size:'500 sq.yd', area:'Aerotropolis', block:'Block D', blockId:'at-d', plotType:'Villa', roadFacing:'60ft Road', availability:'Available', near:['green-belt','bharatmala'], plotAt:[68,28] },
    { id:'p-c15', plotNumber:'C-15', size:'200 sq.yd', area:'Aerocity', block:'Block A', blockId:'ac-a', plotType:'Residential Plot', roadFacing:'200ft Road', availability:'Available', near:['airport-road','it-hub'], plotAt:[38,33] },
    { id:'p-d11', plotNumber:'B-11', size:'125 sq.yd', area:'Aerocity', block:'Block B', blockId:'ac-b', plotType:'Park Facing', roadFacing:'Park Facing', availability:'Available', near:['medicity','airport-road'], plotAt:[26,58] },
    { id:'p-p109',plotNumber:'C-09', size:'300 sq.yd', area:'Aerocity', block:'Block C', blockId:'ac-c', plotType:'Villa', roadFacing:'Corner Facing', availability:'Available', near:['it-hub','green-belt'], plotAt:[55,60] },
    { id:'p-p518',plotNumber:'P1-18',size:'150 sq.yd', area:'Aerocity', block:'Pocket 1', blockId:'ac-1', plotType:'Residential Plot', roadFacing:'Road Facing', availability:'Available', near:['education-hub','pr7'], plotAt:[50,70] }
  ],

  /* ---- SECTOR MAPS hub (lazy: thumbnails are CSS, full image loads only on open) ---- */
  sectorMaps: [
    { id:'sm-ac-a', area:'Aerocity', block:'Block A', name:'Aerocity — Block A', status:'ready' },
    { id:'sm-ac-b', area:'Aerocity', block:'Block B', name:'Aerocity — Block B', status:'ready' },
    { id:'sm-ac-c', area:'Aerocity', block:'Block C', name:'Aerocity — Block C', status:'ready' },
    { id:'sm-ac-1', area:'Aerocity', block:'Pocket 1', name:'Aerocity — Pocket 1', status:'ready' },
    { id:'sm-at-a', area:'Aerotropolis', block:'Block A', name:'Aerotropolis — Block A', status:'ready' },
    { id:'sm-at-b', area:'Aerotropolis', block:'Block B', name:'Aerotropolis — Block B', status:'ready' },
    { id:'sm-at-c', area:'Aerotropolis', block:'Block C', name:'Aerotropolis — Block C', status:'soon' },
    { id:'sm-at-d', area:'Aerotropolis', block:'Block D', name:'Aerotropolis — Block D', status:'soon' }
  ],

  /* ---- PROPERTY FILTERS (multi-select) ---- */
  filters: {
    type:     { label:'Property Type', values:['Residential Plot','Commercial Plot','Villa','Park Facing','Corner Plot','Road Facing'] },
    area:     { label:'Area', values:['Aerocity','Aerotropolis'] },
    location: { label:'Location', values:[
      { val:'airport-road', label:'Near Airport Road' }, { val:'pr7', label:'Near PR-7' },
      { val:'commercial-belt', label:'Near Commercial Belt' }, { val:'education-hub', label:'Near Education Hub' },
      { val:'it-hub', label:'Near IT City' }, { val:'green-belt', label:'Near Green / Open Area' } ] },
    size:     { label:'Size', values:['125 sq.yd','150 sq.yd','200 sq.yd','250 sq.yd','300 sq.yd','500 sq.yd'] }
  },

  /* warm, muted premium gradients for photo placeholders */
  grads: {
    roads:'linear-gradient(135deg,#5A6B7E,#3E4C5E)', commercial:'linear-gradient(135deg,#B6925A,#8A6B3C)',
    green:'linear-gradient(135deg,#7E9468,#5C7048)', growth:'linear-gradient(135deg,#A8864E,#7A5E34)',
    institutions:'linear-gradient(135deg,#8A6E84,#5E4A5A)', it:'linear-gradient(135deg,#5E8480,#3E5E5A)',
    medical:'linear-gradient(135deg,#B07A72,#8A554E)', entry:'linear-gradient(135deg,#6E7A8A,#4E5A6A)',
    'aerocity-blk':'linear-gradient(135deg,#5E7E9C,#3E5A78)', 'aerot-blk':'linear-gradient(135deg,#6E8E6A,#4A6B4A)',
    property:['linear-gradient(135deg,#C4B091,#A0875F)','linear-gradient(135deg,#B7A488,#94835F)','linear-gradient(135deg,#C2AE90,#9C8460)']
  }
};
