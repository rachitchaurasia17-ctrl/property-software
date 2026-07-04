/* ============================================================
   PlotMap overlay data.
   Coordinates reference the original proof map as a base layer.
   SVG paths use each map's viewBox; HTML plot/landmark/pin overlays
   use normalized percentages so they scale with the map image.
   Only entries with public: true render in the client view.
   ============================================================ */
(function () {
  const newChandigarhMasterplan = {
    viewBox: '0 0 1414 1036',
    source: {
      originalMapAsset: '/normal%20maps/new%20chandigarh%20masterplan.png',
      designReference: 'PlotMap map studio design-handoff (1).zip/project/map-data.js'
    },
    groups: {
      A: { label: 'Connectivity', color: '#1E5FA8' },
      B: { label: 'Residential', color: '#A87F1F' },
      C: { label: 'Commercial & Civic', color: '#157A56' },
      D: { label: 'Growth Corridor', color: '#B06A2C' }
    },
    roads: [
      { id: 'road-pr4', label: 'PR-4 Arterial', d: 'M258.592 474.5L320.592 483.5L363.092 478.5L400.592 474.5L426.592 470H460.092L473.592 474.5L493.092 470L536.092 456.5H560.092L814.592 490L920.092 502H967.092', group: 'A', public: true },
      { id: 'road-spine', label: 'Main Spine Road', d: 'M612.592 198L597.092 317L593.092 415V464.5V539.5L588.092 626L583.092 682V730L598.592 762.5L625.592 780.5L659.092 784.5L688.592 771.5L713.592 742L723.592 704.5V617.5L729.592 574.5L723.592 556L713.592 539.5L707.592 521V480L713.592 426.5L701.592 394L707.592 351.5', group: 'A', public: true },
      { id: 'road-expressway', label: 'Expressway Link Road', d: 'M1412.09 597.5L1224.09 593L1065.59 582H1034.09H1006.59L990.592 591L978.092 603.5L952.592 619L935.592 628L910.092 638.5H767.592L706.092 634.5H645.592H600.592L557.092 619L518.092 610.5L468.092 605L373.092 597.5L274.092 582.5L240.592 575.5L65.5922 527.5L1.59224 506', group: 'A', public: true },
      { id: 'road-pgi', label: 'Chandigarh-PGI Road', d: 'M167.592 316.5L255.592 282L306.592 300.5L353.592 322L374.592 312.5L395.092 316.5L485.592 305H517.092L598.092 322L690.592 346L898.092 350.5L956.092 346L1025.59 322L1057.09 313L1081.59 322L1108.09 350.5L1144.59 367.5L1226.09 417.5H1412.09', group: 'A', public: true },
      { id: 'road-kurali', label: 'Kurali Road', d: 'M276.092 0V53V84.5L271.092 152L276.092 202V280.5L271.092 323L279.592 342.5L285.092 363L276.092 384L262.092 416.5L251.592 510V529.5L232.092 576L180.092 667.5L139.092 739.5L108.092 779L65.0922 854.5', group: 'A', public: true },
      { id: 'road-aero', label: 'Aero City Road', d: 'M585.592 1029.5L659.092 967.5L781.592 879L847.092 837.5L868.092 832.5L1078.09 828L1160.09 832.5L1407.59 837.5', group: 'D', public: true }
    ],
    shapes: [
      { id: 'sec-zone1', label: 'Zone 1', type: 'sector', group: 'B', paths: ['M501.092 300L467.592 308L491.092 379V415.5L501.092 452V472L542.592 458.5H589.092L645.592 466.5L710.092 472L716.592 432L701.092 393.5L710.092 349.5H684.092L600.092 323.5L501.092 300Z'], public: true },
      { id: 'sec-zone2', label: 'Zone 2', type: 'sector', group: 'B', paths: ['M537.592 458L499.092 471.5V497L483.592 528L474.092 609L531.092 613L574.092 624L605.092 636.5H656.092L723.092 630.5L727.592 568L709.592 528L705.592 477.5L676.592 471.5L609.092 463L537.592 458Z'], public: true },
      { id: 'sec-zone3', label: 'Zone 3', type: 'sector', group: 'D', paths: ['M696.092 634H725.092V691.5L714.592 729.5L758.092 761.5L701.092 843L653.092 859L579.092 843L519.592 799L502.592 766L472.092 673V627C470.492 624.2 474.759 610.833 477.092 604.5L515.592 610.5C535.759 612.167 578.292 617.8 587.092 627C595.892 636.2 628.426 635.5 643.592 634H696.092Z'], public: true },
      { id: 'sec-blockE', label: 'E Blocks', type: 'sector', group: 'D', paths: ['M416.092 405.5C417.692 412.3 369.092 410.667 344.592 409L337.092 477L455.092 473.5C457.892 438.7 430.259 413.667 416.092 405.5Z', 'M454.092 474.5L334.592 478C334.592 483.5 335.292 494.9 338.092 496.5C340.892 498.1 336.926 513.833 334.592 521.5L325.092 597.5H362.092L374.592 568C386.592 533 390.592 551 426.592 524.5C455.392 503.3 456.926 482.333 454.092 474.5Z', 'M338.592 478L256.592 471.5L252.592 525L233.092 571.5L324.592 590.5L331.592 546.5L335.592 520L341.092 501.5C336.926 492.5 330.592 475.2 338.592 478Z'], public: true },
      { id: 'blk-omaxe3', label: 'Omaxe Phase 3', type: 'block', group: 'B', paths: ['M687.592 539.5L707.092 535L724.092 556L727.092 576L724.092 595.5L720.092 632H649.092L653.092 543H667.092L687.592 539.5Z'], public: true },
      { id: 'blk-altus', label: 'Altus', type: 'block', group: 'B', paths: ['M649.092 587L591.092 584L585.592 624.5L612.092 634L649.092 630V587Z'], public: true },
      { id: 'blk-hydepark', label: 'DLF Hyde Park', type: 'block', group: 'B', paths: ['M655.092 470.5L592.592 462V434L625.092 437.5L643.092 443H658.092L655.092 470.5Z'], public: true },
      { id: 'blk-block5', label: 'Block 5', type: 'block', group: 'B', paths: ['M549.092 528.5L552.592 491.5V471.5L557.092 458M557.092 458H531.592L501.092 467V495.5L487.092 528.5L517.092 522.5L549.092 528.5L592.592 535V463L557.092 458Z'], public: true },
      { id: 'blk-saini', label: 'Saini Majra', type: 'block', group: 'B', paths: ['M547.592 530.5L592.092 535.5L586.092 628L535.092 613.5V599.5L538.592 583.5L543.592 558L547.592 530.5Z'], public: true },
      { id: 'com-ecocity', label: 'Eco City Commercial Belt', type: 'landmark', group: 'C', paths: ['M510.092 332L600.092 350L684.092 352L708.092 349L705.092 372L655.092 368L590.092 353L512.092 341Z'], public: true },
      { id: 'lmk-pca', label: 'PCA Cricket Stadium', type: 'landmark', group: 'C', paths: ['M838.092 590L768.592 561L776.592 575L798.592 601V634.5H838.092V590Z'], public: true }
    ],
    selectedPlots: [
      { id: 'plot-214', label: 'Plot 214', type: 'house', x: 39.2, y: 47.4, w: 3.1, h: 3.8, public: true }
    ],
    selectedLandmarks: [
      { id: 'school-strawberry-fields', label: 'School', type: 'school', x: 45.8, y: 32.4, w: 2.6, h: 2.2, public: true }
    ],
    pins: [
      { id: 'pin-plot214', targetId: 'plot-214', label: 'Plot 214', public: true },
      { id: 'poi-tradetower', label: 'Trade Tower', x: 38.47, y: 31.27, public: true },
      { id: 'poi-medcity', label: 'Medcity Hospital', x: 41.94, y: 26.16, public: true },
      { id: 'poi-school', targetId: 'school-strawberry-fields', label: 'School', public: true }
    ]
  };

  const sector28Chandigarh = {
    viewBox: '0 0 1414 1036',
    source: {
      sectorMapAsset: '/maps/sector%2028%20chd.png',
      designReference: 'PlotMap map studio design-handoff (1).zip/project/uploads/sector 28 chd.png'
    },
    modes: ['easy'],
    roads: [],
    shapes: [],
    selectedPlots: [
      { id: 'sector28-plot-a', label: 'Selected Plot', type: 'house', x: 39.5, y: 48.5, w: 4.2, h: 5.2, public: true }
    ],
    selectedLandmarks: [
      { id: 'sector28-school', label: 'School', type: 'school', x: 58.5, y: 38, w: 8, h: 7, public: true }
    ],
    pins: [
      { id: 'sector28-pin-plot-a', targetId: 'sector28-plot-a', label: 'Selected Plot', public: true },
      { id: 'sector28-pin-school', targetId: 'sector28-school', label: 'School', public: true }
    ]
  };

  window.PLOTMAP_OVERLAYS = Object.assign({}, window.PLOTMAP_OVERLAYS || {}, {
    'masterplan-new-chandigarh-masterplan': newChandigarhMasterplan,
    'sector-sector-28-chandigarh': sector28Chandigarh
  });
})();
