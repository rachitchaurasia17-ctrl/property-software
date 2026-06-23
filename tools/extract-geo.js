const fs = require('fs');
const path = require('path');

function extractGeo() {
  const svgPath = path.join(__dirname, '../public/plotmap-assets/aerotropolis-overlays.svg');
  const outPath = path.join(__dirname, '../app/plotmap/geo.json');
  
  const svgStr = fs.readFileSync(svgPath, 'utf8');
  
  // Find viewBox width/height if available
  const vbMatch = svgStr.match(/viewBox="([^"]+)"/);
  const viewBox = vbMatch ? vbMatch[1] : "0 0 4599 3069";
  
  const pathRegex = /<path[^>]+id="([^"]+)"[^>]+d="([^"]+)"/g;
  const paths = {};
  
  let match;
  while ((match = pathRegex.exec(svgStr)) !== null) {
    paths[match[1]] = match[2];
  }
  
  // also check if id is after d
  const pathRegexReverse = /<path[^>]+d="([^"]+)"[^>]+id="([^"]+)"/g;
  while ((match = pathRegexReverse.exec(svgStr)) !== null) {
    paths[match[2]] = match[1];
  }
  
  const geoObj = {
    viewBox: viewBox,
    paths: paths
  };
  
  fs.writeFileSync(outPath, JSON.stringify(geoObj, null, 2));
  console.log(`Extracted ${Object.keys(paths).length} paths into geo.json`);
}

extractGeo();
