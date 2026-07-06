const fs = require('fs'); 
const geo = JSON.parse(fs.readFileSync('app/plotmap/geo.json', 'utf8')); 
const svg = `<svg viewBox='2600 900 1100 600' xmlns='http://www.w3.org/2000/svg'>
  <path d='${geo.paths['ZONE-Commercial-Zone-A']}' fill='red'/>
  <path d='${geo.paths['ZONE-Commercial-Zone-B']}' fill='blue'/>
  <path d='${geo.paths['ZONE-Commercial-Zone-C']}' fill='green'/>
  <path d='${geo.paths['ZONE-Commercial-Zone-C_2']}' fill='orange'/>
</svg>`; 
fs.writeFileSync('temp.svg', svg);
