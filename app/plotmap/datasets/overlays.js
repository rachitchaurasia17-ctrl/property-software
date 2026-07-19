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
    // Overlay geometry is traced on the original masterplan; the 3D map is a
    // different render/crop, so highlights stay off in 3D mode.
    modes: ['original'],
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
      { id: 'road-pr4', label: 'PR-4 Arterial', sub: 'East–West arterial · Airport side link', d: 'M258.592 474.5L320.592 483.5L363.092 478.5L400.592 474.5L426.592 470H460.092L473.592 474.5L493.092 470L536.092 456.5H560.092L814.592 490L920.092 502H967.092', group: 'A', public: true, rel: ['sec-zone1', 'sec-zone2', 'sec-blockE'], rows: [['Type', 'Arterial road'], ['Serves', 'Zone 1 · Zone 2 · E Blocks'], ['Continues to', 'PGI side (east)']] },
      { id: 'road-spine', label: 'Main Spine Road', sub: 'North–South spine through Zones 1–3', d: 'M612.592 198L597.092 317L593.092 415V464.5V539.5L588.092 626L583.092 682V730L598.592 762.5L625.592 780.5L659.092 784.5L688.592 771.5L713.592 742L723.592 704.5V617.5L729.592 574.5L723.592 556L713.592 539.5L707.592 521V480L713.592 426.5L701.592 394L707.592 351.5', group: 'A', public: true, rel: ['sec-zone1', 'sec-zone2', 'sec-zone3'], rows: [['Type', 'Sector spine'], ['Serves', 'Zone 1 · Zone 2 · Zone 3'], ['Character', 'Main sector road']] },
      { id: 'road-expressway', label: 'Expressway Link Road', sub: 'Towards GMADA Expressway / Anandpur Sahib', d: 'M1412.09 597.5L1224.09 593L1065.59 582H1034.09H1006.59L990.592 591L978.092 603.5L952.592 619L935.592 628L910.092 638.5H767.592L706.092 634.5H645.592H600.592L557.092 619L518.092 610.5L468.092 605L373.092 597.5L274.092 582.5L240.592 575.5L65.5922 527.5L1.59224 506', group: 'A', public: true, rel: ['sec-zone3', 'sec-blockE'], rows: [['Type', 'Expressway link'], ['Direction', 'GMADA Expressway (west)'], ['Serves', 'Zone 3 · E Blocks']] },
      { id: 'road-pgi', label: 'Chandigarh-PGI Road', sub: 'Direct entry from Chandigarh / PGI side', d: 'M167.592 316.5L255.592 282L306.592 300.5L353.592 322L374.592 312.5L395.092 316.5L485.592 305H517.092L598.092 322L690.592 346L898.092 350.5L956.092 346L1025.59 322L1057.09 313L1081.59 322L1108.09 350.5L1144.59 367.5L1226.09 417.5H1412.09', group: 'A', public: true, rel: ['sec-zone1'], rows: [['Type', 'City connector'], ['Direction', 'Chandigarh · PGI (east)'], ['Serves', 'Zone 1 · Eco City']] },
      { id: 'road-kurali', label: 'Kurali Road', sub: 'Northern exit towards Kurali', d: 'M276.092 0V53V84.5L271.092 152L276.092 202V280.5L271.092 323L279.592 342.5L285.092 363L276.092 384L262.092 416.5L251.592 510V529.5L232.092 576L180.092 667.5L139.092 739.5L108.092 779L65.0922 854.5', group: 'A', public: true, rel: ['sec-blockE'], rows: [['Type', 'Regional road'], ['Direction', 'Kurali (north)'], ['Serves', 'Western belt · E Blocks']] },
      { id: 'road-aero', label: 'Aero City Road', sub: 'Southern belt towards Aero City / Mohali', d: 'M585.592 1029.5L659.092 967.5L781.592 879L847.092 837.5L868.092 832.5L1078.09 828L1160.09 832.5L1407.59 837.5', group: 'D', public: true, rel: ['sec-zone3'], rows: [['Type', 'Southern belt road'], ['Direction', 'Aero City · Mohali'], ['Serves', 'Zone 3 (south edge)']] }
    ],
    shapes: [
      { id: 'sec-zone1', label: 'Zone 1', sub: 'Eco City belt', type: 'sector', group: 'B', paths: ['M501.092 300L467.592 308L491.092 379V415.5L501.092 452V472L542.592 458.5H589.092L645.592 466.5L710.092 472L716.592 432L701.092 393.5L710.092 349.5H684.092L600.092 323.5L501.092 300Z'], public: true, rel: ['road-pr4', 'road-pgi', 'road-spine'], rows: [['Zone', 'Zone 1 · Eco City'], ['Blocks inside', 'Eco City · DLF Hyde Park'], ['Nearest roads', 'PGI Road · PR-4'], ['Proof', 'Official masterplan available']] },
      { id: 'sec-zone2', label: 'Zone 2', sub: 'Omaxe · Altus belt', type: 'sector', group: 'B', paths: ['M537.592 458L499.092 471.5V497L483.592 528L474.092 609L531.092 613L574.092 624L605.092 636.5H656.092L723.092 630.5L727.592 568L709.592 528L705.592 477.5L676.592 471.5L609.092 463L537.592 458Z'], public: true, rel: ['road-pr4', 'road-spine'], rows: [['Zone', 'Zone 2'], ['Blocks inside', 'Omaxe Ph-3 · Altus · Saini Majra'], ['Nearest roads', 'PR-4 · Main Spine'], ['Proof', 'Official masterplan available']] },
      { id: 'sec-zone3', label: 'Zone 3', sub: 'Southern development ring', type: 'sector', group: 'D', paths: ['M696.092 634H725.092V691.5L714.592 729.5L758.092 761.5L701.092 843L653.092 859L579.092 843L519.592 799L502.592 766L472.092 673V627C470.492 624.2 474.759 610.833 477.092 604.5L515.592 610.5C535.759 612.167 578.292 617.8 587.092 627C595.892 636.2 628.426 635.5 643.592 634H696.092Z'], public: true, rel: ['road-spine', 'road-expressway', 'road-aero'], rows: [['Zone', 'Zone 3'], ['Character', 'Southern ring · growth side'], ['Nearest roads', 'Main Spine · Expressway Link'], ['Proof', 'Official masterplan available']] },
      { id: 'sec-blockE', label: 'E Blocks', sub: 'Western belt · Kansalpur / Karsal side', type: 'sector', group: 'D', paths: ['M416.092 405.5C417.692 412.3 369.092 410.667 344.592 409L337.092 477L455.092 473.5C457.892 438.7 430.259 413.667 416.092 405.5Z', 'M454.092 474.5L334.592 478C334.592 483.5 335.292 494.9 338.092 496.5C340.892 498.1 336.926 513.833 334.592 521.5L325.092 597.5H362.092L374.592 568C386.592 533 390.592 551 426.592 524.5C455.392 503.3 456.926 482.333 454.092 474.5Z', 'M338.592 478L256.592 471.5L252.592 525L233.092 571.5L324.592 590.5L331.592 546.5L335.592 520L341.092 501.5C336.926 492.5 330.592 475.2 338.592 478Z'], public: true, rel: ['road-pr4', 'road-kurali', 'road-expressway'], rows: [['Zone', 'E Blocks (western belt)'], ['Villages', 'Kansalpur · Karsal · Boothgarh'], ['Nearest roads', 'PR-4 · Kurali Road'], ['Proof', 'Official masterplan available']] },
      { id: 'blk-omaxe3', label: 'Omaxe Phase 3', sub: 'Block · Zone 2', type: 'block', group: 'B', paths: ['M687.592 539.5L707.092 535L724.092 556L727.092 576L724.092 595.5L720.092 632H649.092L653.092 543H667.092L687.592 539.5Z'], public: true, parent: 'sec-zone2', rel: ['road-spine'], rows: [['Block', 'Omaxe Phase 3'], ['Sector', 'Zone 2'], ['Faces', 'Main Spine Road'], ['Proof', 'Sector proof available']] },
      { id: 'blk-altus', label: 'Altus', sub: 'Block · Zone 2', type: 'block', group: 'B', paths: ['M649.092 587L591.092 584L585.592 624.5L612.092 634L649.092 630V587Z'], public: true, parent: 'sec-zone2', rel: ['road-spine'], rows: [['Block', 'Altus'], ['Sector', 'Zone 2'], ['Faces', 'Main Spine Road'], ['Proof', 'Sector proof available']] },
      { id: 'blk-hydepark', label: 'DLF Hyde Park', sub: 'Block · Zone 1', type: 'block', group: 'B', paths: ['M655.092 470.5L592.592 462V434L625.092 437.5L643.092 443H658.092L655.092 470.5Z'], public: true, parent: 'sec-zone1', rel: ['road-pr4'], rows: [['Block', 'DLF Hyde Park'], ['Sector', 'Zone 1 · Eco City'], ['Nearest road', 'PR-4'], ['Proof', 'Sector proof available']] },
      { id: 'blk-block5', label: 'Block 5', sub: 'Block · Zone 2', type: 'block', group: 'B', paths: ['M549.092 528.5L552.592 491.5V471.5L557.092 458M557.092 458H531.592L501.092 467V495.5L487.092 528.5L517.092 522.5L549.092 528.5L592.592 535V463L557.092 458Z'], public: true, parent: 'sec-zone2', rel: ['road-pr4'], rows: [['Block', 'Block 5'], ['Sector', 'Zone 2'], ['Nearest road', 'PR-4'], ['Proof', 'Sector proof available']] },
      { id: 'blk-saini', label: 'Saini Majra', sub: 'Block · Zone 2', type: 'block', group: 'B', paths: ['M547.592 530.5L592.092 535.5L586.092 628L535.092 613.5V599.5L538.592 583.5L543.592 558L547.592 530.5Z'], public: true, parent: 'sec-zone2', rel: ['road-spine'], rows: [['Block', 'Saini Majra'], ['Sector', 'Zone 2'], ['Nearest road', 'Main Spine Road'], ['Proof', 'Sector proof available']] },
      { id: 'com-ecocity', label: 'Eco City Commercial Belt', sub: 'Retail & office frontage', type: 'landmark', group: 'C', paths: ['M510.092 332L600.092 350L684.092 352L708.092 349L705.092 372L655.092 368L590.092 353L512.092 341Z'], public: true, rel: ['road-pgi', 'sec-zone1'], rows: [['Type', 'Commercial belt'], ['Why it matters', 'Shops, offices, daily needs'], ['Frontage', 'Chandigarh–PGI Road'], ['Proof', 'Location proof available']] },
      { id: 'grn-belt', label: 'Central Green Belt', sub: 'Park & open space', type: 'landmark', group: 'C', paths: ['M325.092 597L362.092 597L360.092 645L300.092 662L300.092 612Z'], public: true, rel: ['sec-blockE'], rows: [['Type', 'Green belt / park'], ['Why it matters', 'Open space, walking, cleaner air'], ['Near', 'E Blocks'], ['Proof', 'Location proof available']] },
      { id: 'lmk-pca', label: 'PCA Cricket Stadium', sub: 'Sports landmark · east of Zone 2', type: 'landmark', group: 'C', paths: ['M838.092 590L768.592 561L776.592 575L798.592 601V634.5H838.092V590Z'], public: true, rel: ['road-expressway'], rows: [['Type', 'Sports landmark'], ['Why it matters', 'Signature address · pulls visitors'], ['Nearby', 'Zone 2 · Expressway Link'], ['Proof', 'Location proof available']] }
    ],
    labels: [
      { id: 'lbl-belt', label: 'Commercial Belt', at: [598, 315], group: 'C', public: true },
      { id: 'lbl-growth', label: 'Growth Corridor', at: [600, 700], group: 'D', big: true, public: true }
    ],
    selectedPlots: [
      { id: 'plot-214', label: 'Plot 214', type: 'house', x: 39.2, y: 47.4, w: 3.1, h: 3.8, public: true }
    ],
    selectedLandmarks: [
      { id: 'school-strawberry-fields', label: 'School', type: 'school', x: 45.8, y: 32.4, w: 2.6, h: 2.2, public: true }
    ],
    pins: [
      { id: 'pin-plot214', targetId: 'plot-214', label: 'Plot 214', sub: 'Residential plot · Block 5', group: 'B', public: true, parent: 'blk-block5', nearRoad: 'road-pr4', rows: [['Area', 'New Chandigarh'], ['Sector', 'Zone 2'], ['Block', 'Block 5'], ['Size', '250 sq yd'], ['Facing', 'North-East'], ['Road width', '60 ft']] },
      { id: 'poi-tradetower', label: 'Trade Tower', sub: 'Commercial landmark', x: 38.47, y: 31.27, group: 'C', public: true, parent: 'sec-zone1', nearRoad: 'road-pgi', rows: [['Type', 'Commercial tower'], ['Belt', 'Eco City commercial'], ['Nearest road', 'PGI Road']] },
      { id: 'poi-medcity', label: 'Medcity Hospital', sub: 'Healthcare landmark', x: 41.94, y: 26.16, group: 'C', public: true, nearRoad: 'road-spine', rows: [['Type', 'Healthcare'], ['Nearest road', 'Main Spine Road']] },
      { id: 'poi-school', targetId: 'school-strawberry-fields', label: 'School', sub: 'Education landmark', group: 'C', public: true, parent: 'sec-zone1', nearRoad: 'road-pgi', rows: [['Type', 'School'], ['Sector', 'Zone 1 · Eco City'], ['Nearest road', 'PGI Road']] }
    ]
  };

  /* ============================================================
     Mohali masterplan highlights.
     Geometry source: mohali-overlays.svg (Figma export, viewBox 0 0 1575 1132),
     projected into original-map pixel space (1600x1278) with the solved affine
     p = 0.996492*u + (28,103) — registration score 0.9965 against the annotated
     reference composite. Sector ids/names come from the SVG (real sector numbers).
     Road names are placeholders ("Road N") until real names are supplied.
     ============================================================ */
  const mohaliMasterplan = {
    viewBox: '0 0 1600 1278',
    modes: ['original'],
    source: {
      originalMapAsset: '/normal%20maps/mohali%20masterplan.jpg',
      overlaySvg: '/public/plotmap-assets/mohali-overlays.svg',
      annotatedReference: '/public/plotmap-assets/mohali-annotated-reference.png'
    },
    groups: {
      A: { label: 'Connectivity', color: '#1E5FA8' },
      B: { label: 'Sectors', color: '#A87F1F' }
    },
    roads: [
      { id: 'mh-road-1', label: 'Road 1', d: 'M33.25 596.26L78.59 569.36L105.49 562.88L170.76 522.52L334.69 443.3L355.12 437.32H522.53L617.69 448.28H776.63H915.64H963.97', group: 'A', public: true },
      { id: 'mh-road-2', label: 'Road 2', d: 'M171.76 651.57L205.64 603.24L268.42 571.35L383.02 515.55H426.36L633.14 526.01H941.55H962.98', group: 'A', public: true },
      { id: 'mh-road-3', label: 'Road 3', d: 'M34.25 738.26L109.98 743.74H178.74L286.36 698.4L326.22 666.02L440.81 596.26L501.1 567.37', group: 'A', public: true },
      { id: 'mh-road-4', label: 'Road 4', d: 'M34.25 739.26L173.75 744.74H206.64L231.55 758.19L614.2 876.78H639.12L663.03 882.76L683.46 895.21L718.84 906.67L906.18 939.56L1108.47 999.34L1264.42 1039.7L1493.61 1078.07L1554.4 1096.5L1596.75 1128.39', group: 'A', public: true },
      { id: 'mh-road-5', label: 'Road 5', d: 'M1024.26 1227.54L1073.59 1129.39L1107.47 998.35L1135.37 884.75L1157.29 809.51L1166.26 742.75L1173.74 668.51L1166.26 576.33', group: 'A', public: true },
      { id: 'mh-road-6', label: 'Road 6', d: 'M290.34 691.93L329.7 714.85L384.01 738.26H422.38H475.19H623.67L783.61 743.74H983.9H1232.53L1421.36 732.28', group: 'A', public: true },
      { id: 'mh-road-7', label: 'Road 7', d: 'M193.19 506.08L202.65 518.54L339.67 619.68L358.6 644.59L382.02 662.03L420.39 672.5L526.51 662.03L646.59 672.5H775.14H982.91L1062.13 679.47L1094.02 672.5L1133.38 666.02H1202.63L1290.33 647.58L1320.22 641.6L1422.36 585.8L1493.61 548.43L1504.07 531.99L1549.41 400.95V349.63L1558.88 289.34L1579.31 206.14', group: 'A', public: true },
      { id: 'mh-road-8', label: 'Road 8', d: 'M1592.76 769.15L1469.69 790.08L1317.23 805.53L1160.28 811.51L1081.06 805.53L956 811.51H789.59H698.91H579.33L464.73 794.07', group: 'A', public: true },
      { id: 'mh-road-9', label: 'Road 9', d: 'M1409.41 554.91L1165.27 580.32L1001.34 595.77H913.15H775.64L576.34 589.79H517.05H510.57L499.11 584.8H485.16L475.69 580.32L409.92 533.98', group: 'A', public: true },
      { id: 'mh-road-10', label: 'Road 10', d: 'M101.51 203.65L88.55 232.05L73.11 276.39V335.68L88.55 381.02L124.43 420.38L166.28 437.32C173.42 437.32 189.7 437.32 197.67 437.32C205.64 437.32 232.88 437.32 245.5 437.32L270.41 454.76L285.36 479.67L387 555.41L426.36 586.8C433.17 595.93 448.09 615.89 453.27 622.67C458.45 629.45 467.72 645.76 471.71 653.06L465.23 795.56L453.27 824.96L426.36 893.22', group: 'A', public: true },
      { id: 'mh-road-11', label: 'Road 11', d: 'M1559.38 1228.54L1502.08 1081.56L1512.54 1024.26L1449.76 710.36L1402.43 544.45L1349.12 400.45V341.16', group: 'A', public: true },
      { id: 'mh-road-12', label: 'Road 12', d: 'M30.26 267.92L83.57 277.88L121.94 284.36L188.2 300.31L366.58 312.26L414.9 284.36L465.23 210.62L509.07 193.68H727.31L869.8 199.66H1036.22L1190.18 271.91L1330.68 327.21L1549.41 448.78H1596.75', group: 'A', public: true },
      { id: 'mh-road-13', label: 'Road 13', d: 'M522.03 121.44V440.31V519.04', group: 'A', public: true },
      { id: 'mh-road-14', label: 'Road 14', d: 'M570.36 117.95V194.18V446.29V673.49V736.77', group: 'A', public: true },
      { id: 'mh-road-15', label: 'Road 15', d: 'M619.68 112.96V460.24V639.61L616.2 738.26', group: 'A', public: true },
      { id: 'mh-road-16', label: 'Road 16', d: 'M670.01 106.99V122.43L663.53 147.84V162.79L670.01 195.18L663.53 224.07L661.04 243.51L666.02 272.4L670.01 297.32V383.51L662.04 397.46L652.57 410.42V423.37L665.02 445.3V526.51L663.53 645.09V738.76V758.19L652.57 779.12L651.07 785.6V822.97L648.58 877.27', group: 'A', public: true },
      { id: 'mh-road-17', label: 'Road 17', d: 'M718.84 108.98V445.79L715.85 454.76L706.38 465.72L704.39 474.69L708.87 481.67L718.84 496.12L717.84 621.18L732.79 633.13L718.84 644.59L716.84 645.59V681.46L710.36 690.93L708.37 693.42V713.85L715.35 721.82L713.35 809.51L712.36 834.92L688.94 842.9L687.94 895.71L666.52 951.51', group: 'A', public: true },
      { id: 'mh-road-18', label: 'Road 18', d: 'M774.64 103V670', group: 'A', public: true },
      { id: 'mh-road-19', label: 'Road 19', d: 'M757.2 730.79L754.21 910.66H745.74V918.13L726.31 974.43', group: 'A', public: true },
      { id: 'mh-road-20', label: 'Road 20', d: 'M826.46 103.5V606.73L810.51 620.68L804.04 918.63V931.08L808.52 942.54V964.97L804.04 972.94L800.55 977.42V987.88', group: 'A', public: true },
      { id: 'mh-road-21', label: 'Road 21', d: 'M875.28 106.99V529.5V595.77H855.85L859.34 604.24L868.81 616.19V699.4L866.81 794.07V853.36V882.76L861.33 931.08', group: 'A', public: true },
      { id: 'mh-road-22', label: 'Road 22', d: 'M916.14 106.99V417.39V596.26L912.65 734.28V822.97L916.14 833.43V879.77', group: 'A', public: true },
      { id: 'mh-road-23', label: 'Road 23', d: 'M965.97 114.96V220.09V422.87L959.99 521.53V602.74V637.62L963.97 672.99', group: 'A', public: true },
      { id: 'mh-road-24', label: 'Road 24', d: 'M1092.52 588.29V672.99L1086.54 746.73L1083.55 810.01V827.45L1054.66 917.13L1031.24 974.93', group: 'A', public: true },
      { id: 'mh-road-25', label: 'Road 25', d: 'M28.27 855.85L66.13 879.77L106.49 908.66L181.23 936.57L214.11 949.52L288.85 989.88L378.53 1018.78L436.33 1031.23L475.69 1037.71L543.95 1054.15L604.74 1080.56L648.08 1085.54L693.92 1099.49L727.8 1115.44L831.44 1147.82L931.59 1178.21L960.98 1185.69L976.43 1192.17L1032.73 1198.64L1073.59 1208.61L1113.45 1230.03', group: 'A', public: true },
      { id: 'mh-road-26', label: 'Road 26', d: 'M527.01 294.33H573.85L628.15 302.3H736.27H878.27H920.62L965.97 294.33', group: 'A', public: true },
    ],
    shapes: [
      { id: 'mh-sec-62', label: 'Sector 62', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M824.46 525.51H775.14V596.26H824.46V525.51Z'], public: true },
      { id: 'mh-sec-61', label: 'Sector 61', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M719.83 525.51H776.63V592.28H719.83V525.51Z'], public: true },
      { id: 'mh-sec-59', label: 'Sector 59', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M618.19 524.52V593.27H665.02V524.52H618.19Z'], public: true },
      { id: 'mh-sec-60', label: 'Sector 60', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M717.34 525.51H667.02V593.27H717.34V525.51Z'], public: true },
      { id: 'mh-sec-58', label: 'Sector 58', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M619.19 524.52H566.37V590.78H619.19V524.52Z'], public: true },
      { id: 'mh-sec-73', label: 'Sector 73', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M617.69 593.27L523.52 588.79L531.99 599.75V615.7L523.52 636.12V645.09L520.53 655.55L537.97 663.53L617.69 667.01V593.27Z'], public: true },
      { id: 'mh-sec-72', label: 'Sector 72', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M663.53 594.77H616.69V668.01H663.53V594.77Z'], public: true },
      { id: 'mh-sec-70', label: 'Sector 70', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M777.13 594.77H718.34V622.17L730.79 634.13L718.34 645.59V669.51H777.13V594.77Z'], public: true },
      { id: 'mh-sec-71', label: 'Sector 71', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M718.34 593.77H668.01H663.53V670H718.34V646.59L731.29 635.13L718.34 624.17V593.77Z'], public: true },
      { id: 'mh-sec-69', label: 'Sector 69', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M824.96 597.26H775.64L777.13 671L810.01 672.5V621.67L824.96 606.73V597.26Z'], public: true },
      { id: 'mh-sec-68', label: 'Sector 68', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M854.86 596.76H825.46V606.73L810.01 622.17V672.5H869.31V615.7L854.86 596.76Z'], public: true },
      { id: 'mh-sec-67', label: 'Sector 67', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M914.15 596.76H854.86L869.31 615.2V672.5L914.15 671V596.76Z'], public: true },
      { id: 'mh-sec-63', label: 'Sector 63', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M874.79 524.52H825.46V594.77H874.79V524.52Z'], public: true },
      { id: 'mh-sec-64', label: 'Sector 64', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M915.14 526.01H875.78L873.29 596.26H915.14V526.01Z'], public: true },
      { id: 'mh-sec-65', label: 'Sector 65', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M960.98 527.51H916.14L914.15 596.26L960.98 597.76V527.51Z'], public: true },
      { id: 'mh-sec-66', label: 'Sector 66', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M959.99 597.76L914.65 599.75V672.99H962.98L959.99 597.76Z'], public: true },
      { id: 'mh-sec-79', label: 'Sector 79', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M868.31 672.5H809.02L807.52 741.75L868.31 740.26V672.5Z'], public: true },
      { id: 'mh-sec-78', label: 'Sector 78', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M808.52 671.5H757.2V676.48L785.6 700.4L761.68 727.3V730.79H757.2V738.76L808.52 740.75V671.5Z'], public: true },
      { id: 'mh-sec-77', label: 'Sector 77', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M757.7 670H718.34H716.34V683.95L709.37 690.43V714.85L714.35 721.32V739.76H757.7V729.79H761.68V726.8L785.6 700.4L757.7 675.98V670Z'], public: true },
      { id: 'mh-sec-76', label: 'Sector 76', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M717.34 670.5H663.03L662.04 739.76L714.35 738.26V721.82L709.87 715.84V690.93L717.34 684.45V670.5Z'], public: true },
      { id: 'mh-sec-75', label: 'Sector 75', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M665.52 669.51H618.69L615.7 739.26H663.53L665.52 669.51Z'], public: true },
      { id: 'mh-sec-74', label: 'Sector 74', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M617.69 668.01L540.46 666.02V668.01L549.43 673.99L556.91 678.47L561.89 686.45L563.88 692.43L561.89 698.4L552.92 714.35V721.32L556.91 730.29V737.27H615.7L617.69 668.01Z'], public: true },
      { id: 'mh-sec-80', label: 'Sector 80', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M915.14 672H868.81V740.26H913.15V729.79L915.14 672Z'], public: true },
      { id: 'mh-sec-81', label: 'Sector 81', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M991.38 673.49H915.64L912.15 738.76L984.9 740.75V735.27L991.38 673.49Z'], public: true },
      { id: 'mh-sec-84', label: 'Sector 84', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M983.4 740.75L911.66 742.75V811.51H977.92V805.03L983.4 740.75Z'], public: true },
      { id: 'mh-sec-85', label: 'Sector 85', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M913.15 742.75H865.82L863.33 811.01H911.66L913.15 742.75Z'], public: true },
      { id: 'mh-sec-86', label: 'Sector 86', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M868.81 744.74H809.52L806.03 811.51H866.32L868.81 744.74Z'], public: true },
      { id: 'mh-sec-105', label: 'Sector 105', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M863.82 883.25H804.04V917.63L863.82 925.6L868.31 907.67L863.82 883.25Z'], public: true },
      { id: 'mh-sec-87', label: 'Sector 87', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M807.52 743.25H756.7L755.71 811.01L807.52 813V743.25Z'], public: true },
      { id: 'mh-sec-88', label: 'Sector 88', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M758.2 742.25H714.35L711.86 813H755.71L758.2 742.25Z'], public: true },
      { id: 'mh-sec-89', label: 'Sector 89', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M714.85 740.26H662.53L665.02 755.2L650.58 779.62V811.01H712.36L714.85 740.26Z'], public: true },
      { id: 'mh-sec-90', label: 'Sector 90', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M600.25 811.51H651.07V781.11L664.03 756.2L661.04 739.26H613.21L615.2 761.18L600.25 778.62V811.51Z'], public: true },
      { id: 'mh-sec-91', label: 'Sector 91', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M613.21 739.76H556.41L551.92 743.25V750.22L562.88 758.19L567.87 768.16L562.88 809.51H603.24L600.25 781.11L615.7 762.68L613.21 739.76Z'], public: true },
      { id: 'mh-sec-96', label: 'Sector 96', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M757.7 814.5H711.36V834.92L688.94 839.91V852.36H752.72L757.7 814.5Z'], public: true },
      { id: 'mh-sec-95', label: 'Sector 95', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M710.86 814.99H650.58L648.08 874.28L665.52 879.77L677.48 887.74L682.46 892.72H687.45L689.94 840.9L710.86 836.42V814.99Z'], public: true },
      { id: 'mh-sec-94', label: 'Sector 94', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M651.07 812H600.75V835.92L585.31 862.83L614.7 871.79H631.64L648.58 874.78L651.07 812Z'], public: true },
      { id: 'mh-sec-93', label: 'Sector 93', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M599.26 813L562.39 810.51L557.4 815.49L550.43 817.98L544.95 832.93L550.43 837.41L544.95 852.36L584.81 862.83L599.26 837.41V813Z'], public: true },
      { id: 'mh-sec-107', label: 'Sector 107', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M755.21 853.36H689.44L686.95 894.71L716.84 903.68L752.22 908.66L755.21 853.36Z'], public: true },
      { id: 'mh-sec-97', label: 'Sector 97', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M807.02 814.5L804.04 883.25H753.21L755.71 812.5H807.02'], public: true },
      { id: 'mh-sec-98', label: 'Sector 98', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M806.53 813V880.76L865.32 882.76L867.31 813H806.53Z'], public: true },
      { id: 'mh-sec-99', label: 'Sector 99', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M916.14 883.25H867.31V811.01H913.15V823.96L916.14 837.41V883.25Z'], public: true },
      { id: 'mh-sec-100', label: 'Sector 100', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M976.93 813.5H914.15L911.16 825.95L917.64 836.42L914.15 882.76H956.5L971.45 849.87L976.93 813.5Z'], public: true },
      { id: 'mh-sec-104', label: 'Sector 104', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M957.99 883.75H865.82L868.81 903.68L861.33 926.6L910.66 937.06L957.99 883.75Z'], public: true },
      { id: 'mh-sec-109', label: 'Sector 109', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M804.04 920.12L749.73 910.66L726.81 967.96L761.68 982.4L793.57 988.88L804.04 982.4L800.05 976.92L809.02 967.96V950.52L804.04 934.57V920.12Z'], public: true },
      { id: 'mh-sec-106', label: 'Sector 106', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M802.54 881.26H752.72V907.17L802.54 918.13V881.26Z'], public: true },
      { id: 'mh-sec-127', label: 'Sector 127', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M199.16 735.27L292.83 694.92L386.5 742.75L398.96 740.26V772.14L388.5 805.03L227.56 754.71L199.16 735.27Z'], public: true },
      { id: 'mh-sec-57', label: 'Sector 57', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M506.58 571.35L526.01 592.78H567.37V534.48L551.42 522.02H526.01H517.05H489.14L494.62 546.94L502.1 565.87L506.58 571.35Z'], public: true },
      { id: 'mh-sec-92-a', label: 'Sector 92-A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M522.03 804.53L466.72 794.07L452.77 826.95L522.03 845.39V804.53Z'], public: true },
      { id: 'mh-sec-110', label: 'Sector 110', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M750.22 911.16L686.45 895.71V911.16L663.03 954L725.31 971.94L750.22 911.16Z'], public: true },
      { id: 'mh-sec-111', label: 'Sector 111', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M670.51 885.74L646.09 876.78L642.6 897.7L623.17 941.55L664.03 955L686.95 910.66V897.7H678.98V894.71L670.51 885.74Z'], public: true },
      { id: 'mh-sec-112', label: 'Sector 112', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M634.63 873.79L648.08 878.27L645.09 896.21L624.17 942.54L564.38 927.1L578.33 899.2L583.81 864.82L617.69 873.79H634.63Z'], public: true },
      { id: 'mh-sec-113', label: 'Sector 113', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M583.81 865.81L542.95 855.35V868.8V886.24L528.51 900.69L538.97 911.16L535.48 917.13L566.87 927.1L580.32 900.69L583.81 865.81Z'], public: true },
      { id: 'mh-sec-115', label: 'Sector 115', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M462.74 833.43L305.29 781.61L299.31 790.58L305.29 797.06L314.26 800.05L322.23 810.01H330.7L345.65 818.98L356.11 821.47H366.08V826.45H376.04L411.42 833.43V843.39L404.44 855.35L421.38 859.84L448.79 864.32L453.27 855.35V843.39L462.74 833.43Z'], public: true },
      { id: 'mh-sec-114', label: 'Sector 114', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M535.48 854.36L478.18 839.41L464.73 845.88L458.25 863.32L464.73 885.25V895.71L522.53 912.15V908.17V904.68L514.06 900.69V895.71L522.53 892.22L531.49 885.25L535.48 875.78L531.49 863.32L535.48 854.36Z'], public: true },
      { id: 'mh-sec-108', label: 'Sector 108', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M911.66 937.06L802.04 920.62V937.06L811.51 950.52L808.02 965.46L802.04 975.93V982.4L824.96 975.93L854.36 969.45L875.78 954L911.66 937.06Z'], public: true },
      { id: 'mh-sec-116', label: 'Sector 116', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M420.39 741.25H400.95V773.64L390.49 805.03L452.77 826.95L467.72 792.57V737.27H433.34L420.39 741.25Z'], public: true },
      { id: 'mh-sec-92', label: 'Sector 92', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M523.02 738.76H467.72V792.07L523.02 802.04V738.76Z'], public: true },
      { id: 'mh-sec-74-a', label: 'Sector 74-A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M521.03 664.03L471.21 669.01L467.22 738.76H521.03C526.51 738.93 539.07 739.16 545.45 738.76C551.82 738.36 550.43 733.28 548.93 730.79L545.45 721.32V713.85L552.92 704.88V687.44C552.92 683.86 547.94 681.96 545.45 681.46L537.47 673.49L521.03 664.03Z'], public: true },
      { id: 'mh-sec-117', label: 'Sector 117', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M468.22 668.01L408.93 671.5L403.45 741.75L431.35 736.77H468.22V668.01Z'], public: true },
      { id: 'mh-sec-118', label: 'Sector 118', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M382.52 659.04L358.1 645.09L435.83 599.75L467.72 641.6L473.2 652.57L467.72 667.51L431.85 671.5H406.93L382.52 659.04Z'], public: true },
      { id: 'mh-sec-119', label: 'Sector 119', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M499.61 569.36L435.33 598.26L470.21 645.09V667.01L517.05 661.04C517.05 659.37 517.84 655.46 521.03 653.06C524.22 650.67 522.36 649.41 521.03 649.08L517.05 645.09C517.21 642.27 518.24 636.22 521.03 634.63C523.82 633.03 522.19 630.97 521.03 630.14L528.01 620.68L531.49 602.24L521.03 593.27L499.61 569.36Z'], public: true },
      { id: 'mh-sec-126', label: 'Sector 126', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M404.44 670.5L357.61 644.1L320.74 670.5L291.34 692.92L389 740.26H401.45L404.44 670.5Z'], public: true },
      { id: 'mh-sec-120', label: 'Sector 120', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M352.13 529L269.42 569.36L335.68 618.19L357.11 643.6L436.33 598.75L352.13 529Z'], public: true },
      { id: 'mh-sec-121', label: 'Sector 121', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M380.53 516.05L355.61 528L438.32 599.25L500.6 566.37L494.13 555.41L484.66 520.03L380.53 516.05Z'], public: true },
      { id: 'mh-sec-122', label: 'Sector 122', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M452.77 500.1V492.63L449.28 489.64L447.29 487.65C444.3 487.65 437.43 487.65 433.84 487.65C430.25 487.65 432.34 484.66 433.84 483.16V479.67H429.35L427.36 475.69L429.35 471.2L427.36 468.71L419.89 465.72L414.9 468.71L405.94 460.74H397.96H393.98H384.51L379.03 440.81H370.06H335.68L278.39 468.71L289.85 487.65L320.99 509.57L352.13 531.49L375.05 517.04L384.51 511.56H405.94L478.18 517.04V511.56L470.71 508.57L465.23 511.56L452.77 508.57'], public: true },
      { id: 'mh-sec-123', label: 'Sector 123', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M192.19 510.57L278.88 468.71L291.84 485.15L351.13 528L268.42 567.37L192.19 510.57Z'], public: true },
      { id: 'mh-sec-124', label: 'Sector 124', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M163.79 525.51L195.18 510.57L267.92 568.36L216.1 595.77L201.16 607.22L168.77 650.07L163.79 645.09V640.61H157.31H150.34V645.09H143.36H139.37L143.36 654.56H130.9V660.04L123.43 654.56L108.48 636.12L103 607.22L112.47 591.78L123.43 583.81L143.36 576.83L157.31 558.9L160.55 542.2L163.79 525.51Z'], public: true },
      { id: 'mh-sec-125', label: 'Sector 125', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M204.15 605.73L169.77 652.07L199.66 679.97L204.15 687.44L225.57 683.95V672.99L240.52 676.48L255.96 646.59L284.36 658.05L290.34 672.99L309.28 676.48L354.12 642.1L342.66 620.68L267.42 570.35L231.55 587.3L204.15 605.73Z'], public: true },
      { id: 'mh-sec-56', label: 'Sector 56', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M484.66 495.12L473.7 510.57H480.67L473.7 519.53H484.66L500.11 568.36L508.08 563.38L566.87 506.08V443.3L520.03 439.32V484.16L503.59 477.68H494.62H488.65L480.67 484.16L484.66 495.12Z'], public: true },
      { id: 'mh-sec-55', label: 'Sector 55', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M619.19 447.29L566.87 443.8V522.52H619.19V447.29Z'], public: true },
      { id: 'mh-sec-54', label: 'Sector 54', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M664.03 445.3H618.69V522.52H664.03V445.3Z'], public: true },
      { id: 'mh-sec-53', label: 'Sector 53', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M718.84 445.3H666.02V524.02H718.84V510.57V496.12L709.37 485.15L702.39 475.19L709.37 460.74L718.84 445.3Z'], public: true },
      { id: 'mh-sec-66-a', label: 'Sector 66-A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1036.72 591.28L1000.84 596.26L990.38 677.98H1044.69L1090.03 671.5V584.31L1036.72 591.28Z'], public: true },
      { id: 'mh-sec-66-b', label: 'Sector 66-B', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1166.76 577.83L1089.03 588.29V672L1171.25 663.53L1166.76 577.83Z'], public: true },
      { id: 'mh-sec-82', label: 'Sector 82', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1046.68 678.47H992.37L984.4 740.26H1084.05L1088.04 673.49L1046.68 678.47Z'], public: true },
      { id: 'mh-sec-101', label: 'Sector 101', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1084.55 812H979.92L972.44 845.88L957.99 884.25L1060.14 904.18L1079.07 841.9L1084.55 812Z'], public: true },
      { id: 'mh-sec-101-a', label: 'Sector 101-A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1152.81 812.5H1083.06L1076.08 846.88L1060.14 904.68L1076.08 909.16L1131.39 913.15L1152.81 812.5Z'], public: true },
      { id: 'mh-sec-83-a', label: 'Sector 83-A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1166.26 743.74H1084.55V810.01H1154.31L1166.26 743.74Z'], public: true },
      { id: 'mh-sec-83', label: 'Sector 83', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1084.55 742.25H984.4L978.42 809.01H1084.55V742.25Z'], public: true },
      { id: 'mh-sec-82a', label: 'Sector 82A', sub: 'Sector · Mohali', type: 'sector', group: 'B', paths: ['M1169.25 666.02L1088.04 674.49L1084.55 741.75H1124.41H1165.27L1169.25 705.88V666.02Z'], public: true },
    ],
    labels: [],
    selectedPlots: [],
    selectedLandmarks: [],
    pins: []
  };

  /* ============================================================
     Chandigarh masterplan highlights.
     Geometry source: chandigarh-overlays.svg (viewBox 0 0 654 473), projected
     into original-map pixel space (1253x984) with p = 1.902*u + (5,80) —
     registration score 1.00. Only the named zones from the SVG are public;
     the unnamed sector polygons stay in the source SVG until they get real
     sector numbers. Road names are placeholders ("Road N").
     ============================================================ */
  const chandigarhMasterplan = {
    viewBox: '0 0 1253 984',
    modes: ['original'],
    source: {
      originalMapAsset: '/normal%20maps/chandigarh%20masterplan.jpg',
      overlaySvg: '/public/plotmap-assets/chandigarh-overlays.svg',
      annotatedReference: '/public/plotmap-assets/chandigarh-annotated-reference.png'
    },
    groups: {
      A: { label: 'Connectivity', color: '#1E5FA8' },
      C: { label: 'Zones', color: '#157A56' }
    },
    roads: [
      { id: 'chd-road-1', label: 'Road 1', d: 'M279.02 363.4L264.76 427.12L270.46 480.37L279.02 582.13L264.76 631.58L270.46 675.33', group: 'A', public: true },
      { id: 'chd-road-2', label: 'Road 2', d: 'M96.43 349.13L150.64 420.46L171.56 446.14L220.06 556.45L234.33 575.47L240.98 582.13H249.54L280.93 575.47H310.41H376.03L434.04 582.13L505.36 588.79H590L670.84 595.44H710.78H779.25L806.83 588.79L844.87 582.13L926.65 576.42L980.86 570.72L1008.44 576.42L1068.35 602.1L1092.13 610.66L1138.73 622.07L1206.25 629.68L1242.39 639.19', group: 'A', public: true },
      { id: 'chd-road-3', label: 'Road 3', d: 'M41.27 350.08H84.07L117.35 341.53L158.25 335.82L199.14 327.26L210.55 319.65H237.18L253.35 327.26L262.86 335.82L269.51 341.53V360.55L288.53 368.15H317.06H373.17H433.09L454.96 373.86L588.1 378.61H683.2H754.52L840.11 373.86L886.71 368.15L911.44 355.79L939.97 337.72L954.23 326.31L980.86 316.8L1009.39 304.44L1032.22 284.47L1036.97 266.4V242.62V210.29L1044.58 184.61L1080.72 133.26', group: 'A', public: true },
      { id: 'chd-road-4', label: 'Road 4', d: 'M584.29 235.96V270.2L580.49 377.66L578.59 488.93L572.88 654.4L570.98 811.32L569.08 909.27V934', group: 'A', public: true },
      { id: 'chd-road-5', label: 'Road 5', d: 'M639.45 921.64V908.32L646.11 889.3V875.99L639.45 857.92V798.01L640.4 765.67V701.95L639.45 697.2L638.5 687.69V681.98L639.45 593.54L641.35 588.79L642.31 552.65L645.16 499.39L646.11 469.91L647.06 416.65L648.96 374.81L649.91 308.24L650.86 266.4V235.96', group: 'A', public: true },
      { id: 'chd-road-6', label: 'Road 6', d: 'M716.48 273.05L711.73 379.57V492.73L704.12 592.59V763.77V905.47', group: 'A', public: true },
      { id: 'chd-road-7', label: 'Road 7', d: 'M748.82 265.45L759.28 279.71L779.25 293.98V307.29V372.91L774.49 487.03V596.39V700.05L767.84 909.27', group: 'A', public: true },
      { id: 'chd-road-8', label: 'Road 8', d: 'M843.92 312.04L848.67 371.01L843.92 493.69L839.16 695.3L834.41 846.51', group: 'A', public: true },
      { id: 'chd-road-9', label: 'Road 9', d: 'M512.02 211.24L516.77 236.92L512.02 394.78L503.46 589.74L498.7 799.91L493.95 822.73L481.59 839.85V860.77L493.95 872.18C492.36 879.16 490.15 894.06 493.95 897.86C497.75 901.66 495.53 914.66 493.95 920.68', group: 'A', public: true },
      { id: 'chd-road-10', label: 'Road 10', d: 'M446.4 233.11V270.2L440.69 374.81V459.45V483.22L426.43 516.51V532.68L435.94 585.93V696.25L431.18 715.27L415.02 739.99L406.46 758.06V787.54V817.98L415.02 839.85V907.37', group: 'A', public: true },
      { id: 'chd-road-11', label: 'Road 11', d: 'M392.19 230.26L377.93 370.06L373.17 377.66V480.37V526.02V579.28L368.42 729.53L363.66 816.07V907.37', group: 'A', public: true },
      { id: 'chd-road-12', label: 'Road 12', d: 'M382.68 225.5L395.05 233.11H651.82', group: 'A', public: true },
      { id: 'chd-road-13', label: 'Road 13', d: 'M392.19 265.45L718.39 274H739.31L749.77 265.45', group: 'A', public: true },
      { id: 'chd-road-14', label: 'Road 14', d: 'M265.71 471.81L316.11 476.57H383.63L446.4 483.22L508.21 488.93H575.74H615.68H646.11H710.78C731.7 487.03 774.49 483.22 778.3 483.22C782.1 483.22 823.63 483.22 843.92 483.22', group: 'A', public: true },
      { id: 'chd-road-15', label: 'Road 15', d: 'M179.17 628.73L232.42 672.47L308.5 682.93L434.99 691.49L573.83 699.1H676.54H809.68H875.3', group: 'A', public: true },
      { id: 'chd-road-16', label: 'Road 16', d: 'M5.13 797.05L51.73 790.4L92.63 784.69H123.06H150.64H169.66L187.73 780.89H209.6L235.28 776.13H255.25L299.95 784.69L336.08 790.4L374.12 797.05H406.46H445.45L603.31 801.81H706.97H767.84H833.46', group: 'A', public: true },
      { id: 'chd-road-17', label: 'Road 17', d: 'M240.98 673.42V744.75L238.13 779.94L235.28 915.93V934.95L219.11 977.74', group: 'A', public: true },
      { id: 'chd-road-18', label: 'Road 18', d: 'M233.38 940.66L357.96 906.42H835.36', group: 'A', public: true },
      { id: 'chd-road-19', label: 'Road 19', d: 'M308.5 474.67L303.75 573.57V680.08V785.64L299.95 921.64', group: 'A', public: true },
      { id: 'chd-road-20', label: 'Road 20', d: 'M1057.89 117.09L968.5 139.91L928.56 148.47L901.93 181.76L886.71 219.8L895.27 253.08L917.14 292.07L1067.4 480.37L1086.42 498.44L1170.11 504.15L1197.69 498.44L1248.09 491.78', group: 'A', public: true },
    ],
    shapes: [
      { id: 'chd-industrail-area', label: 'Industrial Area', sub: 'Zone · Chandigarh', type: 'sector', group: 'C', paths: ['M871.5 697.2H842.02V580.23L851.53 371.01H884.81L908.59 358.64L937.12 412.85L908.59 423.31L919.05 449.94L912.39 447.09L902.88 449.94L908.59 462.3L919.05 480.37L931.41 495.59L937.12 516.51L945.67 510.8L956.14 522.22L969.45 533.63L984.67 548.84L989.42 574.52H931.41V585.93L919.05 617.32L897.17 649.65L871.5 697.2Z'], public: true },
      { id: 'chd-manimajra', label: 'Manimajra', sub: 'Zone · Chandigarh', type: 'sector', group: 'C', paths: ['M978.96 302.53L947.58 318.7L923.8 288.27L896.22 249.28V228.36L891.47 215.99L899.08 201.73L904.78 186.51L915.24 174.15L923.8 160.84L932.36 152.28L975.16 141.82L978.96 156.08L988.47 148.47L991.32 152.28L988.47 160.84L991.32 166.54H1004.64L1009.39 160.84V152.28L1015.1 141.82H1019.85L1025.56 152.28L1019.85 160.84L1025.56 166.54H1042.68L1048.38 174.15L1042.68 179.86L1038.87 195.07L1033.17 211.24H1028.41L1025.56 215.99L1009.39 219.8L1015.1 228.36L1019.85 237.87L1015.1 249.28L1019.85 259.74L1009.39 273.05L991.32 293.98L978.96 302.53Z'], public: true },
    ],
    labels: [],
    selectedPlots: [],
    selectedLandmarks: [],
    pins: []
  };

  /* ============================================================
     Aerocity / Aerotropolis masterplan highlights.
     Geometry source: aerotropolis-overlays.svg (hand-mapped, viewBox 0 0 4599 3069).
     The registry original (aerocity masterplan.jpg, 1535x1024) is the same image
     at exactly 1/3 scale, so the SVG space maps 1:1 onto the map (no transform).
     Names come from the SVG ids and match the tricity dataset naming.
     ============================================================ */
  const aerotropolisMasterplan = {
    viewBox: '0 0 4599 3069',
    modes: ['original'],
    source: {
      originalMapAsset: '/normal%20maps/aerocity%20masterplan.jpg',
      overlaySvg: '/public/plotmap-assets/aerotropolis-overlays.svg',
      annotatedReference: '/public/plotmap-assets/aerotropolis-annotated-reference.png'
    },
    groups: {
      A: { label: 'Connectivity', color: '#1E5FA8' },
      B: { label: 'Sectors & Blocks', color: '#A87F1F' },
      C: { label: 'Commercial & Civic', color: '#157A56' },
      D: { label: 'Upcoming Blocks', color: '#B06A2C' }
    },
    roads: [
      { id: 'aero-road-airport-road', label: 'Airport Road', d: 'M2850 805.5V929L2957 1091.5L2973 1254.5V1421.5L2957 1612.5L2926.5 1834.5L2865.5 2126.5L2768.5 2574.5L2724 2753.5', group: 'A', public: true },
      { id: 'aero-road-pr-11-road', label: 'PR-11 Road', d: 'M1287 1606.5H2153H2755.5L3083 1619L3343 1606.5L3582.5 1589.5L3800.5 1557L3897.5 1535.5L4077.5 1457.5', group: 'A', public: true },
      { id: 'aero-road-pr-8-road', label: 'PR-8 Road', d: 'M1291 1796L1457.5 1823.5H2045H2701L2929.5 1811L3367.5 1794L3728.5 1762L4081 1700', group: 'A', public: true },
      { id: 'aero-road-mohali-sirhind-road', label: 'Mohali–Sirhind Road', d: 'M47.5 2093L327.5 1892L464 1870.5L752.5 1952L1186.5 2093L1462 2172L1970.5 2334.5H2049.5L2226.5 2242.5L2376 2105.5L2459.5 1935L2476.5 1770.5L2502 1505.5L2532 1155L2502 1080.5L2453 999L2425.5 911.5V599.5', group: 'A', public: true },
      { id: 'aero-road-bharatmala-zirakpur-banur-corridor', label: 'Zirakpur–Banur Corridor', d: 'M56 1635.5H478L551 1668.5L1527.5 2007.5H1627.5L1704 2054L1753.5 2084L2275 2180L2750 2349.5L3079 2462.5L3617 2582L3836.5 2618.5L3976 2672L4072.5 2758', group: 'A', public: true },
      { id: 'aero-road-pr-7-road', label: 'PR-7 Road', d: 'M350.5 701.5L376 846.5L440.5 933.5L643.5 1107.5L827 1265.5L866 1323.5L994.5 1400.5H1139.5L1271.5 1375L1510 1400.5H1764.5L1890.5 1375H2029L2196.5 1400.5H2496H2673L2866.5 1375L3060 1358.5L3362.5 1307L3594.5 1156L3794.5 1017L3900.5 701.5L3936 601.5V460', group: 'A', public: true },
      { id: 'aero-road-pr-12-road', label: 'PR-12 Road', d: 'M2425.5 2030.5L2767.5 2120.5H3157L3489 2095.5L3783.5 2048L4076.5 2005', group: 'A', public: true },
      { id: 'aero-road-mohali-railway-station-road', label: 'Railway Station Road', d: 'M1277.5 1161.5H2174.5H2421H2659.5L2699.5 1125H2760.5L3229 1080.5L3564.5 1048.5', group: 'A', public: true },
      { id: 'aero-road-pr-5-road', label: 'PR-5 Road', d: 'M63.5 1166L134 1119L219 1075L597.5 828.5L802.5 714.5H1260H1374.5H1498L1588.5 735H1894H2169.5H2295.5L2416 714.5M390.5 1350.5L479.5 1196L637 1119L896.5 946L933 926.5L1260 946H1894H2416', group: 'A', public: true },
    ],
    shapes: [
      { id: 'aero-sector-aerocity-sector-66a', label: 'Sector 66A', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2530.5 1155L2535.79 1154.54M2535.79 1154.54L2662 1143.5L2699.5 1127.5L2740 1143.5L2761.5 1135.5L2767.5 1270.5L2761.5 1330.5L2699.5 1343L2690 1364.5L2699.5 1378.5L2690 1390.5H2516.5L2530.5 1288.5L2535.79 1154.54Z'], public: true },
      { id: 'aero-sector-aerocity-sector-66b', label: 'Sector 66B', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2950 1118.5L2761.5 1138L2769.5 1330.5L2960 1301L2950 1118.5Z'], public: true },
      { id: 'aero-sector-aerocity-sector-82-c', label: 'Sector 82 C', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2690 1409L2514.5 1400L2494 1601.5H2749V1456.5L2702.5 1470L2690 1463.5L2702.5 1444H2715L2690 1409Z'], public: true },
      { id: 'aero-sector-aerocity-sector-82a', label: 'Sector 82A', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2861.5 1435L2766 1455.5L2757 1604H2950L2958 1435H2861.5Z'], public: true },
      { id: 'aero-sector-aerocity-sector-83a', label: 'Sector 83A', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2950 1621H2757L2749 1804.5H2927L2950 1621Z'], public: true },
      { id: 'aero-sector-aerocity-sector-82', label: 'Sector 82', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2740 1804.5L2750.5 1618.5H2501L2481.5 1811.5L2740 1804.5Z'], public: true },
      { id: 'aero-sector-aerocity-sector-101', label: 'Sector 101', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2741.5 1820.5H2479.5L2469 1917L2428.5 2021L2682.5 2083.5L2735.5 1894L2741.5 1820.5Z'], public: true },
      { id: 'aero-sector-aerocity-sector-102-alpha', label: 'Sector 102 Alpha', sub: 'Aerocity sector', type: 'sector', group: 'B', paths: ['M2614.5 2295.5L2687 2100.5L2739 2114L2802.5 2128L2816 2155L2842 2170L2816 2309H2802.5L2764 2301.5L2751.5 2337.5L2614.5 2295.5Z'], public: true },
      { id: 'aero-block-j', label: 'Block J', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3506 1786.5L3365.5 1795.5L3406 2055.5H3454V2035.5H3483L3506 1951.5L3543.5 1935.5L3578 1974.5L3636 1986H3672V1974.5L3659 1966L3649 1935.5L3611.5 1867.5L3623 1828.5L3649 1815.5L3659 1805.5L3636 1773.5L3506 1786.5Z'], public: true },
      { id: 'aero-block-i', label: 'Block I', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3338 1651L3360.5 1796.5H3437L3515.5 1790.5L3571 1781.5L3634.5 1768L3620 1743L3607 1714L3592.5 1682.5L3585.5 1651V1625.5L3599.5 1606V1580.5L3338 1606V1651Z'], public: true },
      { id: 'aero-block-h', label: 'Block H', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3364 1357L3308.5 1374.5L3317.5 1429.5V1483.5L3341.5 1533.5V1604.5L3598 1587V1558L3608 1545.5V1511V1473L3632.5 1457.5L3622 1442L3530.5 1457.5V1307L3499 1275.5L3364 1357Z'], public: true },
      { id: 'aero-block-e', label: 'Block E', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3364 1795L3080 1812V2101.5L3104.5 2091L3125 2101.5L3146 2082.5L3168.5 2091L3213.5 2068.5L3232.5 2051L3270.5 2068.5H3321H3372.5L3400.5 2051L3364 1795Z'], public: true },
      { id: 'aero-block-g', label: 'Block G', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3303.5 1371L3075 1417.5L3085.5 1445V1606H3343.5V1537L3319 1485V1428L3303.5 1371Z'], public: true },
      { id: 'aero-block-f', label: 'Block F', sub: 'Aerotropolis block · upcoming side', type: 'block', group: 'D', paths: ['M3336.5 1604.5L3078.5 1615V1803.5L3362.5 1791.5L3336.5 1654.5V1604.5Z'], public: true },
      { id: 'aero-block-d', label: 'Block D', sub: 'Aerotropolis block', type: 'block', group: 'B', paths: ['M3080 1815.5V2092.5L3038.5 2075.5V2092.5V2103H3011V2122H2969.5L2941.5 2132.5L2870.5 2155L2941.5 1815.5'], public: true },
      { id: 'aero-block-c', label: 'Block C', sub: 'Aerotropolis block', type: 'block', group: 'B', paths: ['M2940 1809L2964 1616.5H3076.5V1809H2940Z'], public: true },
      { id: 'aero-block-a', label: 'Block A', sub: 'Aerotropolis block', type: 'block', group: 'B', paths: ['M3032 1302.5L3015 1112L3083 1098.5L3213 1088H3255V1122H3322.5L3333 1188L3425.5 1161L3442.5 1176L3314 1245.5L3130 1292.5V1210L3083 1225L3071 1245.5L3098 1302.5H3032Z'], public: true },
      { id: 'aero-block-b', label: 'Block B', sub: 'Aerotropolis block', type: 'block', group: 'B', paths: ['M3025.5 1429.5L3077 1418L3088.5 1446.5L3077 1607.5H2962.5L2972 1429.5H3025.5Z'], public: true },
      { id: 'aero-zone-commercial-zone-c', label: 'Commercial Zone C3', sub: 'Commercial zone', type: 'commercial', group: 'C', paths: ['M2698.5 1361.5L2704.5 1346.5L2739.5 1340L2771.5 1334C2788.83 1330.5 2824.2 1323.5 2827 1323.5C2829.8 1323.5 2873.83 1320.5 2895.5 1319L2957 1309.5V1361.5L2903 1367H2849L2832 1374L2752 1386.5L2694 1394V1386.5L2709 1382.5L2704.5 1367L2698.5 1361.5Z'], public: true },
      { id: 'aero-zone-commercial-zone-c-2', label: 'Commercial Zone C4', sub: 'Commercial zone', type: 'commercial', group: 'C', paths: ['M2702 1407L2751.5 1400.5L2859 1380H2957.5L2962 1427L2855 1433L2766.5 1451.5L2722 1460.5L2728 1439L2698 1400.5'], public: true },
      { id: 'aero-zone-commercial-zone-b', label: 'Commercial Zone C2', sub: 'Commercial zone', type: 'commercial', group: 'C', paths: ['M2973.5 1194L2957 1111.5L3014 1100.5L3034.5 1311L3085 1299.5L3131 1291.5L3208 1275.5L3313.5 1252.5L3443.5 1175.5L3423.5 1160L3443.5 1149.5V1100.5H3480L3494.5 1092L3517.5 1100.5L3507.5 1055.5H3517.5V999.5L3494.5 980.5V956L3517.5 964.5V947H3540.5L3601.5 1149.5L3472.5 1220L3339 1299.5L3221.5 1327.5L3067.5 1362.5H2982V1311L2973.5 1194Z'], public: true },
      { id: 'aero-zone-commercial-zone-a', label: 'Commercial Zone C1', sub: 'Commercial zone', type: 'commercial', group: 'C', paths: ['M3012 1375.5H2969.5L2977 1429L3022.5 1435L3069.5 1423L3117 1412.5L3313 1375.5L3402.5 1345L3506 1275.5L3542.5 1305.5V1459.5L3623 1435L3635.5 1449L3658 1435L3635.5 1290.5L3612 1204.5L3594.5 1151.5L3356.5 1305.5L3299.5 1321L3180.5 1345L3101 1365L3012 1375.5Z'], public: true },
    ],
    pins: [
      { id: 'aero-pin-mohali-city-centre', label: 'City Centre', x: 68.54, y: 44.99, group: 'C', public: true },
      { id: 'aero-pin-jubilee-square', label: 'Jubilee Square', x: 68.13, y: 42.86, group: 'C', public: true },
      { id: 'aero-pin-cp67-mall', label: 'CP67 Mall', x: 47.64, y: 44.89, group: 'C', public: true },
      { id: 'aero-pin-iiser-mohali', label: 'IISER Mohali', x: 53.47, y: 46.45, group: 'C', public: true },
      { id: 'aero-pin-nabi-mohali', label: 'NABI', x: 50.49, y: 51.23, group: 'C', public: true },
      { id: 'aero-pin-biotech-park', label: 'Biotech Park', x: 53.66, y: 49.85, group: 'C', public: true },
      { id: 'aero-pin-isb-mohali', label: 'ISB Mohali', x: 51.16, y: 46.50, group: 'C', public: true },
      { id: 'aero-pin-institute-mohali', label: 'Medicity', x: 53.24, y: 48.13, group: 'C', public: true },
      { id: 'aero-pin-amity-university-punjab', label: 'Amity University', x: 61.81, y: 50.99, group: 'C', public: true },
      { id: 'aero-pin-manav-rachna-international-school', label: 'Manav Rachna School', x: 61.31, y: 48.60, group: 'C', public: true },
      { id: 'aero-pin-plaksha-university', label: 'Plaksha University', x: 62.33, y: 59.69, group: 'C', public: true },
      { id: 'aero-pin-hdfc-it-city', label: 'HDFC IT City', x: 62.24, y: 58.42, group: 'C', public: true },
      { id: 'aero-pin-infosys-mohali', label: 'Infosys Mohali', x: 62.43, y: 55.69, group: 'C', public: true },
    ],
    labels: [],
    selectedPlots: [],
    selectedLandmarks: []
  };

  /* ============================================================
     Zirakpur masterplan highlights.
     Geometry sources: zirakpur-roads-overlays.svg (viewBox 0 0 1447 1087,
     p = 0.987218*u + (11,8)) and zirakpur-blocks-overlays.svg (group-cropped
     export, viewBox 0 0 599 799, p = 0.995*v + (163,164)), both projected into
     the new original-map pixel space (1448x1086); registration score 1.00 each.
     Road/block names are placeholders until real names are supplied.
     ============================================================ */
  const zirakpurMasterplan = {
    viewBox: '0 0 1448 1086',
    modes: ['original'],
    source: {
      originalMapAsset: '/normal%20maps/zirakpur%20masterplan.png',
      overlaySvg: '/public/plotmap-assets/zirakpur-roads-overlays.svg',
      blocksSvg: '/public/plotmap-assets/zirakpur-blocks-overlays.svg',
      annotatedReference: '/public/plotmap-assets/zirakpur-annotated-reference.png'
    },
    groups: {
      A: { label: 'Connectivity', color: '#1E5FA8' },
      B: { label: 'Blocks', color: '#A87F1F' }
    },
    roads: [
      { id: 'zk-road-1', label: 'Road 1', d: 'M661.59 238.68L694.66 299.39L714.4 414.41L721.31 485.48L710.45 525.96', group: 'A', public: true },
      { id: 'zk-road-2', label: 'Road 2', d: 'M456.25 810.28C459.41 810.67 504.29 821.63 526.34 827.06L569.28 851.25L621.11 783.62L642.83 743.64L707 691.32L739.58 638.5', group: 'A', public: true },
      { id: 'zk-road-3', label: 'Road 3', d: 'M11.01 515.1C18.51 515.1 111.21 543.4 156.63 557.55L391.09 589.14L737.11 797.94L758.33 808.31H793.87L1078.69 789.55H1087.08L1146.8 829.53L1176.42 847.3L1183.33 857.67V870.5L1247.01 1014.14L1274.16 1079.3', group: 'A', public: true },
      { id: 'zk-road-4', label: 'Road 4', d: 'M12.98 296.43L95.42 407.99L120.1 420.82H155.64L293.36 393.67L524.36 420.82L545.1 432.67L606.3 486.97L641.84 510.66L932.58 629.13L1005.63 731.8L1179.88 998.84L1229.24 1079.3', group: 'A', public: true },
      { id: 'zk-road-5', label: 'Road 5', d: 'M422.68 611.85V723.4L492.28 914.43L538.19 1068.44', group: 'A', public: true },
      { id: 'zk-road-6', label: 'Road 6', d: 'M366.41 9.15L436.01 140.95L455.75 227.82L479.45 364.55L392.08 585.69', group: 'A', public: true },
      { id: 'zk-road-7', label: 'Road 7', d: 'M483.89 367.02L535.72 407L634.93 498.81L711.44 526.95L766.73 541.26L839.78 533.86H888.15L904.44 541.26L984.41 573.84L1044.63 595.07L1085.6 631.59C1087.9 636.86 1094.88 650.15 1104.35 661.21C1113.83 672.27 1125.75 694.78 1130.52 704.65L1159.64 730.81L1204.56 748.08', group: 'A', public: true },
      { id: 'zk-road-8', label: 'Road 8', d: 'M1029.33 1075.35C1045.94 1051.32 1075.72 997.06 1061.9 972.18C1044.63 941.09 1058.45 888.27 1072.76 894.19L1165.56 823.61L1210.48 723.4C1223.48 710.57 1250.66 685.59 1255.4 688.36C1260.14 691.12 1300.48 680.63 1320.06 675.03L1437.54 602.47', group: 'A', public: true },
      { id: 'zk-road-9', label: 'Road 9', d: 'M617.16 124.66L790.91 284.09L803.25 302.36L810.16 323.09L834.84 345.3L868.41 383.31L876.8 410.95L892.1 437.11L918.76 462.29L976.02 487.46L1024.88 506.22L1046.6 522.51L1128.05 588.16L1151.74 598.52L1177.9 601.98L1200.61 598.52L1213.94 601.98L1224.3 609.87C1228.08 614.65 1236.15 624.29 1238.12 624.68C1240.59 625.18 1249.97 631.1 1252.93 632.09C1255.89 633.07 1263.3 634.06 1266.26 634.55L1315.12 639.98L1329.44 646.4L1336.35 657.26L1386.7 739.2L1406.94 762.89L1426.19 780.17L1437.54 786.09', group: 'A', public: true },
      { id: 'zk-road-10', label: 'Road 10', d: 'M807.7 332.96L785.48 432.67L763.27 559.53L754.39 661.21L757.35 700.2L745.5 745.62L731.68 792.02L677.38 976.13L666.03 995.88L539.17 1072.39', group: 'A', public: true },
      { id: 'zk-road-11', label: 'Road 11', d: 'M564.84 434.15L682.81 416.38L778.08 407.99L860.51 372.45L925.17 330.99L941.46 315.19L947.88 247.57V188.33', group: 'A', public: true },
      { id: 'zk-road-12', label: 'Road 12', d: 'M582.12 169.08L606.3 233.74L618.64 256.45L640.36 357.15L651.72 370.47L662.08 375.41L680.84 409.47L674.42 461.3L595.94 634.55L569.28 645.41L560.89 655.29L553.49 661.21L560.89 683.92L569.28 689.35L534.24 781.16L522.88 812.75V821.14V828.54H515.97C515.97 839.24 515.97 861.42 515.97 864.58C515.97 868.53 525.85 873.96 515.97 880.37C508.08 885.51 502.15 891.4 500.18 893.7L494.25 898.64', group: 'A', public: true },
      { id: 'zk-road-13', label: 'Road 13', d: 'M456.25 626.66L481.91 591.61H540.16C556.61 586.02 590.8 574.53 595.94 573.35C601.07 572.16 626.71 566.6 638.88 563.97C650.73 570.06 675.11 582.73 677.88 584.7C681.33 587.17 689.23 590.62 694.66 597.53C699 603.06 711.61 613 717.37 617.28L728.22 626.66L746.49 639H754.88', group: 'A', public: true },
    ],
    shapes: [
      { id: 'zk-block-1', label: 'Block 1', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M591.48 337.63L633.27 334.64V349.07L647.2 364.99L619.34 385.39L601.93 388.37L591.48 337.63Z'], public: true },
      { id: 'zk-block-2', label: 'Block 2', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M322.33 728.66L348.2 765.48H343.23L380.04 818.71L421.34 849.56L458.15 836.12L416.86 720.7L410.39 629.66L329.3 697.32V728.66H322.33Z'], public: true },
      { id: 'zk-block-3', label: 'Block 3', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M560.64 693.84L419.35 606.78V611.75V722.69L444.72 806.77L504.42 822.69L519.34 817.22V806.77L560.64 693.84Z'], public: true },
      { id: 'zk-block-4', label: 'Block 4', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M709.89 845.08L618.35 780.4L640.24 741.1L700.43 691.35L734.26 639.11H756.15V699.31L709.89 845.08Z'], public: true },
      { id: 'zk-block-5', label: 'Block 5', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M311.39 779.91L345.72 867.47V873.93L416.86 846.07L379.05 817.72L345.72 764.98L311.39 779.91Z'], public: true },
      { id: 'zk-block-6', label: 'Block 6', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M575.56 394.34L534.77 400.81L561.63 428.17L582.03 423.7L575.56 394.34Z'], public: true },
      { id: 'zk-block-7', label: 'Block 7', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M620.34 386.38L579.04 394.84L583.02 428.67L627.3 417.73V413.75L620.34 386.38Z'], public: true },
      { id: 'zk-block-8', label: 'Block 8', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M657.65 357.53L620.34 387.38L626.8 417.73L668.59 409.27V398.32L671.58 387.38L668.59 371.96L657.65 357.53Z'], public: true },
      { id: 'zk-block-9', label: 'Block 9', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M548.7 387.88C538.08 388.04 515.36 388.27 509.39 387.88L530.79 401.81L601.43 387.88L591.98 339.12L632.28 331.66L609.39 245.09L656.65 234.65L664.61 217.73L660.14 213.25L656.65 204.8L660.14 195.34H647.2L620.83 200.32L596.95 166.49H570.09L548.7 179.42L558.65 187.88V195.34C559.64 197.17 562.43 201.61 565.61 204.8C568.79 207.98 566.94 211.76 565.61 213.25V224.2L561.63 234.65L570.09 239.62L578.05 245.09V252.06V271.96V288.38L574.07 308.27H570.09L574.07 339.12L558.65 344.1L561.63 359.52L544.72 362.5L548.7 387.88Z'], public: true },
      { id: 'zk-block-10', label: 'Block 10', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M633.27 497.82L559.64 431.66L633.27 418.72L709.89 409.27L717.35 476.93L703.92 520.21L633.27 497.82Z'], public: true },
      { id: 'zk-block-11', label: 'Block 11', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M691.98 594.84L593.97 630.66L623.82 562H637.25L691.98 594.84Z'], public: true },
      { id: 'zk-block-12', label: 'Block 12', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M676.55 704.29L571.08 641.1L690.98 595.83L734.26 635.13L705.91 686.87L676.55 704.29Z'], public: true },
      { id: 'zk-block-13', label: 'Block 13', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M707.9 407.78L679.04 414.24L670.09 457.53L646.7 501.31L707.9 518.22L718.84 479.42L707.9 407.78Z'], public: true },
      { id: 'zk-block-14', label: 'Block 14', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M320.84 878.91L456.16 833.64L414.87 724.68V632.15H406.41L328.8 695.83V724.68L304.92 734.14L287.51 724.68L255.17 770.95L320.84 822.19L296.46 857.02L320.84 878.91Z'], public: true },
      { id: 'zk-block-15', label: 'Block 15', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M473.57 338.62L476.06 358.52L384.02 579.41L374.57 576.43L226.32 558.52L231.29 471.46L205.92 452.05V444.59L201.44 436.63L209.9 433.15V405.79L205.92 371.46H215.87C217.86 371.46 224.99 368.8 228.31 367.48C232.29 365.82 240.94 362.5 243.73 362.5H254.18H263.13V369.97L264.62 378.42C265.95 379.25 270.79 381.81 279.55 385.39C281.54 388.97 285.02 392.19 286.51 393.35L297.46 395.84L301.94 405.79L307.91 395.84L312.88 403.3L320.84 405.79V415.74H342.23H346.21V425.69H358.65C361.04 425.69 361.97 430.66 362.13 433.15L374.57 436.63L392.98 448.07C396.63 445.25 403.92 439.02 403.92 436.63C403.92 434.24 408.24 433.31 410.39 433.15V423.2C410.39 420.21 414.87 420.21 416.86 419.22C418.45 418.42 424.82 411.59 427.8 408.27C427.8 405.12 427.11 398.22 424.32 395.84C421.53 393.45 423.16 387.88 424.32 385.39L420.34 380.91V371.46V358.52L427.8 338.62L431.29 325.19L442.23 321.71L478.55 311.26L481.04 321.71L473.57 338.62Z'], public: true },
      { id: 'zk-block-16', label: 'Block 16', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M329.3 889.85L295.97 898.81L360.14 921.69L372.58 927.17H378.05H393.48C397.06 927.17 403.92 934.13 406.91 937.61L419.84 947.56L432.28 956.02H459.15L476.56 947.56L432.28 844.08L320.34 879.41L329.3 889.85Z'], public: true },
      { id: 'zk-block-17', label: 'Block 17', sub: 'Block · Zirakpur', type: 'sector', group: 'B', paths: ['M341.74 587.37L400.94 633.14L331.29 693.84L307.91 684.88L279.55 704.29V726.67L256.17 772.44L321.34 816.72L294.47 862.49L331.29 889.36L307.91 896.82L279.55 904.28L256.17 881.89V843.59L242.73 830.15L177.56 816.72L165.62 693.84L226.32 654.04V633.14V587.37L242.73 578.42L279.55 611.25L341.74 587.37Z'], public: true },
    ],
    labels: [],
    selectedPlots: [],
    selectedLandmarks: [],
    pins: []
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
    'masterplan-mohali-masterplan': mohaliMasterplan,
    'masterplan-chandigarh-masterplan': chandigarhMasterplan,
    'masterplan-aerocity-mohali-masterplan': aerotropolisMasterplan,
    'masterplan-zirakpur-masterplan': zirakpurMasterplan,
    'sector-sector-28-chandigarh': sector28Chandigarh
  });
})();
