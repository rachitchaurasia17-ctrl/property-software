const fs = require('fs');
const geo = JSON.parse(fs.readFileSync('app/plotmap/geo.json', 'utf8'));
function pointInPolygon(point, vs) {
    let x = point.x, y = point.y, inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y, xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}
function getSegments(d) {
  return d.match(/[ML][^MLZ]+/g).map(s => {
    const coords = s.substring(1).trim().split(/[ ,]+/).map(Number);
    return {x: coords[0], y: coords[1]};
  });
}
const ptsB = getSegments(geo.paths['ZONE-Commercial-Zone-B']);
let validPts = [];
for (let y = 1100; y <= 1180; y += 10) {
    let xs = [];
    for (let x = 2950; x <= 3100; x += 5) {
        if (pointInPolygon({x, y}, ptsB)) xs.push(x);
    }
    if (xs.length > 0) console.log(`Y=${y}: X from ${Math.min(...xs)} to ${Math.max(...xs)} (Center: ${(Math.min(...xs) + Math.max(...xs))/2})`);
}
