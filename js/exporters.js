/* Mobile Floorplan - exporters. Every exporter returns Promise<{blob, filename, mime}>.
   Nothing here talks to a server; files are built in the browser. */
(function(){
'use strict';
const FP = window.FP;
const n = v => Math.round(v*1000)/1000;

const slug = s => (String(s||'floorplan').normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/[\s_]+/g,'-').toLowerCase() || 'floorplan').slice(0,60);
const fileBase = (plan, floor) => slug(plan.name) + (floor ? '-' + slug(floor.name) : '');
const WATERMARK = 'Service provided by zkitszo';

// ---- print-ready SVG document for one floor -----------------------------------
FP.exportSVGString = function(plan, floor){
  const b = FP.floorBounds(floor);
  if (!b) throw new Error('This floor is empty. Add a room first.');
  const units = plan.units;
  const big = Math.max(b.w, b.h);
  const u = big / 900;                 // one "screen pixel" in plan units at the nominal export size
  const M = 60*u;                      // margin around the plan
  const head = 46*u, foot = 44*u;
  const vx = b.x - M, vy = b.y - M - head, vw = b.w + 2*M, vh = b.h + 2*M + head + foot;
  const font = 'font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"';
  const ink = '#1b232e', dim = '#6b7584';
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}" width="${n(vw/u)}" height="${n(vh/u)}">`;
  s += `<rect x="${n(vx)}" y="${n(vy)}" width="${n(vw)}" height="${n(vh)}" fill="#ffffff"/>`;
  // title
  s += `<text x="${n(b.x)}" y="${n(vy + 28*u)}" font-size="${n(17*u)}" font-weight="700" fill="${ink}" ${font}>${FP.esc(plan.name)} · ${FP.esc(floor.name)}</text>`;
  // overall dimension lines
  const dy = b.y - 22*u, dx = b.x - 22*u, t = 5*u, sw = 1.2*u;
  s += `<g stroke="${dim}" stroke-width="${n(sw)}">`;
  s += `<line x1="${n(b.x)}" y1="${n(dy)}" x2="${n(b.x+b.w)}" y2="${n(dy)}"/><line x1="${n(b.x)}" y1="${n(dy-t)}" x2="${n(b.x)}" y2="${n(dy+t)}"/><line x1="${n(b.x+b.w)}" y1="${n(dy-t)}" x2="${n(b.x+b.w)}" y2="${n(dy+t)}"/>`;
  s += `<line x1="${n(dx)}" y1="${n(b.y)}" x2="${n(dx)}" y2="${n(b.y+b.h)}"/><line x1="${n(dx-t)}" y1="${n(b.y)}" x2="${n(dx+t)}" y2="${n(b.y)}"/><line x1="${n(dx-t)}" y1="${n(b.y+b.h)}" x2="${n(dx+t)}" y2="${n(b.y+b.h)}"/>`;
  s += `</g>`;
  s += `<text x="${n(b.x+b.w/2)}" y="${n(dy-6*u)}" text-anchor="middle" font-size="${n(12*u)}" fill="${ink}" ${font}>${FP.esc(FP.fmtLen(b.w, units))}</text>`;
  s += `<text transform="translate(${n(dx-7*u)} ${n(b.y+b.h/2)}) rotate(-90)" text-anchor="middle" font-size="${n(12*u)}" fill="${ink}" ${font}>${FP.esc(FP.fmtLen(b.h, units))}</text>`;
  // the plan itself
  s += FP.floorSVG(floor, {u, units, editor:false});
  // scale bar
  const unitLen = units === 'ft' ? 30.48 : 100;
  const choices = units === 'ft' ? [1,2,5,10,20,50] : [1,2,5,10,20];
  let k = choices[0];
  for (const c of choices) if (c*unitLen <= b.w*0.3) k = c;
  const barW = k*unitLen, by = b.y + b.h + M*0.55;
  s += `<g stroke="${ink}" stroke-width="${n(1.6*u)}"><line x1="${n(b.x)}" y1="${n(by)}" x2="${n(b.x+barW)}" y2="${n(by)}"/><line x1="${n(b.x)}" y1="${n(by-4*u)}" x2="${n(b.x)}" y2="${n(by+4*u)}"/><line x1="${n(b.x+barW)}" y1="${n(by-4*u)}" x2="${n(b.x+barW)}" y2="${n(by+4*u)}"/></g>`;
  s += `<text x="${n(b.x+barW/2)}" y="${n(by+16*u)}" text-anchor="middle" font-size="${n(11*u)}" fill="${ink}" ${font}>${k} ${units === 'ft' ? 'ft' : 'm'}</text>`;
  // footer: overall size + watermark
  s += `<text x="${n(b.x+b.w)}" y="${n(by+2*u)}" text-anchor="end" font-size="${n(11*u)}" fill="${dim}" ${font}>Overall ${FP.esc(FP.fmtLen(b.w,units))} × ${FP.esc(FP.fmtLen(b.h,units))}</text>`;
  s += `<text x="${n(vx+vw-10*u)}" y="${n(vy+vh-10*u)}" text-anchor="end" font-size="${n(9*u)}" fill="#9aa3b0" ${font}>${WATERMARK}</text>`;
  s += `</svg>`;
  return {svg:s, width:vw/u, height:vh/u};
};

function svgToCanvas(svg, w, h, maxSide){
  return new Promise((resolve, reject) => {
    const scale = Math.min(4, maxSide / Math.max(w, h));
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], {type:'image/svg+xml;charset=utf-8'}));
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w*scale); c.height = Math.round(h*scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not draw the image.')); };
    img.src = url;
  });
}
const canvasBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));

async function raster(plan, floor, type, ext){
  const d = FP.exportSVGString(plan, floor);
  const c = await svgToCanvas(d.svg, d.width, d.height, 2600);
  const blob = await canvasBlob(c, type, 0.92);
  return {blob, filename: fileBase(plan, floor) + '.' + ext, mime:type};
}

// ---- PDF (one page per floor, A4, image-based) ------------------------------------
async function pdf(plan){
  const floors = plan.floors.filter(f => FP.floorBounds(f));
  if (!floors.length) throw new Error('The plan is empty. Add a room first.');
  const enc = new TextEncoder();
  const parts = []; let len = 0; const offsets = [];
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const ascii = s => String(s).replace(/[^\x20-\x7e]/g,'?').replace(/([\\()])/g,'\\$1');
  const pages = [];
  for (const f of floors){
    const d = FP.exportSVGString(plan, f);
    const c = await svgToCanvas(d.svg, d.width, d.height, 2400);
    const jpg = new Uint8Array(await (await canvasBlob(c, 'image/jpeg', 0.9)).arrayBuffer());
    pages.push({jpg, iw:c.width, ih:c.height});
  }
  // object numbers: 1 catalog, 2 pages, 3 info, then 3 per page (page, content, image)
  const obj = (num, body) => { offsets[num] = len; push(`${num} 0 obj\n`); if (typeof body === 'string') push(body); else body(); push(`\nendobj\n`); };
  push('%PDF-1.4\n');
  const kids = pages.map((_,i) => `${4+i*3} 0 R`).join(' ');
  obj(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  obj(3, `<< /Title (${ascii(plan.name)}) /Producer (Mobile Floorplan - ${WATERMARK}) /Creator (Mobile Floorplan) >>`);
  pages.forEach((p, i) => {
    const land = p.iw > p.ih;
    const PW = land ? 842 : 595, PH = land ? 595 : 842, m = 28;
    const sc = Math.min((PW-2*m)/p.iw, (PH-2*m)/p.ih);
    const w = p.iw*sc, h = p.ih*sc, x = (PW-w)/2, y = (PH-h)/2;
    const pn = 4+i*3, cn = pn+1, im = pn+2;
    obj(pn, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${cn} 0 R >>`);
    const content = `q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(y)} cm /Im${i} Do Q`;
    obj(cn, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    obj(im, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.iw} /Height ${p.ih} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`);
      push(p.jpg); push('\nendstream');
    });
  });
  const total = 4 + pages.length*3;
  const xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i=1;i<total;i++) x += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return {blob:new Blob(parts, {type:'application/pdf'}), filename:fileBase(plan)+'.pdf', mime:'application/pdf'};
}

// ---- DXF (AutoCAD R12 ASCII, metres) --------------------------------------------
function dxf(plan, floor){
  if (!FP.floorBounds(floor)) throw new Error('This floor is empty. Add a room first.');
  const out = [];
  const g = (code, val) => out.push(String(code), String(val));
  const X = v => n(v/100), Y = v => n(-v/100);
  const txt = s => String(s).replace(/[^\x20-\x7e]/g, ch => '\\U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4,'0'));
  const line = (layer, color, a, b) => { g(0,'LINE'); g(8,layer); g(62,color); g(10,X(a.x)); g(20,Y(a.y)); g(30,0); g(11,X(b.x)); g(21,Y(b.y)); g(31,0); };
  const text = (layer, color, p, h, s) => { g(0,'TEXT'); g(8,layer); g(62,color); g(10,X(p.x)); g(20,Y(p.y)); g(30,0); g(40,n(h/100)); g(1,txt(s)); g(72,1); g(11,X(p.x)); g(21,Y(p.y)); g(31,0); };
  const deg = (c, p) => { const a = Math.atan2(-(p.y-c.y), p.x-c.x)*180/Math.PI; return n((a+360)%360); };

  function prims(it, layer, color){
    const W = (lx,ly) => FP.toWorld(it, lx, ly);
    for (const p of FP.symbol(it)){
      if (p.mask) continue;
      if (p.t === 'rect'){
        const c = [W(p.x,p.y), W(p.x+p.w,p.y), W(p.x+p.w,p.y+p.h), W(p.x,p.y+p.h)];
        for (let i=0;i<4;i++) line(layer, color, c[i], c[(i+1)%4]);
      } else if (p.t === 'line'){
        line(layer, color, W(p.x1,p.y1), W(p.x2,p.y2));
      } else if (p.t === 'circle'){
        const c = W(p.cx,p.cy); g(0,'CIRCLE'); g(8,layer); g(62,color); g(10,X(c.x)); g(20,Y(c.y)); g(30,0); g(40,n(p.r/100));
      } else if (p.t === 'ellipse'){
        const N = 24; let prev = null;
        for (let i=0;i<=N;i++){
          const a = i/N*2*Math.PI, q = W(p.cx + p.rx*Math.cos(a), p.cy + p.ry*Math.sin(a));
          if (prev) line(layer, color, prev, q); prev = q;
        }
      } else if (p.t === 'arc'){
        const c = W(p.cx,p.cy);
        const s = W(p.cx + p.r*Math.cos(p.a0*Math.PI/180), p.cy + p.r*Math.sin(p.a0*Math.PI/180));
        const e = W(p.cx + p.r*Math.cos(p.a1*Math.PI/180), p.cy + p.r*Math.sin(p.a1*Math.PI/180));
        // clockwise on screen (y down) is counter-clockwise from e to s once y is flipped
        g(0,'ARC'); g(8,layer); g(62,color); g(10,X(c.x)); g(20,Y(c.y)); g(30,0); g(40,n(p.r/100)); g(50,deg(c,e)); g(51,deg(c,s));
      }
    }
  }

  g(0,'SECTION'); g(2,'HEADER'); g(9,'$ACADVER'); g(1,'AC1009'); g(9,'$INSUNITS'); g(70,6); g(0,'ENDSEC');
  g(0,'SECTION'); g(2,'ENTITIES');
  for (const it of floor.items){
    if (FP.isRoom(it)){
      const c = [{x:it.x,y:it.y},{x:it.x+it.w,y:it.y},{x:it.x+it.w,y:it.y+it.h},{x:it.x,y:it.y+it.h}];
      for (let i=0;i<4;i++) line('WALLS', 7, c[i], c[(i+1)%4]);
      const fs = Math.max(8, Math.min(28, it.w/8, it.h/4));
      text('ROOM_LABELS', 5, {x:it.x+it.w/2, y:it.y+it.h/2 - fs*0.2}, fs, it.name || 'Room');
      text('ROOM_LABELS', 8, {x:it.x+it.w/2, y:it.y+it.h/2 + fs*1.1}, fs*0.7, FP.fmtArea(it.w*it.h, plan.units).replace('²', '2').replace(' ft2', ' sq ft'));
    } else if (FP.isOpening(it)){
      prims(it, it.kind === 'window' ? 'WINDOWS' : 'DOORS', it.kind === 'window' ? 4 : 1);
    } else {
      prims(it, 'FURNITURE', 3);
    }
  }
  const b = FP.floorBounds(floor);
  text('NOTES', 8, {x:b.x + b.w/2, y:b.y + b.h + 60}, 12, WATERMARK);
  g(0,'ENDSEC'); g(0,'EOF');
  return {blob:new Blob([out.join('\r\n') + '\r\n'], {type:'application/dxf'}), filename:fileBase(plan, floor)+'.dxf', mime:'application/dxf'};
}

// ---- walls from room edges (shared by 3D and Sweet Home 3D) -----------------------
function roomWalls(floor){
  const seen = new Set(), walls = [];
  for (const r of floor.items.filter(FP.isRoom)){
    const c = [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]];
    for (let i=0;i<4;i++){
      const a = c[i], b = c[(i+1)%4];
      const key = [a,b].map(p => p.map(v => Math.round(v)).join(',')).sort().join('|');
      if (seen.has(key)) continue; seen.add(key);
      walls.push({x1:a[0], y1:a[1], x2:b[0], y2:b[1]});
    }
  }
  return walls;
}

// ---- Sweet Home 3D (.sh3d = zip containing Home.xml) ------------------------------
function sh3d(plan){
  const x = s => FP.esc(s).replace(/'/g,'&apos;');
  let xml = `<?xml version='1.0'?>\n<home version='6400' name='${x(plan.name)}.sh3d' wallHeight='${FP.WALL_HEIGHT}'>\n`;
  xml += `  <property name='com.eteks.sweethome3d.SweetHome3D.Creator' value='Mobile Floorplan - ${WATERMARK}'/>\n`;
  plan.floors.forEach((f, i) => {
    xml += `  <level id='level${i}' name='${x(f.name)}' elevation='${i*FP.LEVEL_HEIGHT}' floorThickness='12' height='${FP.WALL_HEIGHT}' elevationIndex='${i}'/>\n`;
  });
  let wid = 0;
  plan.floors.forEach((f, i) => {
    for (const r of f.items.filter(FP.isRoom)){
      xml += `  <room level='level${i}' name='${x(r.name||'')}' areaVisible='true'>`;
      for (const p of [[r.x,r.y],[r.x+r.w,r.y],[r.x+r.w,r.y+r.h],[r.x,r.y+r.h]]) xml += `<point x='${n(p[0])}' y='${n(p[1])}'/>`;
      xml += `</room>\n`;
    }
    for (const w of roomWalls(f)){
      xml += `  <wall id='wall${wid++}' level='level${i}' xStart='${n(w.x1)}' yStart='${n(w.y1)}' xEnd='${n(w.x2)}' yEnd='${n(w.y2)}' height='${FP.WALL_HEIGHT}' thickness='${FP.WALL}' pattern='hatchUp'/>\n`;
    }
  });
  xml += `</home>\n`;
  const zip = FP.zip([{name:'Home.xml', data:new TextEncoder().encode(xml)}]);
  return {blob:new Blob([zip], {type:'application/octet-stream'}), filename:fileBase(plan)+'.sh3d', mime:'application/octet-stream'};
}

// ---- Wavefront OBJ (3D: floors, walls, furniture blocks; metres, Y up) ----------------
function obj(plan){
  const L = [`# Mobile Floorplan 3D export - ${WATERMARK}`, `# units: metres, Y is up`, `o ${plan.name.replace(/\s+/g,'_')}`];
  let vi = 0;
  const m = v => n(v/100);
  function box(name, x0,x1, y0,y1, z0,z1){
    L.push(`g ${name.replace(/\s+/g,'_')}`);
    const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]];
    for (const p of v) L.push(`v ${m(p[0])} ${m(p[1])} ${m(p[2])}`);
    const f = [[1,4,3,2],[5,6,7,8],[1,2,6,5],[4,8,7,3],[1,5,8,4],[2,3,7,6]];
    for (const q of f) L.push('f ' + q.map(i => i+vi).join(' '));
    vi += 8;
  }
  const T = FP.WALL/2;
  plan.floors.forEach((f, li) => {
    const e = li*FP.LEVEL_HEIGHT;
    for (const r of f.items.filter(FP.isRoom)){
      L.push(`g ${(f.name+'_'+(r.name||'Room')).replace(/\s+/g,'_')}_floor`);
      for (const p of [[r.x,r.y],[r.x,r.y+r.h],[r.x+r.w,r.y+r.h],[r.x+r.w,r.y]]) L.push(`v ${m(p[0])} ${m(e)} ${m(p[1])}`);
      L.push(`f ${vi+1} ${vi+2} ${vi+3} ${vi+4}`); vi += 4;
    }
    roomWalls(f).forEach((w, i) => {
      const x0 = Math.min(w.x1,w.x2) - T, x1 = Math.max(w.x1,w.x2) + T;
      const z0 = Math.min(w.y1,w.y2) - T, z1 = Math.max(w.y1,w.y2) + T;
      box(`${f.name}_wall_${i+1}`, x0, x1, e, e+FP.WALL_HEIGHT, z0, z1);
    });
    for (const it of f.items){
      if (FP.isRoom(it) || FP.isOpening(it)) continue;
      const s = FP.effSize(it);
      box(`${f.name}_${it.name||it.kind}`, it.x, it.x+s.w, e, e+(FP.HEIGHTS[it.kind]||75), it.y, it.y+s.h);
    }
  });
  return {blob:new Blob([L.join('\n')+'\n'], {type:'model/obj'}), filename:fileBase(plan)+'.obj', mime:'model/obj'};
}

// ---- CSV room schedule -------------------------------------------------------------
function csv(plan){
  const ft = plan.units === 'ft';
  const len = cm => ft ? n(cm/30.48).toFixed(2) : n(cm/100).toFixed(2);
  const area = cm2 => ft ? (cm2/929.0304).toFixed(1) : (cm2/10000).toFixed(2);
  const q = s => /[",\n]/.test(s) ? '"' + String(s).replace(/"/g,'""') + '"' : String(s);
  const U = ft ? 'ft' : 'm', A = ft ? 'ft²' : 'm²';
  const rows = [['Floor','Room',`Width (${U})`,`Length (${U})`,`Area (${A})`]];
  for (const f of plan.floors){
    let tot = 0;
    for (const r of f.items.filter(FP.isRoom)){ rows.push([f.name, r.name||'', len(r.w), len(r.h), area(r.w*r.h)]); tot += r.w*r.h; }
    rows.push([f.name, 'Total', '', '', area(tot)]);
  }
  rows.push([]); rows.push([WATERMARK]);
  return {blob:new Blob(['﻿' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n'], {type:'text/csv'}), filename:fileBase(plan)+'.csv', mime:'text/csv'};
}

function json(plan){
  return {blob:new Blob([JSON.stringify(plan, null, 2)], {type:'application/json'}), filename:fileBase(plan)+'.floorplan.json', mime:'application/json'};
}

// ---- zip (stored, no compression) ----------------------------------------------------
const CRC = (() => { const t = new Uint32Array(256); for (let i=0;i<256;i++){ let c=i; for (let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; t[i]=c>>>0; } return t; })();
const crc32 = d => { let c = 0xFFFFFFFF; for (let i=0;i<d.length;i++) c = CRC[(c^d[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
FP.zip = function(files){
  const enc = new TextEncoder(), chunks = [], central = []; let off = 0;
  const now = new Date();
  const dt = ((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1)) & 0xFFFF;
  const dd = (((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate()) & 0xFFFF;
  for (const f of files){
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0,0x04034b50,true); h.setUint16(4,20,true); h.setUint16(6,0x0800,true); h.setUint16(8,0,true);
    h.setUint16(10,dt,true); h.setUint16(12,dd,true); h.setUint32(14,crc,true); h.setUint32(18,size,true); h.setUint32(22,size,true);
    h.setUint16(26,name.length,true); h.setUint16(28,0,true);
    chunks.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0,0x02014b50,true); c.setUint16(4,20,true); c.setUint16(6,20,true); c.setUint16(8,0x0800,true); c.setUint16(10,0,true);
    c.setUint16(12,dt,true); c.setUint16(14,dd,true); c.setUint32(16,crc,true); c.setUint32(20,size,true); c.setUint32(24,size,true);
    c.setUint16(28,name.length,true); c.setUint32(42,off,true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + size;
  }
  const cdSize = central.reduce((a,b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0,0x06054b50,true); e.setUint16(8,files.length,true); e.setUint16(10,files.length,true);
  e.setUint32(12,cdSize,true); e.setUint32(16,off,true);
  const all = [...chunks, ...central, new Uint8Array(e.buffer)];
  const outLen = all.reduce((a,b) => a + b.length, 0), out = new Uint8Array(outLen);
  let p = 0; for (const a of all){ out.set(a, p); p += a.length; }
  return out;
};

// ---- registry -------------------------------------------------------------------------
FP.FORMATS = [
  {id:'png',  label:'PNG image',     desc:'Sharp image. Works in any app, and in nzyme, Floorplanner or RoomSketcher as a trace-over.', scope:'floor', run:(p,f) => raster(p,f,'image/png','png')},
  {id:'jpg',  label:'JPG image',     desc:'Smaller image for messages and email.', scope:'floor', run:(p,f) => raster(p,f,'image/jpeg','jpg')},
  {id:'pdf',  label:'PDF',           desc:'Print-ready, one A4 page per floor.', scope:'all', run:p => pdf(p)},
  {id:'svg',  label:'SVG vector',    desc:'Edit in Illustrator, Inkscape, Figma or a browser.', scope:'floor', run:(p,f) => {
    const d = FP.exportSVGString(p,f);
    return {blob:new Blob([d.svg], {type:'image/svg+xml'}), filename:fileBase(p,f)+'.svg', mime:'image/svg+xml'};
  }},
  {id:'dxf',  label:'DXF (CAD)',     desc:'AutoCAD, LibreCAD, DraftSight, SketchUp Pro, Revit, Chief Architect.', scope:'floor', run:(p,f) => dxf(p,f)},
  {id:'sh3d', label:'Sweet Home 3D', desc:'Rooms and walls on one level per floor. Opens in Sweet Home 3D 5.3+.', scope:'all', run:p => sh3d(p)},
  {id:'obj',  label:'3D model (OBJ)',desc:'Blender, SketchUp, 3ds Max, Unity. Walls, floors and furniture blocks.', scope:'all', run:p => obj(p)},
  {id:'csv',  label:'CSV room list', desc:'Room sizes and areas for Excel, Numbers or Google Sheets.', scope:'all', run:p => csv(p)},
  {id:'json', label:'Floorplan JSON',desc:'Full editable save. Open it again here or in any app that embeds this editor.', scope:'all', run:p => json(p)},
];

FP.runExport = async function(id, plan, floor){
  const f = FP.FORMATS.find(x => x.id === id);
  if (!f) throw new Error('Unknown format: ' + id);
  return await f.run(plan, floor);
};
})();
