/* ============================================================
   PlotMap CORE — shared config + dataset registry.
   The Easy Map is a REUSABLE engine. Each masterplan is a "dataset"
   that provides: original image, overlay geometry, annotations
   (roads/blocks/zones/pins), labels, sector maps, properties, filters.
   Aerocity/Aerotropolis is the first dataset (datasets/tricity.dataset.js).
   To add a city: drop a new dataset file + point an area at it below.
   ============================================================ */
window.PM = {
  /* shared value-driver taxonomy (datasets map their items onto these) */
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

  /* warm, muted premium gradients for photo placeholders (shared) */
  grads: {
    roads:'linear-gradient(135deg,#5A6B7E,#3E4C5E)', commercial:'linear-gradient(135deg,#B6925A,#8A6B3C)',
    green:'linear-gradient(135deg,#7E9468,#5C7048)', growth:'linear-gradient(135deg,#A8864E,#7A5E34)',
    institutions:'linear-gradient(135deg,#8A6E84,#5E4A5A)', it:'linear-gradient(135deg,#5E8480,#3E5E5A)',
    medical:'linear-gradient(135deg,#B07A72,#8A554E)', entry:'linear-gradient(135deg,#6E7A8A,#4E5A6A)',
    'aerocity-blk':'linear-gradient(135deg,#5E7E9C,#3E5A78)', 'aerot-blk':'linear-gradient(135deg,#6E8E6A,#4A6B4A)',
    property:['linear-gradient(135deg,#C4B091,#A0875F)','linear-gradient(135deg,#B7A488,#94835F)','linear-gradient(135deg,#C2AE90,#9C8460)']
  },

  /* areas in the switcher; `dataset` points to a registered dataset (null = coming soon) */
  areas: [
    { id:'aerotropolis', name:'Aerotropolis', sub:'GMADA · 6500 acs', live:true,  hook:'Airport Road · Bharatmala Corridor', dataset:'tricity-aerotropolis', focusArea:'Aerotropolis' },
    { id:'aerocity',     name:'Aerocity',     sub:'Mohali',           live:true,  hook:'Airport Road · IT City frontage',   dataset:'tricity-aerotropolis', focusArea:'Aerocity' },
    { id:'zirakpur',     name:'Zirakpur',     sub:'',                 live:false, dataset:null },
    { id:'mohali',       name:'Mohali',       sub:'',                 live:false, dataset:null },
    { id:'new-chandigarh',name:'New Chandigarh',sub:'Mullanpur',      live:false, dataset:null },
    { id:'panchkula',    name:'Panchkula',    sub:'',                 live:false, dataset:null },
    { id:'chandigarh',   name:'Chandigarh',   sub:'',                 live:false, dataset:null }
  ],

  /* ---- dataset registry (filled by datasets/*.dataset.js) ---- */
  datasets: {},
  registerDataset(id, ds) { ds.id = id; this.datasets[id] = ds; return ds; },
  datasetFor(areaId) { const a = this.areas.find(x => x.id === areaId); return a && a.dataset ? this.datasets[a.dataset] : null; }
};
