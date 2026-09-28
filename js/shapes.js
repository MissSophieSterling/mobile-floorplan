/* Mobile Floorplan - catalogue, geometry and SVG drawing shared by the editor and the exporters.
   All lengths are centimetres. y grows downwards, like the screen. */
(function(){
'use strict';
const FP = window.FP = window.FP || {};

FP.WALL = 12;          // wall thickness drawn around rooms, cm
FP.WALL_HEIGHT = 250;  // used by 3D and Sweet Home 3D exports, cm
FP.LEVEL_HEIGHT = 280; // storey-to-storey height, cm

// ---- catalogue -------------------------------------------------------------
FP.CATALOG = {
  rooms: [
    {kind:'room', label:'Room',      name:'Room',        w:400, h:300},
    {kind:'room', label:'Living',    name:'Living room', w:500, h:420},
    {kind:'room', label:'Bedroom',   name:'Bedroom',     w:360, h:340},
    {kind:'room', label:'Kitchen',   name:'Kitchen',     w:320, h:280},
    {kind:'room', label:'Bathroom',  name:'Bathroom',    w:240, h:200},
    {kind:'room', label:'Hallway',   name:'Hallway',     w:120, h:400},
    {kind:'room', label:'Dining',    name:'Dining',      w:340, h:300},
    {kind:'room', label:'Office',    name:'Office',      w:300, h:280},
    {kind:'room', label:'Closet',    name:'Closet',      w:150, h:120},
    {kind:'room', label:'Garage',    name:'Garage',      w:600, h:600},
    {kind:'room', label:'Balcony',   name:'Balcony',     w:400, h:150},
  ],
  openings: [
    {kind:'door',   label:'Door',        name:'Door',        w:80,  h:80},
    {kind:'door',   label:'Wide door',   name:'Wide door',   w:100, h:100},
    {kind:'dbldoor',label:'Double door', name:'Double door', w:160, h:80},
    {kind:'slider', label:'Sliding door',name:'Sliding door',w:180, h:16},
    {kind:'window', label:'Window',      name:'Window',      w:120, h:16},
    {kind:'window', label:'Wide window', name:'Wide window', w:200, h:16},
    {kind:'opening',label:'Opening',     name:'Opening',     w:90,  h:16},
  ],
  furniture: [
    {kind:'bed',      label:'Double bed', name:'Double bed', w:160, h:200},
    {kind:'bed',      label:'Single bed', name:'Single bed', w:90,  h:200},
    {kind:'sofa',     label:'Sofa',       name:'Sofa',       w:210, h:90},
    {kind:'armchair', label:'Armchair',   name:'Armchair',   w:85,  h:85},
    {kind:'table',    label:'Table',      name:'Table',      w:160, h:90},
    {kind:'rtable',   label:'Round table',name:'Round table',w:110, h:110},
    {kind:'chair',    label:'Chair',      name:'Chair',      w:45,  h:45},
    {kind:'desk',     label:'Desk',       name:'Desk',       w:140, h:70},
    {kind:'wardrobe', label:'Wardrobe',   name:'Wardrobe',   w:120, h:60},
    {kind:'tv',       label:'TV unit',    name:'TV unit',    w:160, h:45},
    {kind:'counter',  label:'Counter',    name:'Counter',    w:240, h:60},
    {kind:'stove',    label:'Stove',      name:'Stove',      w:60,  h:60},
    {kind:'fridge',   label:'Fridge',     name:'Fridge',     w:70,  h:70},
    {kind:'ksink',    label:'Kitchen sink',name:'Kitchen sink',w:80, h:60},
    {kind:'toilet',   label:'Toilet',     name:'Toilet',     w:40,  h:65},
    {kind:'sink',     label:'Basin',      name:'Basin',      w:60,  h:45},
    {kind:'bath',     label:'Bathtub',    name:'Bathtub',    w:170, h:75},
    {kind:'shower',   label:'Shower',     name:'Shower',     w:90,  h:90},
    {kind:'washer',   label:'Washer',     name:'Washer',     w:60,  h:60},
    {kind:'stairs',   label:'Stairs',     name:'Stairs',     w:100, h:280},
    {kind:'plant',    label:'Plant',      name:'Plant',      w:45,  h:45},
  ],
};
FP.OPENINGS = {door:1, dbldoor:1, slider:1, window:1, opening:1};
FP.WALL_MOUNTED = FP.OPENINGS; // these snap onto room walls
// items whose depth is fixed (only width is resizable)
FP.FIXED_DEPTH = {slider:16, window:16, opening:16};
// rough heights for the 3D export, cm
FP.HEIGHTS = {bed:55, sofa:85, armchair:85, table:75, rtable:75, chair:90, desk:75, wardrobe:200, tv:50,
  counter:90, stove:90, fridge:180, ksink:90, toilet:75, sink:85, bath:55, shower:4, washer:85, stairs:20, plant:90};

FP.isRoom = it => it.kind === 'room';
FP.isOpening = it => !!FP.OPENINGS[it.kind];

// Effective (axis-aligned) size once rotation is applied.
FP.effSize = it => (it.rot === 90 || it.rot === 270) ? {w:it.h, h:it.w} : {w:it.w, h:it.h};

// Local item point -> plan point (rotation is about the item's centre).
FP.toWorld = function(it, lx, ly){
  const e = FP.effSize(it);
  const cx = it.x + e.w/2, cy = it.y + e.h/2;
  const dx = lx - it.w/2, dy = ly - it.h/2;
  const a = (it.rot||0) * Math.PI/180, c = Math.round(Math.cos(a)*1e9)/1e9, s = Math.round(Math.sin(a)*1e9)/1e9;
  return {x: cx + dx*c - dy*s, y: cy + dx*s + dy*c};
};

// ---- symbols: primitive lists in item-local coordinates (0..w, 0..h) -------
// t: rect{x,y,w,h,r?,fill?}, line{x1,y1,x2,y2}, circle{cx,cy,r}, arc{cx,cy,r,a0,a1} (degrees, clockwise on screen)
// 'mask' primitives are drawn in the paper colour to cut the wall.
FP.symbol = function(it){
  const w = it.w, h = it.h, P = [];
  const R = (x,y,ww,hh,r,extra) => P.push(Object.assign({t:'rect',x,y,w:ww,h:hh,r:r||0}, extra||{}));
  const L = (x1,y1,x2,y2,extra) => P.push(Object.assign({t:'line',x1,y1,x2,y2}, extra||{}));
  const C = (cx,cy,r,extra) => P.push(Object.assign({t:'circle',cx,cy,r}, extra||{}));
  const A = (cx,cy,r,a0,a1) => P.push({t:'arc',cx,cy,r,a0,a1});
  const W = FP.WALL;
  switch(it.kind){
    case 'door':
      R(0,-W/2-1,w,W+2,0,{mask:1});
      L(0,0,0,w); A(0,0,w,0,90); break;
    case 'dbldoor': {
      const m = w/2;
      R(0,-W/2-1,w,W+2,0,{mask:1});
      L(0,0,0,m); A(0,0,m,0,90); L(w,0,w,m); A(w,0,m,90,180); break;
    }
    case 'slider':
      R(0,0,w,h,0,{mask:1}); R(0,0,w,h);
      L(0,h*0.35,w*0.55,h*0.35); L(w*0.45,h*0.65,w,h*0.65); break;
    case 'window':
      R(0,0,w,h,0,{mask:1}); R(0,0,w,h); L(0,h/2,w,h/2); break;
    case 'opening':
      R(0,0,w,h,0,{mask:1}); L(0,0,0,h); L(w,0,w,h); break;
    case 'bed': {
      R(0,0,w,h,4);
      const pw = w > 120 ? (w-30)/2 : w-20;
      if (w > 120){ R(10,10,pw,h*0.14,4); R(20+pw,10,pw,h*0.14,4); } else R(10,10,pw,h*0.14,4);
      L(0,h*0.3,w,h*0.3); break;
    }
    case 'sofa':
      R(0,0,w,h,6); R(0,0,w,h*0.28,4); R(0,0,w*0.1,h,4); R(w*0.9,0,w*0.1,h,4);
      L(w/2,h*0.28,w/2,h); break;
    case 'armchair':
      R(0,0,w,h,6); R(0,0,w,h*0.28,4); R(0,0,w*0.18,h,4); R(w*0.82,0,w*0.18,h,4); break;
    case 'table': R(0,0,w,h,3); break;
    case 'rtable': C(w/2,h/2,Math.min(w,h)/2); break;
    case 'chair': R(0,0,w,h,3); R(0,0,w,h*0.2,2); break;
    case 'desk': R(0,0,w,h,2); R(w*0.35,h*0.62,w*0.3,h*0.3,2); break;
    case 'wardrobe': R(0,0,w,h); L(w/2,0,w/2,h); L(0,h,w,0); break;
    case 'tv': R(0,0,w,h,2); R(w*0.15,h*0.2,w*0.7,h*0.18); break;
    case 'counter': R(0,0,w,h); L(0,h*0.85,w,h*0.85); break;
    case 'stove': {
      R(0,0,w,h,3); const r = Math.min(w,h)*0.16;
      C(w*0.3,h*0.3,r); C(w*0.7,h*0.3,r); C(w*0.3,h*0.7,r); C(w*0.7,h*0.7,r); break;
    }
    case 'fridge': R(0,0,w,h,3); L(0,h*0.15,w,h*0.15); break;
    case 'ksink': R(0,0,w,h,3); R(w*0.1,h*0.18,w*0.8,h*0.64,6); C(w/2,h*0.5,Math.min(w,h)*0.06); break;
    case 'toilet': R(0,0,w,h*0.3,3); P.push({t:'ellipse',cx:w/2,cy:h*0.64,rx:w*0.42,ry:h*0.34}); break;
    case 'sink': R(0,0,w,h,4); P.push({t:'ellipse',cx:w/2,cy:h*0.55,rx:w*0.36,ry:h*0.32}); break;
    case 'bath': R(0,0,w,h,6); R(w*0.06,h*0.12,w*0.88,h*0.76,h*0.3); C(w*0.14,h/2,Math.min(w,h)*0.05); break;
    case 'shower': R(0,0,w,h,2); L(0,0,w,h); L(w,0,0,h); C(w/2,h/2,Math.min(w,h)*0.06); break;
    case 'washer': R(0,0,w,h,3); C(w/2,h*0.55,Math.min(w,h)*0.3); break;
    case 'stairs': {
      R(0,0,w,h); const n = Math.max(3, Math.round(h/28));
      for (let i=1;i<n;i++) L(0,h*i/n,w,h*i/n);
      L(w/2,h*0.92,w/2,h*0.08); L(w/2,h*0.08,w*0.38,h*0.2); L(w/2,h*0.08,w*0.62,h*0.2); break;
    }
    case 'plant': C(w/2,h/2,Math.min(w,h)/2); C(w/2,h/2,Math.min(w,h)*0.22); break;
    default: R(0,0,w,h);
  }
  return P;
};

// ---- SVG ---------------------------------------------------------------------
const esc = FP.esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const n = v => Math.round(v*100)/100;

function primToSVG(p, stroke, sw, paper){
  const f = p.mask ? paper : (p.fill || 'none');
  const st = p.mask ? 'none' : stroke;
  const common = `fill="${f}" stroke="${st}" stroke-width="${n(sw)}"`;
  switch(p.t){
    case 'rect': return `<rect x="${n(p.x)}" y="${n(p.y)}" width="${n(p.w)}" height="${n(p.h)}" rx="${n(p.r||0)}" ${common}/>`;
    case 'line': return `<line x1="${n(p.x1)}" y1="${n(p.y1)}" x2="${n(p.x2)}" y2="${n(p.y2)}" stroke="${stroke}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
    case 'circle': return `<circle cx="${n(p.cx)}" cy="${n(p.cy)}" r="${n(p.r)}" ${common}/>`;
    case 'ellipse': return `<ellipse cx="${n(p.cx)}" cy="${n(p.cy)}" rx="${n(p.rx)}" ry="${n(p.ry)}" ${common}/>`;
    case 'arc': {
      const a0 = p.a0*Math.PI/180, a1 = p.a1*Math.PI/180;
      const x0 = p.cx + p.r*Math.cos(a0), y0 = p.cy + p.r*Math.sin(a0);
      const x1 = p.cx + p.r*Math.cos(a1), y1 = p.cy + p.r*Math.sin(a1);
      return `<path d="M${n(x0)} ${n(y0)}A${n(p.r)} ${n(p.r)} 0 0 1 ${n(x1)} ${n(y1)}" fill="none" stroke="${stroke}" stroke-width="${n(sw*0.7)}" stroke-dasharray="${n(sw*3)} ${n(sw*2)}"/>`;
    }
  }
  return '';
}

FP.itemTransform = function(it){
  const e = FP.effSize(it);
  if (!it.rot) return `translate(${n(it.x)} ${n(it.y)})`;
  return `translate(${n(it.x+e.w/2)} ${n(it.y+e.h/2)}) rotate(${it.rot}) translate(${n(-it.w/2)} ${n(-it.h/2)})`;
};

// Format helpers (units: 'm' or 'ft')
FP.fmtLen = function(cm, units){
  if (units === 'ft'){
    const inches = Math.round(cm/2.54);
    const ft = Math.floor(inches/12), inch = inches%12;
    return inch ? `${ft}′ ${inch}″` : `${ft}′`;
  }
  const m = cm/100;
  return (Math.round(m*100)/100).toString().replace(/\.?0+$/,'') + ' m';
};
FP.fmtArea = function(cm2, units){
  if (units === 'ft') return Math.round(cm2/929.0304) + ' ft²';
  return (Math.round(cm2/1000)/10).toFixed(1) + ' m²';
};

FP.floorBounds = function(floor){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const it of floor.items){
    const e = FP.effSize(it);
    const pad = FP.isRoom(it) ? FP.WALL/2 : 0;
    x0 = Math.min(x0, it.x-pad); y0 = Math.min(y0, it.y-pad);
    x1 = Math.max(x1, it.x+e.w+pad); y1 = Math.max(y1, it.y+e.h+pad);
  }
  if (!isFinite(x0)) return null;
  return {x:x0, y:y0, w:x1-x0, h:y1-y0};
};

/* Draw one floor as SVG markup (no outer <svg>).
   opt.u     = plan units per screen pixel (controls text and stroke sizes)
   opt.units = 'm' | 'ft'
   opt.sel   = selected item id (editor only)
   opt.editor= true to add hit-test data attributes and handles */
FP.floorSVG = function(floor, opt){
  const u = opt.u, units = opt.units, paper = opt.paper || '#ffffff';
  const wallC = '#26303c', inkC = '#1b232e', dimC = '#6b7584', furnC = '#4a5563', sel = opt.sel;
  let s = '';
  const rooms = floor.items.filter(FP.isRoom);
  const furn = floor.items.filter(it => !FP.isRoom(it) && !FP.isOpening(it));
  const opens = floor.items.filter(FP.isOpening);
  const data = it => opt.editor ? ` data-id="${esc(it.id)}"` : '';

  // floor fill first, then walls on top, so shared walls read as one line
  for (const r of rooms){
    const isSel = r.id === sel;
    s += `<rect${data(r)} x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="${isSel?'#e5efff':'#f6f8fa'}"/>`;
  }
  for (const r of rooms){
    s += `<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" fill="none" stroke="${wallC}" stroke-width="${FP.WALL}" stroke-linejoin="miter" pointer-events="none"/>`;
  }
  for (const it of furn){
    s += `<g${data(it)} transform="${FP.itemTransform(it)}">`;
    s += `<rect x="0" y="0" width="${n(it.w)}" height="${n(it.h)}" fill="${it.id===sel?'#dce9ff':'#ffffff'}" fill-opacity="${it.id===sel?1:0.85}"/>`;
    for (const p of FP.symbol(it)) s += primToSVG(p, furnC, Math.max(1.2*u, 1.2), paper);
    s += `</g>`;
  }
  for (const it of opens){
    s += `<g${data(it)} transform="${FP.itemTransform(it)}">`;
    if (opt.editor) s += `<rect x="-4" y="${-FP.WALL}" width="${n(it.w+8)}" height="${n(Math.max(it.h, FP.WALL*2))}" fill="transparent"/>`;
    for (const p of FP.symbol(it)) s += primToSVG(p, wallC, Math.max(1.6*u, 1.6), paper);
    s += `</g>`;
  }
  // labels
  for (const r of rooms){
    const fs = Math.min(13*u, r.w/7, r.h/3.2);
    if (fs < 4*u) continue;
    const cx = r.x + r.w/2, cy = r.y + r.h/2;
    s += `<text x="${n(cx)}" y="${n(cy - fs*0.15)}" text-anchor="middle" font-size="${n(fs)}" font-weight="650" fill="${inkC}" pointer-events="none" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${esc(r.name||'')}</text>`;
    s += `<text x="${n(cx)}" y="${n(cy + fs*1.05)}" text-anchor="middle" font-size="${n(fs*0.78)}" fill="${dimC}" pointer-events="none" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif">${esc(FP.fmtLen(r.w,units))} × ${esc(FP.fmtLen(r.h,units))} · ${esc(FP.fmtArea(r.w*r.h,units))}</text>`;
  }
  // selection outline + handles
  if (opt.editor && sel){
    const it = floor.items.find(i => i.id === sel);
    if (it){
      const e = FP.effSize(it), pad = 3*u;
      s += `<rect x="${n(it.x-pad)}" y="${n(it.y-pad)}" width="${n(e.w+2*pad)}" height="${n(e.h+2*pad)}" fill="none" stroke="#1f6feb" stroke-width="${n(2*u)}" stroke-dasharray="${n(6*u)} ${n(4*u)}" pointer-events="none"/>`;
      const hr = 11*u, hx = it.x+e.w, hy = it.y+e.h;
      s += `<circle data-handle="resize" cx="${n(hx)}" cy="${n(hy)}" r="${n(hr*2)}" fill="transparent"/>`;
      s += `<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(hr)}" fill="#1f6feb" stroke="#fff" stroke-width="${n(2.5*u)}" pointer-events="none"/>`;
      s += `<path d="M${n(hx-4*u)} ${n(hy+1*u)}V${n(hy+4*u)}H${n(hx-1*u)}M${n(hx+1*u)} ${n(hy-4*u)}H${n(hx+4*u)}V${n(hy-1*u)}" stroke="#fff" stroke-width="${n(1.8*u)}" fill="none" pointer-events="none"/>`;
    }
  }
  return s;
};

// Small preview icon for palette tiles and the drag ghost.
FP.tileSVG = function(def){
  const it = {kind:def.kind, x:0, y:0, w:def.w, h:def.h, rot:0};
  const pad = 14, m = Math.max(def.w, def.h) + pad*2;
  const ox = (m - def.w)/2, oy = (m - def.h)/2;
  let s = `<svg viewBox="0 0 ${m} ${m}" xmlns="http://www.w3.org/2000/svg">`;
  const sw = m/34;
  if (def.kind === 'room'){
    s += `<rect x="${ox}" y="${oy}" width="${def.w}" height="${def.h}" fill="#f6f8fa" stroke="#26303c" stroke-width="${sw*2.2}"/>`;
  } else {
    s += `<g transform="translate(${ox} ${oy})">`;
    if (FP.isOpening(it)) s += `<line x1="${-pad}" y1="${FP.isOpening(it)&&def.kind.match(/door$/)?0:def.h/2}" x2="${def.w+pad}" y2="${def.kind.match(/door$/)?0:def.h/2}" stroke="#26303c" stroke-width="${Math.max(FP.WALL, sw*2.2)}"/>`;
    for (const p of FP.symbol(it)) s += primToSVG(p, '#3c4654', sw, '#ffffff');
    s += `</g>`;
  }
  return s + `</svg>`;
};
})();
