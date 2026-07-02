/* ============================================================
   PlotMap data config.
   Centralizes ids, fallback asset paths, and public visibility rules.
   Map files are proof assets: this file references paths only and never
   transforms, renames, or rewrites images.
   ============================================================ */
window.PM_CONFIG = {
  datasets: {
    tricity: 'tricity-aerotropolis'
  },

  fallbackAssets: {
    tricity: {
      original: '/public/plotmap-assets/aerotropolis-original-web.jpg',
      overlay: '/public/plotmap-assets/aerotropolis-overlays.svg',
      overlayGeo: '/app/plotmap/geo.json',
      markings: '/public/plotmap-assets/markings.jpg',
      sector: '/public/plotmap-assets/sector-map.jpg'
    }
  },

  manifestPaths: [
    './map-assets.manifest.json',
    '/app/plotmap/map-assets.manifest.json'
  ],

  filterKeys: ['type', 'area', 'location', 'size', 'blockId'],

  visibility: {
    hiddenCategoryIds: ['green', 'entry'],
    publicCrmDrawingKinds: ['road', 'block', 'sectorTag'],
    defaultPoiCategoryIds: ['landmarks', 'institutions', 'it', 'entry'],
    publicSectorPinTypes: ['available-property', 'highlighted-property', 'landmark']
  },

  sectorPinLabels: {
    'available-property': 'Available Property',
    'highlighted-property': 'Highlighted Property',
    landmark: 'Landmark'
  },

  sectorCityOrder: ['Mohali', 'Panchkula', 'New Chandigarh', 'Aerocity']
};
