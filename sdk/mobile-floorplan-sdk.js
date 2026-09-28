/*! Mobile Floorplan SDK - embed the floor plan editor in any web page.
 *  MIT licence. Service provided by zkitszo.
 *
 *  const editor = MobileFloorplan.embed('#el', { units:'m', onSave: plan => ... });
 *  await editor.export('pdf')   -> { blob, filename, mime }
 *  await editor.getPlan()       -> plan JSON
 *  editor.load(plan); editor.setOptions({units:'ft'}); editor.destroy();
 *
 *  MobileFloorplan.linkUrl({ returnUrl, units, plan }) -> URL string to send people to
 *  MobileFloorplan.readReturn()                        -> plan from "#plan=" or null
 */
(function(root){
  'use strict';
  var script = document.currentScript;
  // default editor location: the folder above /sdk/ that this script was loaded from
  var DEFAULT_SRC = script && script.src ? script.src.replace(/sdk\/[^/]*$/, '') : 'https://misssophiesterling.github.io/mobile-floorplan/';

  function b64uEncode(str){
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64uDecode(s){
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    var bin = atob(s), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function base64ToBlob(b64, mime){
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], {type: mime});
  }

  function embed(target, opts){
    opts = opts || {};
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('MobileFloorplan.embed: container not found');
    var src = new URL(opts.src || DEFAULT_SRC, location.href);
    var appOrigin = src.origin;
    var q = src.searchParams;
    q.set('embed', '1');
    if (location.origin && location.origin !== 'null') q.set('origin', location.origin);
    if (opts.units) q.set('units', opts.units);
    if (opts.theme) q.set('theme', opts.theme);
    if (opts.storage !== undefined) q.set('storage', opts.storage ? '1' : '0');

    var iframe = document.createElement('iframe');
    iframe.src = src.href;
    iframe.title = opts.title || 'Floor plan editor';
    iframe.allow = 'clipboard-write; web-share';
    iframe.style.cssText = 'width:100%;height:' + (opts.height || '100%') + ';border:0;display:block;border-radius:inherit';
    el.appendChild(iframe);

    var ready = false, queue = [], pending = {}, nextId = 1, destroyed = false;

    function post(msg){
      msg.target = 'mobile-floorplan';
      if (!ready) { queue.push(msg); return; }
      iframe.contentWindow.postMessage(msg, appOrigin);
    }
    function request(msg, timeoutMs){
      return new Promise(function(resolve, reject){
        var id = 'r' + (nextId++);
        msg.requestId = id;
        var t = setTimeout(function(){ delete pending[id]; reject(new Error('Floor plan editor did not answer')); }, timeoutMs || 30000);
        pending[id] = function(reply){
          clearTimeout(t); delete pending[id];
          if (reply.type === 'error') reject(new Error(reply.message)); else resolve(reply);
        };
        post(msg);
      });
    }

    function onMessage(e){
      if (e.source !== iframe.contentWindow || e.origin !== appOrigin) return;
      var m = e.data;
      if (!m || m.source !== 'mobile-floorplan') return;
      if (m.type === 'ready' && !ready){
        ready = true;
        iframe.contentWindow.postMessage({
          target: 'mobile-floorplan', type: 'init', plan: opts.plan || undefined,
          units: opts.units, name: opts.name, formats: opts.formats, theme: opts.theme
        }, appOrigin);
        queue.splice(0).forEach(function(msg){ iframe.contentWindow.postMessage(msg, appOrigin); });
        return;
      }
      if (m.requestId && pending[m.requestId]) { pending[m.requestId](m); return; }
      if (m.type === 'initialized' && opts.onReady) opts.onReady(m.plan);
      if (m.type === 'change' && opts.onChange) opts.onChange(m.plan);
      if (m.type === 'save' && opts.onSave) opts.onSave(m.plan);
      if (m.type === 'exported' && opts.onExport) opts.onExport(m);
      if (m.type === 'error' && opts.onError) opts.onError(new Error(m.message));
    }
    window.addEventListener('message', onMessage);

    return {
      iframe: iframe,
      load: function(plan){ return request({type: 'load', plan: plan}).then(function(r){ return r.plan; }); },
      getPlan: function(){ return request({type: 'getPlan'}).then(function(r){ return r.plan; }); },
      setOptions: function(o){ return request(Object.assign({type: 'setOptions'}, o)).then(function(r){ return r.plan; }); },
      export: function(format, o){
        return request({type: 'export', format: format, floor: o && o.floor}, 60000).then(function(r){
          return {blob: base64ToBlob(r.base64, r.mime), filename: r.filename, mime: r.mime};
        });
      },
      destroy: function(){
        if (destroyed) return; destroyed = true;
        window.removeEventListener('message', onMessage);
        iframe.remove();
      }
    };
  }

  function linkUrl(o){
    o = o || {};
    var u = new URL(o.src || DEFAULT_SRC, location.href);
    if (o.returnUrl) u.searchParams.set('return', o.returnUrl);
    if (o.units) u.searchParams.set('units', o.units);
    if (o.name) u.searchParams.set('name', o.name);
    if (o.formats) u.searchParams.set('formats', [].concat(o.formats).join(','));
    if (o.plan) u.hash = 'plan=' + b64uEncode(JSON.stringify(o.plan));
    return u.href;
  }

  function readReturn(hash){
    var h = new URLSearchParams(String(hash === undefined ? location.hash : hash).replace(/^#/, ''));
    var p = h.get('plan');
    if (!p) return null;
    try { return JSON.parse(b64uDecode(p)); } catch (e) { return null; }
  }

  root.MobileFloorplan = {embed: embed, linkUrl: linkUrl, readReturn: readReturn, version: 1};
})(window);
