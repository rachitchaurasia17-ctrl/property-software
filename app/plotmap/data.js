/* ============================================================
   PlotMap CORE — shared config + dataset registry.
   The Easy Map is a REUSABLE engine. Each masterplan is a "dataset"
   that provides: original image, overlay geometry, annotations
   (roads/blocks/zones/pins), labels, sector maps, properties, filters.
   Aerocity/Aerotropolis is the first dataset (datasets/tricity.dataset.js).
   To add a city: drop a new dataset file + point an area at it below.
   ============================================================ */
const PM_FOLDER_REGISTRY = window.PM_MAP_REGISTRY || null;
const PM_REGISTRY_MASTERPLANS = PM_FOLDER_REGISTRY && Array.isArray(PM_FOLDER_REGISTRY.masterplans)
  ? PM_FOLDER_REGISTRY.masterplans.map(id => PM_FOLDER_REGISTRY.byId && PM_FOLDER_REGISTRY.byId[id]).filter(Boolean)
  : [];
const PM_FALLBACK_AREAS = [
  { id:'aerotropolis', name:'Aerocity', sub:'Mega Map', live:true,  hook:'Mega Aerocity Map', dataset:'tricity-aerotropolis', focusArea:'Aerocity' },
  { id:'zirakpur',     name:'Zirakpur',     sub:'',                 live:false, dataset:null },
  { id:'mohali',       name:'Mohali',       sub:'',                 live:false, dataset:null },
  { id:'new-chandigarh',name:'New Chandigarh',sub:'Mullanpur',      live:false, dataset:null },
  { id:'panchkula',    name:'Panchkula',    sub:'',                 live:false, dataset:null },
  { id:'chandigarh',   name:'Chandigarh',   sub:'',                 live:false, dataset:null }
];
const PM_REGISTRY_AREAS = PM_REGISTRY_MASTERPLANS.map(map => ({
  id: map.id,
  name: map.title.replace(/\s+Masterplan$/i, ''),
  sub: [map.area, map.hasEasyMap ? '3D' : null, map.hasOriginalMap ? 'Original' : null].filter(Boolean).join(' · '),
  live: true,
  hook: map.hasEasyMap && map.hasOriginalMap ? '3D + original proof' : (map.hasEasyMap ? '3D map available' : 'Original proof map'),
  dataset: 'tricity-aerotropolis',
  focusArea: map.area,
  mapRegistryId: map.id
}));

window.PM = {
  /* shared value-driver taxonomy (datasets map their items onto these) */
  categories: [
    { id:'roads',        label:'Key Roads',                color:'#16356A', kind:'line' },
    { id:'blocks',       label:'Blocks',                   color:'#2E5A86', kind:'block' },
    { id:'sectors',      label:'Sectors',                  color:'#3F6B4A', kind:'block' },
    { id:'commercial',   label:'Commercial Zones',         color:'#F05A28', kind:'zone' },
    { id:'institutions', label:'Education',                color:'#7A4A6E', kind:'zone' },
    { id:'it',           label:'IT & Employment',          color:'#2F7E78', kind:'zone' },
    { id:'green',        label:'Green & Open Areas',       color:'#6E9456', kind:'zone' },
    { id:'growth',       label:'Future Growth',            color:'#9A6A1E', kind:'zone' },
    { id:'entry',        label:'Entry & Exit Points',      color:'#5A6B7E', kind:'pin' },
    { id:'landmarks',    label:'Landmarks',                color:'#B5604F', kind:'pin' }
  ],

  /* warm, muted premium gradients for photo placeholders (shared) */
  grads: {
    roads:'linear-gradient(135deg,#5A6B7E,#3E4C5E)', commercial:'linear-gradient(135deg,#B6925A,#8A6B3C)',
    green:'linear-gradient(135deg,#7E9468,#5C7048)', growth:'linear-gradient(135deg,#A8864E,#7A5E34)',
    institutions:'linear-gradient(135deg,#8A6E84,#5E4A5A)', it:'linear-gradient(135deg,#5E8480,#3E5E5A)',
    landmarks:'linear-gradient(135deg,#B07A72,#8A554E)', entry:'linear-gradient(135deg,#6E7A8A,#4E5A6A)',
    blocks:'linear-gradient(135deg,#5E7E9C,#3E5A78)', sectors:'linear-gradient(135deg,#6E8E6A,#4A6B4A)',
    property:['linear-gradient(135deg,#C4B091,#A0875F)','linear-gradient(135deg,#B7A488,#94835F)','linear-gradient(135deg,#C2AE90,#9C8460)']
  },

  /* areas in the switcher; `dataset` points to a registered dataset (null = coming soon) */
  areas: PM_REGISTRY_AREAS.length ? PM_REGISTRY_AREAS : PM_FALLBACK_AREAS,

  /* ---- dataset registry (filled by datasets/*.dataset.js) ---- */
  datasets: {},
  categoryById(id) { return this.categories.find(c => c.id === id); },
  categoriesFor(ds) {
    const ids = ds && Array.isArray(ds.categories) && ds.categories.length
      ? ds.categories
      : this.categories.map(c => c.id);
    return ids.map(c => typeof c === 'string' ? this.categoryById(c) : c).filter(Boolean);
  },
  registerDataset(id, ds) {
    ds.id = id;
    ds.assets = Object.assign({ original:null, overlay:null, overlayGeo:null, sector:null }, ds.assets || {});
    ds.categories = Array.isArray(ds.categories) && ds.categories.length ? ds.categories : this.categories.map(c => c.id);
    ['keyRoads','blocks','zones','pins','properties','sectorMaps'].forEach(k => { if (!Array.isArray(ds[k])) ds[k] = []; });
    if (!ds.filters) ds.filters = {};
    this.datasets[id] = ds;
    return ds;
  },
  datasetFor(areaId) {
    const a = this.areas.find(x => x.id === areaId);
    return a && a.dataset ? this.datasets[a.dataset] : null;
  }
};
