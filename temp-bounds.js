const fs = require('fs');
const geo = JSON.parse(fs.readFileSync('app/plotmap/geo.json', 'utf8'));

function getBounds(d) {
  const pts = d.match(/[ML][^MLZ]+/g).map(s => {
    const coords = s.substring(1).trim().split(/[ ,]+/).map(Number);
    return {x: coords[0], y: coords[1]};
  });
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  pts.forEach(p => {
    if(p.x < minX) minX = p.x;
    if(p.x > maxX) maxX = p.x;
    if(p.y < minY) minY = p.y;
    if(p.y > maxY) maxY = p.y;
  });
  return {minX, minY, maxX, maxY, w: maxX-minX, h: maxY-minY};
}

console.log("A bounds:", getBounds(geo.paths['ZONE-Commercial-Zone-A']));
console.log("B bounds:", getBounds(geo.paths['ZONE-Commercial-Zone-B']));
console.log("C bounds:", getBounds(geo.paths['ZONE-Commercial-Zone-C']));
