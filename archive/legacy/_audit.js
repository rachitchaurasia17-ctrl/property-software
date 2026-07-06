const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DIRS = ['chandigarh', 'mohali', 'new chandigarh', 'panchulka'];

function jpegSize(buf) {
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let off = 2;
  while (off < buf.length) {
    if (buf[off] !== 0xFF) { off++; continue; }
    let marker = buf[off + 1];
    while (marker === 0xFF) { off++; marker = buf[off + 1]; }
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      const h = buf.readUInt16BE(off + 5);
      const w = buf.readUInt16BE(off + 7);
      return { w, h };
    }
    if (marker === 0xD9) break;
    if (off + 4 > buf.length) break;
    const len = buf.readUInt16BE(off + 2);
    off += 2 + len;
  }
  return null;
}

function pngSize(buf) {
  const sig = [0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null;
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { w, h };
}

function eoiOk(buf, type) {
  if (type === 'jpg') return buf[buf.length-2] === 0xFF && buf[buf.length-1] === 0xD9;
  if (type === 'png') {
    const tail = buf.slice(buf.length-8);
    return tail[0]===0x49 && tail[1]===0x45 && tail[2]===0x4E && tail[3]===0x44;
  }
  return false;
}

const rows = [];
for (const d of DIRS) {
  const dir = path.join(ROOT, d);
  let files;
  try { files = fs.readdirSync(dir); } catch(e){ continue; }
  for (const f of files) {
    const fp = path.join(dir, f);
    let st;
    try { st = fs.statSync(fp); } catch(e){ continue; }
    if (!st.isFile()) continue;
    const buf = fs.readFileSync(fp);
    const ext = (path.extname(f).toLowerCase().replace('.','') || 'NONE');
    let sniff = 'unknown';
    if (buf[0]===0xFF && buf[1]===0xD8) sniff='jpg';
    else if (buf[0]===0x89 && buf[1]===0x50) sniff='png';
    let dim = null;
    if (sniff==='jpg') dim = jpegSize(buf);
    else if (sniff==='png') dim = pngSize(buf);
    rows.push({
      dir: d, file: f, ext, sniff, bytes: st.size,
      w: dim?dim.w:0, h: dim?dim.h:0,
      mp: dim?+(((dim.w*dim.h)/1e6).toFixed(2)):0,
      truncated: !eoiOk(buf, sniff), readable: dim!==null
    });
  }
}

fs.writeFileSync('_audit.json', JSON.stringify(rows, null, 2));

console.log('TOTAL FILES:', rows.length);
const byDir = {};
for (const r of rows) byDir[r.dir]=(byDir[r.dir]||0)+1;
console.log('BY DIR:', JSON.stringify(byDir));
const byExt = {};
for (const r of rows) byExt[r.ext]=(byExt[r.ext]||0)+1;
console.log('BY EXT:', JSON.stringify(byExt));
const sniffMismatch = rows.filter(r=>r.sniff!==r.ext && !(r.sniff==='jpg'&&r.ext==='jpeg'));
console.log('SNIFF MISMATCH:', sniffMismatch.length, sniffMismatch.map(r=>r.dir+'/'+r.file+'('+r.ext+'->'+r.sniff+')'));
const unreadable = rows.filter(r=>!r.readable);
console.log('UNREADABLE/CORRUPT HEADER:', unreadable.length, unreadable.map(r=>r.dir+'/'+r.file));
const truncated = rows.filter(r=>r.truncated && r.readable);
console.log('TRUNCATED (no EOI):', truncated.length, truncated.map(r=>r.dir+'/'+r.file));

const mps = rows.filter(r=>r.readable).map(r=>r.mp).sort((a,b)=>a-b);
const ws = rows.filter(r=>r.readable).map(r=>r.w).sort((a,b)=>a-b);
const hs = rows.filter(r=>r.readable).map(r=>r.h).sort((a,b)=>a-b);
function q(a,p){return a[Math.floor((a.length-1)*p)];}
console.log('MP min/med/max:', mps[0], q(mps,0.5), mps[mps.length-1]);
console.log('WIDTH min/med/max:', ws[0], q(ws,0.5), ws[ws.length-1]);
console.log('HEIGHT min/med/max:', hs[0], q(hs,0.5), hs[hs.length-1]);
const bytesArr = rows.map(r=>r.bytes).sort((a,b)=>a-b);
console.log('BYTES KB min/med/max:', (bytesArr[0]/1024).toFixed(0), (q(bytesArr,0.5)/1024).toFixed(0), (bytesArr[bytesArr.length-1]/1024).toFixed(0));

const buckets = {'<0.5MP':0,'0.5-1MP':0,'1-2MP':0,'2-4MP':0,'4-8MP':0,'>8MP':0};
for (const r of rows){ if(!r.readable)continue; const m=r.mp;
  if(m<0.5)buckets['<0.5MP']++; else if(m<1)buckets['0.5-1MP']++; else if(m<2)buckets['1-2MP']++;
  else if(m<4)buckets['2-4MP']++; else if(m<8)buckets['4-8MP']++; else buckets['>8MP']++;}
console.log('RES BUCKETS:', JSON.stringify(buckets));

const sig = {};
for (const r of rows){ const k=r.bytes+'_'+r.w+'x'+r.h; (sig[k]=sig[k]||[]).push(r.dir+'/'+r.file); }
const dups = Object.values(sig).filter(a=>a.length>1);
console.log('POTENTIAL DUPLICATES (same bytes+dim):', dups.length);
dups.forEach(a=>console.log('  ', a.join('  ==  ')));
