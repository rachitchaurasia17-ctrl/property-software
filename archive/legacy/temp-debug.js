const fs = require('fs');
const geo = JSON.parse(fs.readFileSync('app/plotmap/geo.json', 'utf8'));

const svg = `<svg viewBox="2600 1000 1200 800" xmlns="http://www.w3.org/2000/svg">
  <path d="${geo.paths['ZONE-Commercial-Zone-A']}" fill="rgba(255,0,0,0.3)" stroke="red"/>
  <path d="${geo.paths['ZONE-Commercial-Zone-B']}" fill="rgba(0,255,0,0.3)" stroke="green"/>
  <path d="${geo.paths['ZONE-Commercial-Zone-C']}" fill="rgba(0,0,255,0.3)" stroke="blue"/>
  <path d="${geo.paths['ZONE-Commercial-Zone-C_2']}" fill="rgba(255,165,0,0.3)" stroke="orange"/>
  
  <text x="3550" y="1340" fill="red">A (C1)</text>
  <text x="3150" y="1290" fill="green">B (C2)</text>
  <text x="2820" y="1349" fill="blue">C (C3)</text>
  <text x="2820" y="1413" fill="orange">C2 (C4)</text>
</svg>`;

fs.writeFileSync('temp-debug.svg', svg);
