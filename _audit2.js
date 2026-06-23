const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const DIRS = ['chandigarh', 'mohali', 'new chandigarh', 'panchulka'];

function jpegSize(buf){if(buf[0]!==0xFF||buf[1]!==0xD8)return null;let off=2;while(off<buf.length){if(buf[off]!==0xFF){off++;continue;}let m=buf[off+1];while(m===0xFF){off++;m=buf[off+1];}if(m>=0xC0&&m<=0xCF&&m!==0xC4&&m!==0xC8&&m!==0xCC){return{h:buf.readUInt16BE(off+5),w:buf.readUInt16BE(off+7)};}if(m===0xD9)break;if(off+4>buf.length)break;off+=2+buf.readUInt16BE(off+2);}return null;}
function pngSize(buf){const s=[0x89,0x50,0x4E,0x47];for(let i=0;i<4;i++)if(buf[i]!==s[i])return null;return{w:buf.readUInt32BE(16),h:buf.readUInt32BE(20)};}

function pdfInfo(buf){
  const s = buf.toString('latin1');
  // page count: count /Type /Page (not /Pages). Use regex with word boundary.
  const pageMatches = s.match(/\/Type\s*\/Page(?![s])/g);
  let pages = pageMatches ? pageMatches.length : 0;
  // MediaBox -> points; first one
  const mb = s.match(/\/MediaBox\s*\[\s*([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s*\]/);
  let wPt=0,hPt=0;
  if(mb){wPt=Math.abs(parseFloat(mb[3])-parseFloat(mb[1]));hPt=Math.abs(parseFloat(mb[4])-parseFloat(mb[2]));}
  // raster vs vector signal
  const hasImage = /\/Subtype\s*\/Image/.test(s);
  const hasFont = /\/Font|\/BaseFont/.test(s);
  const hasVectorOps = /\b(re|m|l|c|f|S|W)\b/.test(s); // weak; many pdfs have these
  // count image xobjects
  const imgCount = (s.match(/\/Subtype\s*\/Image/g)||[]).length;
  let kind = 'unknown';
  if(hasImage && !hasFont) kind='raster-in-pdf';
  else if(hasFont && imgCount<=1) kind='vector/text';
  else if(hasFont && hasImage) kind='mixed';
  return {pages, wPt, hPt, wIn:+(wPt/72).toFixed(2), hIn:+(hPt/72).toFixed(2), imgCount, hasFont, kind};
}

const rows=[];
for(const d of DIRS){const dir=path.join(ROOT,d);let files;try{files=fs.readdirSync(dir);}catch(e){continue;}
 for(const f of files){const fp=path.join(dir,f);let st;try{st=fs.statSync(fp);}catch(e){continue;}if(!st.isFile())continue;
  const buf=fs.readFileSync(fp);const ext=(path.extname(f).toLowerCase().replace('.','')||'NONE');
  let sniff='unknown';if(buf[0]===0xFF&&buf[1]===0xD8)sniff='jpg';else if(buf[0]===0x89&&buf[1]===0x50)sniff='png';else if(buf.slice(0,5).toString()==='%PDF-')sniff='pdf';
  const row={dir:d,file:f,ext,sniff,bytes:st.size,w:0,h:0,mp:0,pdf:null,readable:false};
  if(sniff==='jpg'){const dim=jpegSize(buf);if(dim){row.w=dim.w;row.h=dim.h;row.mp=+(((dim.w*dim.h)/1e6).toFixed(2));row.readable=true;}}
  else if(sniff==='png'){const dim=pngSize(buf);if(dim){row.w=dim.w;row.h=dim.h;row.mp=+(((dim.w*dim.h)/1e6).toFixed(2));row.readable=true;}}
  else if(sniff==='pdf'){row.pdf=pdfInfo(buf);row.readable=true;}
  rows.push(row);
 }}
fs.writeFileSync('_audit2.json',JSON.stringify(rows,null,2));

const cur=new Set(rows.map(r=>r.dir+'/'+r.file));
let prev=[];try{prev=require('./_audit_prev.json');}catch(e){}
const prevMap={};prev.forEach(r=>prevMap[r.dir+'/'+r.file]=r);
const prevSet=new Set(prev.map(r=>r.dir+'/'+r.file));

console.log('=== CURRENT ===');
console.log('TOTAL:',rows.length);
const byDir={};rows.forEach(r=>byDir[r.dir]=(byDir[r.dir]||0)+1);console.log('BY DIR:',JSON.stringify(byDir));
const byExt={};rows.forEach(r=>byExt[r.ext]=(byExt[r.ext]||0)+1);console.log('BY EXT:',JSON.stringify(byExt));

const imgs=rows.filter(r=>r.sniff==='jpg'||r.sniff==='png');
const mps=imgs.map(r=>r.mp).sort((a,b)=>a-b);function q(a,p){return a[Math.floor((a.length-1)*p)];}
console.log('IMG MP min/med/max:',mps[0],q(mps,0.5),mps[mps.length-1]);
const buckets={'<1MP':0,'1-2MP':0,'2-4MP':0,'4-8MP':0,'8-15MP':0,'>15MP':0};
imgs.forEach(r=>{const m=r.mp;if(m<1)buckets['<1MP']++;else if(m<2)buckets['1-2MP']++;else if(m<4)buckets['2-4MP']++;else if(m<8)buckets['4-8MP']++;else if(m<15)buckets['8-15MP']++;else buckets['>15MP']++;});
console.log('IMG RES BUCKETS:',JSON.stringify(buckets));

console.log('\n=== PDFs ('+rows.filter(r=>r.sniff==='pdf').length+') ===');
rows.filter(r=>r.sniff==='pdf').forEach(r=>console.log(`  ${r.file}  ${r.pdf.wIn}x${r.pdf.hIn}in  ${r.pdf.pages}pg  imgX:${r.pdf.imgCount}  ${r.pdf.kind}  ${(r.bytes/1024).toFixed(0)}KB`));

console.log('\n=== DELTA vs previous audit ('+prev.length+' files) ===');
const added=[...cur].filter(k=>!prevSet.has(k));
const removed=[...prevSet].filter(k=>!cur.has(k));
console.log('ADDED ('+added.length+'):');added.sort().forEach(k=>{const r=rows.find(x=>x.dir+'/'+x.file===k);const tag=r.sniff==='pdf'?(r.pdf.kind+' '+r.pdf.wIn+'x'+r.pdf.hIn+'in'):(r.w+'x'+r.h+' '+r.mp+'MP');console.log('  + '+k+'  ['+tag+']');});
console.log('REMOVED ('+removed.length+'):');removed.sort().forEach(k=>{const r=prevMap[k];console.log('  - '+k+'  ['+r.w+'x'+r.h+' '+r.mp+'MP]');});
// resolution improvements: same path present in both, mp increased
console.log('RESOLUTION IMPROVEMENTS (same filename, higher MP):');
let imp=0;
for(const r of rows){const p=prevMap[r.dir+'/'+r.file];if(p&&r.mp>p.mp*1.5){console.log(`  ↑ ${r.dir}/${r.file}: ${p.mp}MP -> ${r.mp}MP`);imp++;}}
if(!imp)console.log('  (none with identical path; region content was reorganized, not overwritten in place)');
