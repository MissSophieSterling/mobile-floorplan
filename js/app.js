/* Mobile Floorplan - editor, touch handling and the embedding bridge. */
(function(){
'use strict';
const FP = window.FP;
const $ = id => document.getElementById(id);
const STORE_KEY = 'mobile-floorplan:v1';
const APP_URL = location.origin + location.pathname.replace(/[^/]*$/, '');
const PLAN_FORMAT = 'mobile-floorplan', PLAN_VERSION = 1;

// ---------------------------------------------------------------------------
// URL parameters (see About → "Add it to your app")
// ---------------------------------------------------------------------------
const params = new URLSearchParams(location.search);
const hashParams = new URLSearchParams(location.hash.slice(1));
const inFrame = window.parent !== window;
const nativeHost = !!(window.ReactNativeWebView || (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mobileFloorplan) || window.MobileFloorplanAndroid);
const embedded = inFrame || nativeHost || params.get('embed') === '1';
const returnUrl = safeReturnUrl(params.get('return'));
// In embed mode the host owns the data, so we do not keep a copy in this browser unless asked.
const useStorage = params.has('storage') ? params.get('storage') !== '0' : !embedded;
let allowedFormats = parseFormats(params.get('formats'));
let hostOrigin = params.get('origin') || null;

function parseFormats(v){
  if (!v) return null;
  if (v === 'none') return [];
  return v.split(',').map(s => s.trim().toLowerCase()).filter(id => FP.FORMATS.some(f => f.id === id));
}
function safeReturnUrl(v){
  if (!v) return null;
  try {
    const u = new URL(v, location.href);
    if (/^(javascript|data|vbscript|file|blob|about):$/i.test(u.protocol)) return null;
    return u;
  } catch(e){ return null; }
}

// ---------------------------------------------------------------------------
// Plan model
// ---------------------------------------------------------------------------
let uidN = 0;
const uid = () => 'i' + Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2,6);

function blankPlan(){
  return {format:PLAN_FORMAT, version:PLAN_VERSION, name:'My floor plan', units:'m',
    floors:[{id:uid(), name:'Ground floor', items:[]}]};
}
function samplePlan(){
  const it = (kind, name, x, y, w, h, rot) => ({id:uid(), kind, name, x, y, w, h, rot:rot||0});
  return {format:PLAN_FORMAT, version:PLAN_VERSION, name:'Sample apartment', units:'m', floors:[
    {id:uid(), name:'Ground floor', items:[
      it('room','Living room',0,0,520,420), it('room','Kitchen',520,0,320,300), it('room','Hallway',520,300,320,120),
      it('room','Bedroom',0,420,380,340), it('room','Bathroom',380,420,220,200), it('room','Office',600,420,240,340),
      it('room','Closet',380,620,220,140),
      it('window','Window',150,-8,200,16), it('window','Window',620,-8,120,16), it('window','Window',120,752,120,16),
      it('window','Window',660,752,120,16),
      it('door','Door',150,420,80,80), it('door','Door',700,420,80,80), it('door','Door',440,420,80,80),
      it('door','Door',440,320,80,80,90), it('door','Front door',760,320,80,80,90), it('opening','Opening',640,292,90,16),
      it('sofa','Sofa',150,310,210,90,180), it('rtable','Round table',200,150,110,110), it('tv','TV unit',10,130,160,45,90),
      it('bed','Double bed',10,520,160,200,270), it('wardrobe','Wardrobe',250,690,120,60,180),
      it('bath','Bathtub',400,535,170,75), it('toilet','Toilet',545,440,40,65),
      it('counter','Counter',530,10,240,60), it('fridge','Fridge',770,10,70,70), it('table','Table',600,150,160,90),
      it('desk','Desk',650,680,140,70,180),
    ]},
    {id:uid(), name:'Basement', items:[
      it('room','Rec room',0,0,560,420), it('room','Utility',560,0,280,240), it('room','Storage',560,240,280,180),
      it('stairs','Stairs',20,20,100,280), it('washer','Washer',760,10,60,60), it('door','Door',640,240,80,80),
    ]},
  ]};
}

const KINDS = new Set(['room', ...Object.values(FP.CATALOG).flat().map(d => d.kind)]);
const num = (v, d, lo, hi) => { v = Number(v); if (!isFinite(v)) v = d; return Math.min(hi, Math.max(lo, v)); };
const str = (v, d, max) => (typeof v === 'string' ? v : d).slice(0, max || 80);

// Accept a plan from a file, URL or host app, and clean it.
function sanitizePlan(p){
  if (typeof p === 'string') p = JSON.parse(p);
  if (!p || typeof p !== 'object' || !Array.isArray(p.floors)) throw new Error('That is not a floor plan file.');
  const out = {format:PLAN_FORMAT, version:PLAN_VERSION, name:str(p.name,'My floor plan'), units:p.units === 'ft' ? 'ft' : 'm', floors:[]};
  for (const f of p.floors.slice(0, 20)){
    if (!f || !Array.isArray(f.items)) continue;
    const floor = {id:str(f.id, uid(), 40) || uid(), name:str(f.name,'Floor'), items:[]};
    for (const i of f.items.slice(0, 2000)){
      if (!i || !KINDS.has(i.kind)) continue;
      const rot = [0,90,180,270].includes(i.rot) ? i.rot : 0;
      floor.items.push({id:str(i.id, uid(), 40) || uid(), kind:i.kind, name:str(i.name, i.kind),
        x:num(i.x,0,-1e5,1e5), y:num(i.y,0,-1e5,1e5), w:num(i.w,100,5,1e5), h:num(i.h,100,5,1e5), rot});
    }
    out.floors.push(floor);
  }
  if (!out.floors.length) out.floors.push({id:uid(), name:'Ground floor', items:[]});
  // ids must be unique
  const seen = new Set();
  for (const f of out.floors) for (const i of f.items){ if (seen.has(i.id)) i.id = uid(); seen.add(i.id); }
  return out;
}

const b64u = {
  enc(s){ const b = new TextEncoder().encode(s); let bin = ''; for (let i=0;i<b.length;i++) bin += String.fromCharCode(b[i]); return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); },
  dec(s){ s = s.replace(/-/g,'+').replace(/_/g,'/'); const bin = atob(s); const b = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) b[i] = bin.charCodeAt(i); return new TextDecoder().decode(b); },
};

function initialPlan(){
  const src = hashParams.get('plan') || params.get('plan');
  if (src){ try { return sanitizePlan(b64u.dec(src)); } catch(e){ console.warn('Ignoring bad plan parameter', e); } }
  if (useStorage){ try { const s = localStorage.getItem(STORE_KEY); if (s) return sanitizePlan(s); } catch(e){} }
  return embedded ? blankPlan() : samplePlan();
}

let plan = initialPlan();
if (params.get('units') === 'ft' || params.get('units') === 'm') plan.units = params.get('units');
if (params.get('name')) plan.name = str(params.get('name'), plan.name);
let cur = 0, sel = null;
const floor = () => plan.floors[cur];
const findItem = id => floor().items.find(i => i.id === id);

// ---- history ----
let undoStack = [], redoStack = [], snap = JSON.stringify(plan);
function commit(){
  const now = JSON.stringify(plan);
  if (now === snap) return;
  undoStack.push(snap); if (undoStack.length > 100) undoStack.shift();
  redoStack = []; snap = now; afterChange();
}
function undo(){ if (!undoStack.length) return; redoStack.push(snap); snap = undoStack.pop(); restore(); }
function redo(){ if (!redoStack.length) return; undoStack.push(snap); snap = redoStack.pop(); restore(); }
function restore(){
  plan = JSON.parse(snap); cur = Math.min(cur, plan.floors.length-1);
  if (sel && !findItem(sel)) sel = null;
  buildFloors(); render(); showPanel(); afterChange();
}
function resetHistory(){ undoStack = []; redoStack = []; snap = JSON.stringify(plan); afterChange(); }
let changeTimer = 0;
function afterChange(){
  $('undoBtn').disabled = !undoStack.length; $('redoBtn').disabled = !redoStack.length;
  if (useStorage){ try { localStorage.setItem(STORE_KEY, snap); } catch(e){} }
  clearTimeout(changeTimer);
  changeTimer = setTimeout(() => bridge.emit({type:'change', plan:JSON.parse(snap)}), 250);
}

// ---------------------------------------------------------------------------
// View (pan / zoom) and rendering
// ---------------------------------------------------------------------------
const svg = $('canvas'), world = $('world'), stage = $('stage');
const view = {s:0.6, tx:40, ty:40};
const step = () => plan.units === 'ft' ? 15.24 : 10;   // snap: 6 inches or 10 cm
const snapV = v => Math.round(v/step())*step();

function fit(){
  const b = FP.floorBounds(floor()), r = stage.getBoundingClientRect();
  if (!b){ view.s = Math.min(r.width, r.height)/900; view.tx = r.width/2 - 450*view.s; view.ty = r.height/2 - 450*view.s; render(); return; }
  const pad = 48;
  view.s = Math.max(0.03, Math.min(4, Math.min((r.width-pad*2)/b.w, (r.height-pad*2)/b.h)));
  view.tx = (r.width - b.w*view.s)/2 - b.x*view.s;
  view.ty = (r.height - b.h*view.s)/2 - b.y*view.s;
  render();
}
function toWorld(cx, cy){ const r = svg.getBoundingClientRect(); return {x:(cx - r.left - view.tx)/view.s, y:(cy - r.top - view.ty)/view.s}; }

function render(){
  const u = 1/view.s, g = plan.units === 'ft' ? 30.48 : 100;
  const pat = $('gridMinor');
  pat.setAttribute('width', g); pat.setAttribute('height', g);
  $('gridPath').setAttribute('d', `M${g} 0H0V${g}`);
  $('gridPath').setAttribute('stroke-width', u);
  world.setAttribute('transform', `translate(${view.tx} ${view.ty}) scale(${view.s})`);
  world.innerHTML = `<rect x="-100000" y="-100000" width="200000" height="200000" fill="url(#gridMinor)" data-bg="1"/>` +
    FP.floorSVG(floor(), {u, units:plan.units, sel, editor:true});
  $('hint').hidden = floor().items.length > 0;
}

// ---------------------------------------------------------------------------
// Moving and resizing, with snapping
// ---------------------------------------------------------------------------
function placeAtCentre(it, cx, cy){
  const e = FP.effSize(it);
  it.x = cx - e.w/2; it.y = cy - e.h/2;
  if (FP.isOpening(it)){ if (snapToWall(it, cx, cy)) return; }
  it.x = snapV(it.x); it.y = snapV(it.y);
  if (FP.isRoom(it)) alignRoom(it, 'move');
}

// Put a door or window on the nearest room wall, facing into the room.
function snapToWall(it, cx, cy){
  const tol = Math.max(45, 28/view.s);
  let best = null;
  for (const r of floor().items){
    if (!FP.isRoom(r)) continue;
    const edges = [
      {side:'top',    d:Math.abs(cy - r.y),       along:cx, a0:r.x, a1:r.x+r.w},
      {side:'bottom', d:Math.abs(cy - (r.y+r.h)), along:cx, a0:r.x, a1:r.x+r.w},
      {side:'left',   d:Math.abs(cx - r.x),       along:cy, a0:r.y, a1:r.y+r.h},
      {side:'right',  d:Math.abs(cx - (r.x+r.w)), along:cy, a0:r.y, a1:r.y+r.h},
    ];
    for (const e of edges){
      if (e.along < e.a0 - 10 || e.along > e.a1 + 10) continue;
      if (e.d < tol && (!best || e.d < best.d)) best = Object.assign(e, {r});
    }
  }
  if (!best) return false;
  const r = best.r, swing = it.kind === 'door' || it.kind === 'dbldoor';
  const L = it.w, D = it.h;
  const clampA = v => Math.min(best.a1 - L, Math.max(best.a0, snapV(v - L/2)));
  switch(best.side){
    case 'top':    it.rot = 0;                  it.x = clampA(cx); it.y = swing ? r.y : r.y - D/2; break;
    case 'bottom': it.rot = swing ? 180 : 0;    it.x = clampA(cx); it.y = swing ? r.y + r.h - D : r.y + r.h - D/2; break;
    case 'left':   it.rot = swing ? 270 : 90;   it.y = clampA(cy); it.x = swing ? r.x : r.x - D/2; break;
    case 'right':  it.rot = 90;                 it.y = clampA(cy); it.x = swing ? r.x + r.w - D : r.x + r.w - D/2; break;
  }
  return true;
}

// Pull room edges onto nearby edges of other rooms so walls line up.
function alignRoom(it, mode){
  const tol = 14/view.s;
  const others = floor().items.filter(o => FP.isRoom(o) && o !== it);
  const xs = others.flatMap(o => [o.x, o.x+o.w]), ys = others.flatMap(o => [o.y, o.y+o.h]);
  const bestDelta = (edges, targets) => {
    let b = null;
    for (const e of edges) for (const t of targets){ const d = t - e; if (Math.abs(d) < tol && (b === null || Math.abs(d) < Math.abs(b))) b = d; }
    return b;
  };
  if (mode === 'move'){
    const dx = bestDelta([it.x, it.x+it.w], xs); if (dx !== null) it.x += dx;
    const dy = bestDelta([it.y, it.y+it.h], ys); if (dy !== null) it.y += dy;
  } else {
    const dx = bestDelta([it.x+it.w], xs); if (dx !== null) it.w = Math.max(50, it.w + dx);
    const dy = bestDelta([it.y+it.h], ys); if (dy !== null) it.h = Math.max(50, it.h + dy);
  }
}

// Items (not rooms) whose centre sits inside the room or on its walls.
function contentsOf(room){
  const t = FP.WALL;
  return floor().items.filter(o => {
    if (o === room || FP.isRoom(o)) return false;
    const e = FP.effSize(o), cx = o.x + e.w/2, cy = o.y + e.h/2;
    // doors sit with their centre inside the room; windows sit on the wall line
    const inside = cx > room.x - t && cx < room.x + room.w + t && cy > room.y - t && cy < room.y + room.h + t;
    return inside;
  });
}

function resizeTo(it, px, py){
  const min = FP.isRoom(it) ? 50 : 20;
  let ew = Math.max(min, snapV(px - it.x)), eh = Math.max(min, snapV(py - it.y));
  const vertical = it.rot === 90 || it.rot === 270;
  let w = vertical ? eh : ew, h = vertical ? ew : eh;
  if (it.kind === 'door') h = w;
  else if (it.kind === 'dbldoor') h = w/2;
  else if (FP.FIXED_DEPTH[it.kind]) h = FP.FIXED_DEPTH[it.kind];
  if (FP.isOpening(it)){
    // keep the opening on its wall: grow along the wall only
    const c = FP.effSize(it);
    if (it.rot === 180) it.y += c.h - h;
    if (it.rot === 90) it.x += c.w - h;
    if (it.kind === 'window' || it.kind === 'slider' || it.kind === 'opening'){ if (vertical) it.x += (c.w - h)/2; else it.y += (c.h - h)/2; }
  }
  it.w = w; it.h = h;
  if (FP.isRoom(it)) alignRoom(it, 'resize');
}

function rotateItem(it){
  const e = FP.effSize(it), cx = it.x + e.w/2, cy = it.y + e.h/2;
  if (FP.isRoom(it)){ const t = it.w; it.w = it.h; it.h = t; }
  else it.rot = ((it.rot||0) + 90) % 360;
  const n = FP.effSize(it);
  it.x = snapV(cx - n.w/2); it.y = snapV(cy - n.h/2);
}

// ---------------------------------------------------------------------------
// Canvas gestures: drag items, drag handle, pan, pinch, wheel
// ---------------------------------------------------------------------------
const pointers = new Map();
let gesture = null;

svg.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  svg.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size === 2){ startPinch(); return; }
  if (pointers.size > 2) return;
  const handle = e.target.closest('[data-handle]');
  const hit = e.target.closest('[data-id]');
  const p = toWorld(e.clientX, e.clientY);
  if (handle && sel){
    gesture = {mode:'resize', id:sel, moved:false, sx:e.clientX, sy:e.clientY};
  } else if (hit){
    const it = findItem(hit.dataset.id);
    const was = sel; sel = it.id;
    const ef = FP.effSize(it);
    gesture = {mode:'move', id:it.id, ox:p.x - (it.x+ef.w/2), oy:p.y - (it.y+ef.h/2), moved:false, sx:e.clientX, sy:e.clientY,
      contents: FP.isRoom(it) ? contentsOf(it) : []};
    if (was !== sel){ render(); showPanel(); }
  } else {
    gesture = {mode:'pan', tx:view.tx, ty:view.ty, sx:e.clientX, sy:e.clientY, moved:false};
  }
  e.preventDefault();
});

svg.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (!gesture) return;
  if (gesture.mode === 'pinch'){ doPinch(); return; }
  const dist = Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy);
  if (!gesture.moved && dist < 4) return;
  gesture.moved = true;
  if (gesture.mode === 'pan'){
    view.tx = gesture.tx + e.clientX - gesture.sx; view.ty = gesture.ty + e.clientY - gesture.sy; render();
  } else {
    const it = findItem(gesture.id); if (!it) return;
    const p = toWorld(e.clientX, e.clientY);
    if (gesture.mode === 'move'){
      const x0 = it.x, y0 = it.y;
      placeAtCentre(it, p.x - gesture.ox, p.y - gesture.oy);
      // a room carries its doors, windows and furniture with it
      for (const c of gesture.contents){ c.x += it.x - x0; c.y += it.y - y0; }
    }
    else resizeTo(it, p.x, p.y);
    render(); if (gesture.mode === 'resize') updatePanelNumbers();
  }
});

function endPointer(e){
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (!gesture) return;
  if (gesture.mode === 'pinch'){
    if (pointers.size === 0) gesture = null;
    return;
  }
  if (gesture.mode === 'pan' && !gesture.moved){ if (sel){ sel = null; render(); showPanel(); } }
  if (gesture.mode === 'move' || gesture.mode === 'resize'){ commit(); updatePanelNumbers(); }
  gesture = null;
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

function startPinch(){
  if (gesture && (gesture.mode === 'move' || gesture.mode === 'resize') && gesture.moved) commit();
  const [a, b] = [...pointers.values()];
  const r = svg.getBoundingClientRect();
  const mid = {x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top};
  gesture = {mode:'pinch', d0:Math.hypot(a.x-b.x, a.y-b.y) || 1, s0:view.s,
    wx:(mid.x - view.tx)/view.s, wy:(mid.y - view.ty)/view.s};
}
function doPinch(){
  const [a, b] = [...pointers.values()]; if (!b) return;
  const r = svg.getBoundingClientRect();
  const mid = {x:(a.x+b.x)/2 - r.left, y:(a.y+b.y)/2 - r.top};
  view.s = Math.max(0.03, Math.min(6, gesture.s0 * Math.hypot(a.x-b.x, a.y-b.y) / gesture.d0));
  view.tx = mid.x - gesture.wx*view.s; view.ty = mid.y - gesture.wy*view.s;
  render();
}
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const wx = (mx - view.tx)/view.s, wy = (my - view.ty)/view.s;
  view.s = Math.max(0.03, Math.min(6, view.s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
  view.tx = mx - wx*view.s; view.ty = my - wy*view.s; render();
}, {passive:false});

// ---------------------------------------------------------------------------
// Palette with drag and drop
// ---------------------------------------------------------------------------
let cat = 'rooms';
function buildPalette(){
  const pal = $('palette'); pal.innerHTML = '';
  FP.CATALOG[cat].forEach(def => {
    const t = document.createElement('button');
    t.className = 'tile'; t.type = 'button';
    t.innerHTML = FP.tileSVG(def) + `<span>${FP.esc(def.label)}</span>`;
    t.setAttribute('aria-label', 'Add ' + def.label);
    attachTileDrag(t, def);
    pal.appendChild(t);
  });
}
document.querySelectorAll('.dock-tab').forEach(b => b.addEventListener('click', () => {
  cat = b.dataset.cat;
  document.querySelectorAll('.dock-tab').forEach(x => x.classList.toggle('active', x === b));
  buildPalette();
}));

let addOffset = 0;
function attachTileDrag(tile, def){
  let st = null;
  const ghost = $('ghost');
  tile.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    st = {x:e.clientX, y:e.clientY, id:e.pointerId, drag:false, t:Date.now()};
    tile.setPointerCapture(e.pointerId);
  });
  tile.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.drag){
      const touchLike = e.pointerType !== 'mouse';
      // on touch, a sideways swipe scrolls the palette; lift a tile upwards to drag it out
      if (Math.hypot(dx, dy) < 8) return;
      if (touchLike && Math.abs(dx) > Math.abs(dy) * 1.2) { st = null; return; }
      st.drag = true;
      ghost.innerHTML = FP.tileSVG(def); ghost.hidden = false;
    }
    ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
    const r = stage.getBoundingClientRect();
    ghost.style.opacity = (e.clientY < r.bottom && e.clientY > r.top) ? '.95' : '.5';
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return;
    const s = st; st = null; ghost.hidden = true;
    if (e.type === 'pointercancel') return;
    const r = stage.getBoundingClientRect();
    if (s.drag){
      if (e.clientY < r.bottom && e.clientY > r.top && e.clientX > r.left && e.clientX < r.right){
        const p = toWorld(e.clientX, e.clientY);
        addItem(def, p.x, p.y);
      }
    } else {
      // plain tap: add in the middle of the screen
      const p = toWorld(r.left + r.width/2, r.top + r.height/2);
      addOffset = (addOffset + 1) % 6;
      addItem(def, p.x + addOffset*20, p.y + addOffset*20);
    }
  };
  tile.addEventListener('pointerup', end);
  tile.addEventListener('pointercancel', end);
}

function addItem(def, cx, cy){
  const it = {id:uid(), kind:def.kind, name:def.name, x:0, y:0, w:def.w, h:def.h, rot:0};
  if (plan.units === 'ft' && def.kind === 'room'){ it.w = snapV(def.w * 0.9144); it.h = snapV(def.h * 0.9144); } // round-ish imperial sizes
  placeAtCentre(it, cx, cy);
  floor().items.push(it);
  sel = it.id; commit(); render(); showPanel();
  if (FP.isOpening(it) && !floor().items.some(FP.isRoom)) toast('Tip: drop doors and windows on a wall and they snap into place.');
}

// ---------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------
const toUnit = cm => plan.units === 'ft' ? Math.round(cm/30.48*10)/10 : Math.round(cm)/100;
const fromUnit = v => plan.units === 'ft' ? v*30.48 : v*100;

function showPanel(){
  const props = $('props'), pal = $('palette'), tabs = document.querySelector('.dock-tabs');
  const it = sel && findItem(sel);
  if (!it){ props.hidden = true; pal.hidden = false; tabs.hidden = false; return; }
  props.hidden = false; pal.hidden = true; tabs.hidden = true;
  const U = plan.units === 'ft' ? 'ft' : 'm', stepU = plan.units === 'ft' ? 0.5 : 0.1;
  const depthLocked = it.kind === 'door' || it.kind === 'dbldoor' || !!FP.FIXED_DEPTH[it.kind];
  props.innerHTML = `
    <div class="props-head"><input id="pName" type="text" maxlength="60" aria-label="Name"></div>
    <div class="props-grid">
      <div class="field"><label for="pW">${FP.isRoom(it) ? 'Width' : 'Width'} (${U})</label><input id="pW" type="number" inputmode="decimal" step="${stepU}" min="0.1"></div>
      <div class="field"><label for="pH">${FP.isRoom(it) ? 'Length' : 'Depth'} (${U})</label><input id="pH" type="number" inputmode="decimal" step="${stepU}" min="0.1" ${depthLocked ? 'disabled' : ''}></div>
    </div>
    <div class="area" id="pArea"></div>
    <div class="props-actions">
      <button id="pRot" type="button">⟳ Rotate</button>
      <button id="pDup" type="button">Duplicate</button>
      <button id="pDel" type="button" class="danger">Delete</button>
      <button id="pOk" type="button" class="ok">Done</button>
    </div>`;
  const nm = $('pName'); nm.value = it.name || '';
  nm.addEventListener('input', () => { it.name = nm.value.slice(0,60); render(); });
  nm.addEventListener('change', commit);
  const applySize = () => {
    const w = parseFloat($('pW').value), h = parseFloat($('pH').value);
    if (isFinite(w) && w > 0) it.w = Math.max(10, fromUnit(w));
    if (isFinite(h) && h > 0 && !depthLocked) it.h = Math.max(10, fromUnit(h));
    if (it.kind === 'door') it.h = it.w; else if (it.kind === 'dbldoor') it.h = it.w/2;
    render(); $('pArea').textContent = areaText(it);
  };
  $('pW').addEventListener('input', applySize); $('pH').addEventListener('input', applySize);
  $('pW').addEventListener('change', commit); $('pH').addEventListener('change', commit);
  $('pRot').onclick = () => { rotateItem(it); commit(); render(); updatePanelNumbers(); };
  $('pDup').onclick = () => {
    const c = Object.assign({}, it, {id:uid(), x:it.x + 40, y:it.y + 40});
    floor().items.push(c); sel = c.id; commit(); render(); showPanel();
  };
  $('pDel').onclick = deleteSelected;
  $('pOk').onclick = () => { sel = null; render(); showPanel(); };
  updatePanelNumbers();
}
function areaText(it){ return FP.isRoom(it) ? 'Floor area ' + FP.fmtArea(it.w*it.h, plan.units) : ''; }
function updatePanelNumbers(){
  const it = sel && findItem(sel); if (!it || $('props').hidden) return;
  const w = $('pW'), h = $('pH');
  if (w && document.activeElement !== w) w.value = toUnit(it.w);
  if (h && document.activeElement !== h) h.value = toUnit(it.h);
  if ($('pArea')) $('pArea').textContent = areaText(it);
}
function deleteSelected(){
  if (!sel) return;
  floor().items = floor().items.filter(i => i.id !== sel);
  sel = null; commit(); render(); showPanel();
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------
function buildFloors(){
  const el = $('floors'); el.innerHTML = '';
  plan.floors.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'floor-tab' + (i === cur ? ' active' : '');
    b.textContent = f.name;
    b.title = i === cur ? 'Tap again to rename' : '';
    b.onclick = () => {
      if (i === cur){
        const name = prompt('Rename this floor', f.name);
        if (name && name.trim()){ f.name = name.trim().slice(0,40); commit(); buildFloors(); }
        return;
      }
      cur = i; sel = null; buildFloors(); showPanel(); fit();
    };
    el.appendChild(b);
  });
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'floor-tab add'; add.textContent = '+ Floor';
  add.onclick = () => {
    plan.floors.push({id:uid(), name:'Floor ' + (plan.floors.length + 1), items:[]});
    cur = plan.floors.length - 1; sel = null; commit(); buildFloors(); showPanel(); fit();
  };
  el.appendChild(add);
  if (plan.floors.length > 1){
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'floor-tab add'; del.textContent = 'Delete floor';
    del.style.color = 'var(--danger)';
    del.onclick = () => {
      if (!confirm(`Delete "${floor().name}" and everything on it?`)) return;
      plan.floors.splice(cur, 1); cur = Math.max(0, cur-1); sel = null; commit(); buildFloors(); showPanel(); fit();
    };
    el.appendChild(del);
  }
}

// ---------------------------------------------------------------------------
// Sheets: menu, export, about
// ---------------------------------------------------------------------------
function openSheet(id){ $(id).hidden = false; }
function closeSheets(){ document.querySelectorAll('.sheet-wrap').forEach(s => s.hidden = true); }
document.querySelectorAll('.sheet-wrap').forEach(w => w.addEventListener('click', e => {
  if (e.target === w || e.target.dataset.act === 'close') closeSheets();
}));

$('menuBtn').onclick = () => { syncSeg(); openSheet('menuSheet'); };
$('menuSheet').addEventListener('click', e => {
  const act = e.target.dataset && e.target.dataset.act;
  if (act === 'new'){ if (confirm('Start a new, empty plan? You can undo this.')){ const u = plan.units; plan = blankPlan(); plan.units = u; afterLoad(false); } closeSheets(); }
  if (act === 'sample'){ if (confirm('Replace the current plan with the sample apartment? You can undo this.')){ plan = samplePlan(); afterLoad(false); } closeSheets(); }
  if (act === 'import'){ $('fileInput').click(); closeSheets(); }
  if (act === 'about'){ closeSheets(); buildAbout(); openSheet('aboutSheet'); }
});
function syncSeg(){ document.querySelectorAll('#unitSeg button').forEach(b => b.classList.toggle('on', b.dataset.u === plan.units)); }
$('unitSeg').addEventListener('click', e => {
  const u = e.target.dataset.u; if (!u) return;
  plan.units = u; syncSeg(); commit(); render(); showPanel();
});

$('fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try { plan = sanitizePlan(await f.text()); afterLoad(false); toast('Plan opened'); }
  catch(err){ toast(err.message || 'Could not open that file'); }
});

// load a new plan; keepHistory=false still lets "undo" go back to the previous plan
function afterLoad(fresh){
  cur = 0; sel = null; $('planName').value = plan.name;
  if (fresh) resetHistory(); else commit();
  buildFloors(); showPanel(); fit();
}

$('planName').addEventListener('input', e => { plan.name = e.target.value.slice(0,80) || 'Floor plan'; });
$('planName').addEventListener('change', commit);

// --- export ---
let deliver = 'download';
const canShareFiles = !!(navigator.canShare && navigator.canShare({files:[new File(['x'], 'x.txt', {type:'text/plain'})]}));
function buildExport(){
  $('shareRow').hidden = !canShareFiles;
  document.querySelectorAll('#deliverSeg button').forEach(b => b.classList.toggle('on', b.dataset.d === deliver));
  const list = $('formatList'); list.innerHTML = '';
  FP.FORMATS.filter(f => !allowedFormats || allowedFormats.includes(f.id)).forEach(f => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'fmt';
    b.innerHTML = `<b>${FP.esc(f.label)}</b><small>${FP.esc(f.desc)}</small>`;
    b.onclick = () => doExport(f.id);
    list.appendChild(b);
  });
}
$('deliverSeg').addEventListener('click', e => { if (e.target.dataset.d){ deliver = e.target.dataset.d; buildExport(); } });
$('exportBtn').onclick = () => { buildExport(); openSheet('exportSheet'); };

async function doExport(id){
  try {
    toast('Preparing file…', 900);
    const out = await FP.runExport(id, plan, floor());
    closeSheets();
    if (deliver === 'share' && canShareFiles){
      const file = new File([out.blob], out.filename, {type:out.mime});
      try { await navigator.share({files:[file], title:plan.name}); return; }
      catch(e){ if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(out.blob); a.download = out.filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved ' + out.filename);
    bridge.emit({type:'exported', format:id, filename:out.filename});
  } catch(err){ toast(err.message || 'Export failed'); }
}

// ---------------------------------------------------------------------------
// Toast, buttons, keyboard
// ---------------------------------------------------------------------------
let toastT = 0;
function toast(msg, ms){
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2600);
}
$('undoBtn').onclick = undo; $('redoBtn').onclick = redo; $('fitBtn').onclick = fit;
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing){ e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing){ e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === 'Escape'){ closeSheets(); if (sel){ sel = null; render(); showPanel(); } }
  const it = sel && findItem(sel); if (!it) return;
  if (e.key === 'Delete' || e.key === 'Backspace'){ e.preventDefault(); deleteSelected(); }
  else if (e.key === 'r' || e.key === 'R'){ rotateItem(it); commit(); render(); updatePanelNumbers(); }
  else if (e.key.startsWith('Arrow')){
    e.preventDefault();
    const d = step() * (e.shiftKey ? 10 : 1);
    if (e.key === 'ArrowLeft') it.x -= d; if (e.key === 'ArrowRight') it.x += d;
    if (e.key === 'ArrowUp') it.y -= d; if (e.key === 'ArrowDown') it.y += d;
    commit(); render();
  }
});
window.addEventListener('resize', () => render());

// ---------------------------------------------------------------------------
// Bridge for host apps: iframe postMessage, React Native, iOS WKWebView, Android WebView
// ---------------------------------------------------------------------------
const bridge = {
  emit(msg){
    msg = Object.assign({source:'mobile-floorplan', version:PLAN_VERSION}, msg);
    if (inFrame){
      // before the host says hello we only announce that we're ready, with no plan data
      if (msg.type === 'ready') window.parent.postMessage({source:msg.source, version:msg.version, type:'ready'}, hostOrigin || '*');
      else if (hostOrigin) window.parent.postMessage(msg, hostOrigin);
    }
    try {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.mobileFloorplan) window.webkit.messageHandlers.mobileFloorplan.postMessage(msg);
      if (window.MobileFloorplanAndroid && window.MobileFloorplanAndroid.postMessage) window.MobileFloorplanAndroid.postMessage(JSON.stringify(msg));
    } catch(e){ console.warn(e); }
  },
  async handle(m){
    if (!m || typeof m !== 'object') return;
    const reply = extra => bridge.emit(Object.assign({requestId:m.requestId}, extra));
    try {
      switch(m.type){
        case 'init':
        case 'setOptions':
          if (m.formats !== undefined) allowedFormats = Array.isArray(m.formats) ? parseFormats(m.formats.join(',') || 'none') : null;
          if (m.theme) document.documentElement.dataset.theme = m.theme === 'dark' ? 'dark' : 'light';
          if (m.plan){ plan = sanitizePlan(m.plan); cur = 0; sel = null; resetHistory(); }
          if (m.units === 'm' || m.units === 'ft') plan.units = m.units;
          if (typeof m.name === 'string') plan.name = str(m.name, plan.name);
          $('planName').value = plan.name; $('exportBtn').hidden = allowedFormats && !allowedFormats.length;
          $('doneBtn').hidden = false;
          snap = JSON.stringify(plan); buildFloors(); showPanel(); fit();
          reply({type: m.type === 'init' ? 'initialized' : 'optionsSet', plan:JSON.parse(snap)});
          break;
        case 'load':
          plan = sanitizePlan(m.plan); afterLoad(true); reply({type:'loaded', plan:JSON.parse(snap)}); break;
        case 'getPlan':
          reply({type:'plan', plan:JSON.parse(JSON.stringify(plan))}); break;
        case 'export': {
          const fi = Number.isInteger(m.floor) && plan.floors[m.floor] ? m.floor : cur;
          const out = await FP.runExport(String(m.format||'png'), plan, plan.floors[fi]);
          const buf = new Uint8Array(await out.blob.arrayBuffer());
          let bin = ''; for (let i=0;i<buf.length;i+=0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i+0x8000));
          reply({type:'export', format:m.format, filename:out.filename, mime:out.mime, base64:btoa(bin)});
          break;
        }
        default: reply({type:'error', message:'Unknown message type: ' + m.type});
      }
    } catch(err){ reply({type:'error', message:err.message || String(err)}); }
  },
};

window.addEventListener('message', e => {
  if (!inFrame || e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== 'object' || m.target !== 'mobile-floorplan') return;
  const origin = e.origin === 'null' ? '*' : e.origin;
  if (params.get('origin') && e.origin !== params.get('origin')) return;
  if (!hostOrigin) hostOrigin = origin;         // first host message pins the origin we talk to
  else if (hostOrigin !== origin && hostOrigin !== '*') return;
  bridge.handle(m);
});

// Native hosts call this with evaluateJavascript / injectJavaScript.
window.MobileFloorplan = {
  receive: m => bridge.handle(typeof m === 'string' ? JSON.parse(m) : m),
  getPlan: () => JSON.parse(JSON.stringify(plan)),
  loadPlan: p => bridge.handle({type:'load', plan:p}),
  exportFile: (format, floorIndex) => FP.runExport(format, plan, plan.floors[floorIndex ?? cur]),
};

// "Done": hand the plan back to the host (and follow the return link if one was given)
$('doneBtn').hidden = !(embedded || returnUrl);
$('doneBtn').onclick = () => {
  commit();
  bridge.emit({type:'save', plan:JSON.parse(snap)});
  if (returnUrl){
    const where = returnUrl.host || returnUrl.protocol.replace(':','');
    if (!confirm(`Send this floor plan back to ${where}?`)) return;
    const u = new URL(returnUrl.href);
    u.hash = 'plan=' + b64u.enc(snap);
    location.href = u.href;
  } else toast('Plan sent to the app');
};
if (allowedFormats && !allowedFormats.length) $('exportBtn').hidden = true;
if (params.get('theme') === 'dark' || params.get('theme') === 'light') document.documentElement.dataset.theme = params.get('theme');

// ---------------------------------------------------------------------------
// About page with the embedding guide
// ---------------------------------------------------------------------------
function code(s){ return `<pre><button class="copy" type="button">Copy</button><code>${FP.esc(s.trim())}</code></pre>`; }
function buildAbout(){
  const A = APP_URL;
  const rows = FP.FORMATS.map(f => `<tr><td><b>${FP.esc(f.label)}</b><br><code>${f.id}</code></td><td>${FP.esc(f.desc)}</td></tr>`).join('');
  $('aboutBody').innerHTML = `
  <h2>Mobile Floorplan</h2>
  <p>Draw a floor plan on your phone, then save it in the format the next app needs. It runs entirely in your browser. Plans are not uploaded anywhere.</p>

  <h3>How to draw</h3>
  <ul>
    <li><b>Add things:</b> drag a tile from the bottom bar up onto the grid, or tap it to drop it in the middle.</li>
    <li><b>Move:</b> drag it. Rooms line up with neighbouring walls. Doors and windows snap onto the nearest wall and face into the room.</li>
    <li><b>Resize:</b> drag the blue dot, or type exact sizes in the panel.</li>
    <li><b>Pan and zoom:</b> drag empty space, pinch with two fingers, or use the mouse wheel.</li>
    <li><b>Floors:</b> use <b>+ Floor</b>; tap the current floor's name to rename it.</li>
    <li>Your plan saves itself in this browser. Undo and redo are at the top.</li>
  </ul>

  <h3>Export formats</h3>
  <table>${rows}</table>

  <h3>Add it to your app</h3>
  <p>Other apps can use this editor as their floor plan generator. You can link out to it, embed it in a web page, or load it in a mobile WebView. No API key is needed. You can also host your own copy of these static files.</p>

  <p><b>1. Link out and get the plan back.</b> Send people here with a <code>return</code> address. When they tap <b>Done</b>, the editor opens that address with the plan in the fragment (<code>#plan=</code>, base64url JSON). The fragment never reaches your server logs.</p>
  ${code(`<a href="${A}?return=${encodeURIComponent('https://yourapp.example/floorplan-done')}&units=m">
  Draw a floor plan
</a>

<!-- on https://yourapp.example/floorplan-done -->
<script src="${A}sdk/mobile-floorplan-sdk.js"></script>
<script>
  const plan = MobileFloorplan.readReturn(); // null if nothing came back
<\/script>`)}
  <p>Custom schemes work too, e.g. <code>return=myapp://floorplan</code>, so a native app can catch the result.</p>

  <p><b>2. Embed it in a web page (iframe + SDK).</b></p>
  ${code(`<div id="planner" style="height:640px"></div>
<script src="${A}sdk/mobile-floorplan-sdk.js"></script>
<script>
  const editor = MobileFloorplan.embed('#planner', {
    units: 'ft',                        // 'm' or 'ft'
    formats: ['png', 'pdf', 'dxf'],     // optional: limit the Export menu
    plan: savedPlanOrNull,              // optional: open an existing plan
    onChange: plan => autosave(plan),   // every edit
    onSave:   plan => submit(plan),     // user tapped Done
  });

  // Ask for a file without the user leaving your page:
  const {blob, filename} = await editor.export('pdf');
  const plan = await editor.getPlan();
  editor.load(otherPlan);
<\/script>`)}

  <p><b>3. Raw postMessage</b>, if you would rather not load the SDK. Frame <code>${A}?embed=1&amp;origin=https://yourapp.example</code>, wait for <code>{source:'mobile-floorplan', type:'ready'}</code>, then post messages with <code>target:'mobile-floorplan'</code>:</p>
  ${code(`frame.contentWindow.postMessage(
  { target: 'mobile-floorplan', type: 'init', plan, units: 'm' },
  '${location.origin}'
);
frame.contentWindow.postMessage(
  { target: 'mobile-floorplan', type: 'export', format: 'png', requestId: 1 },
  '${location.origin}'
);
// replies arrive as { source:'mobile-floorplan', type:'export', requestId:1,
//                     filename, mime, base64 }`)}
  <table>
    <tr><th>You send (<code>type</code>)</th><th>What happens</th></tr>
    <tr><td><code>init</code></td><td>Handshake. Optional <code>plan</code>, <code>units</code>, <code>name</code>, <code>formats</code>, <code>theme</code>. Replies <code>initialized</code>.</td></tr>
    <tr><td><code>load</code></td><td>Replace the plan. Replies <code>loaded</code>.</td></tr>
    <tr><td><code>getPlan</code></td><td>Replies <code>plan</code> with the current plan JSON.</td></tr>
    <tr><td><code>export</code></td><td><code>format</code> (any id above), optional <code>floor</code> index. Replies <code>export</code> with <code>base64</code>, <code>filename</code>, <code>mime</code>.</td></tr>
    <tr><td><code>setOptions</code></td><td>Change <code>units</code>, <code>formats</code> or <code>theme</code>.</td></tr>
    <tr><th>You receive</th><th></th></tr>
    <tr><td><code>ready</code></td><td>Editor loaded. Send <code>init</code>.</td></tr>
    <tr><td><code>change</code></td><td>Any edit, with <code>plan</code>.</td></tr>
    <tr><td><code>save</code></td><td>User tapped Done, with <code>plan</code>.</td></tr>
    <tr><td><code>exported</code></td><td>User saved a file themselves (<code>format</code>, <code>filename</code>).</td></tr>
    <tr><td><code>error</code></td><td><code>message</code>, plus the <code>requestId</code> it answers.</td></tr>
  </table>
  <p>Echo a <code>requestId</code> on any message to match it with its reply. The editor only answers the origin that first talked to it, or the one named in <code>origin=</code>.</p>

  <p><b>4. Native apps (WebView).</b> Load <code>${A}?embed=1</code>. The editor sends every event to whichever bridge it finds, and you call <code>window.MobileFloorplan.receive(msg)</code> to talk back.</p>
  ${code(`// React Native (react-native-webview)
<WebView
  ref={web}
  source={{ uri: '${A}?embed=1&units=m' }}
  onMessage={e => {
    const msg = JSON.parse(e.nativeEvent.data);
    if (msg.type === 'ready') web.current.injectJavaScript(
      \`MobileFloorplan.receive(\${JSON.stringify({type:'init', plan})}); true;\`);
    if (msg.type === 'save') savePlan(msg.plan);
  }}
/>`)}
  ${code(`// Android (Kotlin)
webView.settings.javaScriptEnabled = true
webView.addJavascriptInterface(object {
  @JavascriptInterface fun postMessage(json: String) { handle(JSONObject(json)) }
}, "MobileFloorplanAndroid")
webView.loadUrl("${A}?embed=1")
// send: webView.evaluateJavascript("MobileFloorplan.receive($json)", null)`)}
  ${code(`// iOS (Swift, WKWebView)
config.userContentController.add(self, name: "mobileFloorplan")
webView.load(URLRequest(url: URL(string: "${A}?embed=1")!))
// receive: userContentController(_:didReceive:) -> message.body is a dictionary
// send:    webView.evaluateJavaScript("MobileFloorplan.receive(\\(json))")`)}

  <p><b>URL parameters</b></p>
  <table>
    <tr><td><code>embed=1</code></td><td>Embedded mode: shows <b>Done</b>, starts empty, and does not keep a copy in browser storage.</td></tr>
    <tr><td><code>units=m|ft</code></td><td>Starting units.</td></tr>
    <tr><td><code>name=</code></td><td>Starting plan name.</td></tr>
    <tr><td><code>formats=png,pdf</code></td><td>Limit the Export menu. <code>formats=none</code> hides it.</td></tr>
    <tr><td><code>return=URL</code></td><td>Where <b>Done</b> sends the plan (<code>#plan=</code>).</td></tr>
    <tr><td><code>origin=URL</code></td><td>Only accept messages from this origin.</td></tr>
    <tr><td><code>#plan=</code> or <code>plan=</code></td><td>Open this plan (base64url JSON).</td></tr>
    <tr><td><code>theme=light|dark</code></td><td>Force a colour theme.</td></tr>
    <tr><td><code>storage=0|1</code></td><td>Turn browser autosave off or on.</td></tr>
  </table>

  <p><b>Plan format.</b> Plain JSON, with every length in centimetres:</p>
  ${code(`{
  "format": "mobile-floorplan", "version": 1,
  "name": "My flat", "units": "m",
  "floors": [{
    "id": "f1", "name": "Ground floor",
    "items": [
      { "id": "a", "kind": "room", "name": "Kitchen",
        "x": 0, "y": 0, "w": 320, "h": 280, "rot": 0 },
      { "id": "b", "kind": "door", "name": "Door",
        "x": 40, "y": 0, "w": 80, "h": 80, "rot": 0 }
    ]
  }]
}`)}
  <p><code>kind</code> is <code>room</code>, an opening (<code>door</code>, <code>dbldoor</code>, <code>slider</code>, <code>window</code>, <code>opening</code>) or a furniture type such as <code>bed</code>, <code>sofa</code> or <code>toilet</code>. <code>rot</code> is 0, 90, 180 or 270.</p>

  <p><b>Credit.</b> The small "Service provided by zkitszo" mark stays on the editor and on exported images when you embed it.</p>
  <p>The full guide and a working demo page are in the project's <code>EMBEDDING.md</code> and <code>examples/</code> folder.</p>

  <div class="credit">Mobile Floorplan · MIT licence<br>Service provided by <b>zkitszo</b></div>`;
  $('aboutBody').querySelectorAll('.copy').forEach(b => b.onclick = () => {
    const t = b.nextElementSibling.textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Copied'), () => toast('Copy failed'));
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
$('planName').value = plan.name;
buildPalette(); buildFloors(); showPanel(); resetHistory();
requestAnimationFrame(fit);
bridge.emit({type:'ready'});
if ('serviceWorker' in navigator && location.protocol === 'https:' && !embedded) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
