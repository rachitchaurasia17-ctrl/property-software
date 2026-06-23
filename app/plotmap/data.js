/* ============================================================
   PlotMap — Aerocity / Aerotropolis demo data  (CLIENT-FACING)
   Editable. NO PRICE anywhere by design.
   Geometry refs (cyanIdx / redIdx) point into geo.json paths.
   Coordinates are in the masterplan image space: 4599 x 3069
   (shared by Original PNG + Easy Map SVG -> guarantees alignment)
   ============================================================ */
window.PM = {
  W: 4599, H: 3069,

  assets: {
    original:    '/public/plotmap-assets/aerotropolis-original-web.jpg', // web display (2600px)
    originalFull:'/public/plotmap-assets/aerotropolis-original.png',     // full-res proof / download
    overlay:     '/public/plotmap-assets/aerotropolis-overlays.svg',
    sector:      '/public/plotmap-assets/sector-map.jpg'
  },

  /* ---- AREA SWITCHER (Phase 1: Aerocity + Aerotropolis live) ---- */
  areas: [
    { id:'aerotropolis', name:'Aerotropolis', sub:'GMADA · 6500 acs', live:true,  hook:'Airport Road · Bharatmala Corridor' },
    { id:'aerocity',     name:'Aerocity',     sub:'Mohali',           live:true,  hook:'Airport Road · IT City frontage' },
    { id:'zirakpur',     name:'Zirakpur',     sub:'',                 live:false },
    { id:'mohali',       name:'Mohali',       sub:'',                 live:false },
    { id:'new-chandigarh',name:'New Chandigarh',sub:'Mullanpur',      live:false },
    { id:'panchkula',    name:'Panchkula',    sub:'',                 live:false },
    { id:'chandigarh',   name:'Chandigarh',   sub:'',                 live:false }
  ],

  /* ---- VALUE-DRIVER CATEGORIES (right panel default) ---- */
  categories: [
    { id:'roads',        label:'Key Roads & Connectivity', color:'#16356A', kind:'line' },
    { id:'aerocity-blk', label:'Aerocity Blocks',          color:'#2E4A78', kind:'block' },
    { id:'aerot-blk',    label:'Aerotropolis Blocks',      color:'#3F6B4A', kind:'block' },
    { id:'commercial',   label:'Commercial & Market Landmarks', color:'#B07A2B', kind:'zone' },
    { id:'institutions', label:'Institutions & Education',  color:'#7A3B5E', kind:'pin' },
    { id:'it',           label:'IT & Employment Hubs',      color:'#246B6B', kind:'pin' },
    { id:'medical',      label:'Medical & Healthcare',      color:'#B6504A', kind:'pin' },
    { id:'green',        label:'Green & Open Areas',        color:'#5E8A4E', kind:'zone' },
    { id:'growth',       label:'Future Growth Areas',       color:'#9A6A1E', kind:'zone' },
    { id:'entry',        label:'Entry & Exit Points',       color:'#16356A', kind:'pin' }
  ],

  /* ---- KEY ROADS (clickable value drivers; cyanIdx -> geo.cyan) ---- */
  keyRoads: [
    { id:'airport-road', name:'Airport Road', cyanIdx:6, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Airport+Road+Mohali', related:['Aerocity','IT City Side','Aerotropolis'] },
    { id:'pr7',  name:'PR-7 Road',  cyanIdx:4, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR7+Road+Mohali', related:['Aerocity','Sector 66B'] },
    { id:'pr8',  name:'PR-8 Road',  cyanIdx:2, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR8+Road+Mohali', related:['Aerotropolis Blocks'] },
    { id:'pr11', name:'PR-11 Road', cyanIdx:8, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR11+Road+Mohali', related:['Aerocity'] },
    { id:'pr12', name:'PR-12 Road', cyanIdx:1, mapsUrl:'https://www.google.com/maps/search/?api=1&query=PR12+Road+Mohali', related:['Aerotropolis'] },
    { id:'mohali-sirhind', name:'Mohali–Sirhind Road', cyanIdx:3, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Sirhind+Road', related:['Aerotropolis Blocks'] },
    { id:'railway', name:'Mohali Railway Station Road', cyanIdx:7, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Mohali+Railway+Station', related:['Aerocity'] },
    { id:'bharatmala', name:'Bharatmala / Zirakpur–Banur Corridor', verify:true, cyanIdx:5, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Zirakpur+Banur+Highway', related:['Aerotropolis','Future Growth'] },
    { id:'aerocity-link', name:'Aerocity Link Road', cyanIdx:0, mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Mohali', related:['Aerocity Blocks'] }
  ],

  /* ---- ZONES (soft regions; redIdx list = blocks to emphasise) ---- */
  zones: [
    { id:'commercial-belt', cat:'commercial', name:'Aerotropolis Commercial Belt', at:[2980,1760], redIdx:[7,9,10,12], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Commercial+Mohali', related:['Aerocity','Aerotropolis Blocks'] },
    { id:'market', cat:'commercial', name:'Aerocity Neighbourhood Market', at:[2520,1640], redIdx:[5,8], related:['Aerocity'] },
    { id:'green-belt', cat:'green', name:'Central Green Belt', at:[2180,1980], redIdx:[2,11], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+Green+Belt', related:['Aerocity','Aerotropolis'] },
    { id:'growth', cat:'growth', name:'Upcoming GMADA Pockets', at:[2360,3010], redIdx:[0,1,3], related:['Aerotropolis','Future Growth'] }
  ],

  /* ---- PINS (landmarks; at:[x,y] image space) ---- */
  pins: [
    { id:'education', cat:'institutions', name:'Education & Institutional Hub', at:[2520,1500], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Aerocity+School+Mohali', related:['Aerocity'] },
    { id:'it-city',   cat:'it', name:'IT City Frontage', at:[3520,1720], mapsUrl:'https://www.google.com/maps/search/?api=1&query=IT+City+Mohali', related:['Aerocity','IT City Side'] },
    { id:'medicity',  cat:'medical', name:'Medicity / Multi-speciality', at:[3060,1560], mapsUrl:'https://www.google.com/maps/search/?api=1&query=Medicity+Mohali', related:['Aerotropolis'] },
    { id:'entry-n',   cat:'entry', name:'North Entry Chowk', at:[2850,820], related:['Airport Road'] },
    { id:'entry-s',   cat:'entry', name:'South Exit Chowk',  at:[2724,2740], related:['Bharatmala Corridor'] }
  ],

  /* ---- BLOCKS / POCKETS (carry inventory) ---- */
  blocks: [
    { id:'aero-a', area:'Aerocity', name:'Block A', at:[2380,2080] },
    { id:'aero-b', area:'Aerocity', name:'Block B', at:[2560,2200] },
    { id:'aero-c', area:'Aerocity', name:'Block C', at:[2740,1980] },
    { id:'aero-d', area:'Aerocity', name:'Block D', at:[2300,1880] },
    { id:'aero-p1', area:'Aerocity', name:'Pocket 1', at:[2480,1860] },
    { id:'aerot-p2', area:'Aerotropolis', name:'Pocket 2', at:[2900,2000] },
    { id:'aerot-p3', area:'Aerotropolis', name:'Pocket 3', at:[3120,1880] },
    { id:'aerot-p5', area:'Aerotropolis', name:'Pocket 5', at:[2640,2360] }
  ],

  /* ---- PROPERTIES (small demo set; NO PRICE) ---- */
  properties: [
    { id:'p-a42', plotNumber:'A-42', size:'125 sq.yd', area:'Aerotropolis', block:'Block A', blockId:'aero-a', plotType:'Residential Plot', roadFacing:'Road Facing', availability:'Available', near:['airport-road','commercial-belt'], tagAt:[2360,1880], plotAt:[44,52] },
    { id:'p-c15', plotNumber:'C-15', size:'200 sq.yd', area:'Aerocity', block:'Block C', blockId:'aero-c', plotType:'Residential Plot', roadFacing:'200ft Road', availability:'Available', near:['airport-road','it-city'], tagAt:[2710,1855], plotAt:[38,33] },
    { id:'p-p304',plotNumber:'P3-04',size:'500 sq.yd', area:'Aerotropolis', block:'Pocket 3', blockId:'aerot-p3', plotType:'Kanal', roadFacing:'60ft Road', availability:'Available', near:['green-belt','bharatmala'], tagAt:[3080,1880], plotAt:[68,28] },
    { id:'p-d11', plotNumber:'D-11', size:'125 sq.yd', area:'Aerocity', block:'Block D', blockId:'aero-d', plotType:'Residential Plot', roadFacing:'40ft Road', availability:'Available', near:['medicity','airport-road'], tagAt:[2360,2125], plotAt:[26,58] },
    { id:'p-b22', plotNumber:'B-22', size:'150 sq.yd', area:'Aerotropolis', block:'Block B', blockId:'aero-b', plotType:'Commercial', roadFacing:'Main Road', availability:'Available', near:['commercial-belt','pr8'], tagAt:[2715,2145], plotAt:[30,46] },
    { id:'p-p518',plotNumber:'P5-18',size:'400 sq.yd', area:'Aerotropolis', block:'Pocket 5', blockId:'aerot-p5', plotType:'Kothi', roadFacing:'Corner Facing', availability:'Available', near:['education','pr12'], tagAt:[3060,2150], plotAt:[50,70] },
    { id:'p-a7',  plotNumber:'A-7',  size:'250 sq.yd', area:'Aerotropolis', block:'Pocket 2', blockId:'aerot-p2', plotType:'Corner Plot', roadFacing:'Corner Facing', availability:'Available', near:['pr7','commercial-belt'], tagAt:[2540,2350], plotAt:[60,40] },
    { id:'p-p109',plotNumber:'P1-09',size:'300 sq.yd', area:'Aerocity', block:'Pocket 1', blockId:'aero-p1', plotType:'Kothi', roadFacing:'Park Facing', availability:'Available', near:['it-city','green-belt'], tagAt:[2890,2330], plotAt:[55,60] }
  ],

  /* warm, muted premium gradients for photo placeholders (never harsh) */
  grads: {
    roads:'linear-gradient(135deg,#5A6B7E,#3E4C5E)', commercial:'linear-gradient(135deg,#B6925A,#8A6B3C)',
    green:'linear-gradient(135deg,#7E9468,#5C7048)', growth:'linear-gradient(135deg,#A8864E,#7A5E34)',
    institutions:'linear-gradient(135deg,#8A6E84,#5E4A5A)', it:'linear-gradient(135deg,#5E8480,#3E5E5A)',
    medical:'linear-gradient(135deg,#B07A72,#8A554E)', entry:'linear-gradient(135deg,#6E7A8A,#4E5A6A)',
    property:['linear-gradient(135deg,#C4B091,#A0875F)','linear-gradient(135deg,#B7A488,#94835F)','linear-gradient(135deg,#C2AE90,#9C8460)']
  }
};
