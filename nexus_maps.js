/* Nexus Maps v1.0.0 - Modern Intelligent Mapping Library 🗺️ */
/* Smart coding patterns for minimal code, maximum functionality */

(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = globalThis || global || self, global.Nexus = factory());
})(this, function() {
  'use strict';

  // ============================================================================
  // SMART UTILITIES - One-liners with maximum power
  // ============================================================================
  const $ = {
    // Object utilities
    extend: (t, ...s) => Object.assign(t, ...s),
    clone: o => JSON.parse(JSON.stringify(o)),
    get: (o, p, d) => p.split('.').reduce((a, v) => a?.[v], o) ?? d,
    
    // Function utilities
    bind: (fn, ctx, ...args) => fn.bind(ctx, ...args),
    once: fn => { let ran; return (...args) => ran ? ran : (ran = fn(...args)); },
    debounce: (fn, ms) => { let t; return (...a) => (clearTimeout(t), t = setTimeout(() => fn(...a), ms)); },
    throttle: (fn, ms) => { let w, l = 0; return (...a) => { const n = Date.now(); if (n - l >= ms) { l = n; fn(...a); } else { clearTimeout(w); w = setTimeout(() => { l = Date.now(); fn(...a); }, ms - (n - l)); } }; },
    
    // Array utilities
    chunk: (a, n) => Array.from({length: Math.ceil(a.length / n)}, (_, i) => a.slice(i * n, i * n + n)),
    unique: a => [...new Set(a)],
    
    // String utilities
    template: (s, d) => s.replace(/\{(\w+)\}/g, (_, k) => d[k] ?? ''),
    
    // DOM utilities
    qs: (s, p = document) => p.querySelector(s),
    qsa: (s, p = document) => [...p.querySelectorAll(s)],
    create: (t, c, p) => { const e = document.createElement(t); if (c) e.className = c; if (p) p.appendChild(e); return e; },
    remove: e => e?.parentNode?.removeChild(e),
    
    // Math utilities
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    
    // Animation
    raf: fn => requestAnimationFrame(fn),
    caf: id => cancelAnimationFrame(id),
    
    // Detection
    isTouch: 'ontouchstart' in window,
    isRetina: window.devicePixelRatio > 1,
    is3d: (() => { const t = document.createElement('div').style; return 'WebKitCSSMatrix' in window || 'MozPerspective' in t; })()
  };

  // ============================================================================
  // SMART EVENT SYSTEM - Proxy-based reactive events
  // ============================================================================
  class EventEmitter {
    constructor() {
      this._events = new Map();
    }
    
    on(type, fn, ctx) {
      if (typeof type === 'object') return Object.entries(type).forEach(([t, f]) => this.on(t, f, fn)), this;
      const types = type.split(' ');
      types.forEach(t => {
        if (!this._events.has(t)) this._events.set(t, []);
        this._events.get(t).push({ fn, ctx });
      });
      return this;
    }
    
    off(type, fn) {
      if (!type) return this._events.clear(), this;
      const types = type.split(' ');
      types.forEach(t => {
        if (!fn) this._events.delete(t);
        else {
          const listeners = this._events.get(t);
          if (listeners) this._events.set(t, listeners.filter(l => l.fn !== fn));
        }
      });
      return this;
    }
    
    fire(type, data = {}) {
      const listeners = this._events.get(type);
      if (!listeners) return this;
      listeners.forEach(({ fn, ctx }) => fn.call(ctx || this, { type, ...data }));
      return this;
    }
    
    once(type, fn, ctx) {
      const wrapped = (...args) => { this.off(type, wrapped); fn.call(ctx || this, ...args); };
      return this.on(type, wrapped, ctx);
    }
  }

  // ============================================================================
  // SMART GEOMETRY - Immutable, chainable, fluent API
  // ============================================================================
  
  // Point class with operator overloading simulation
  class Point {
    constructor(x, y) {
      this.x = +x || 0;
      this.y = +y || 0;
    }
    
    // Fluent operations
    add(p) { return new Point(this.x + p.x, this.y + p.y); }
    sub(p) { return new Point(this.x - p.x, this.y - p.y); }
    mul(n) { return new Point(this.x * n, this.y * n); }
    div(n) { return new Point(this.x / n, this.y / n); }
    
    // Utilities
    dist(p) { return $.dist(this.x, this.y, p.x, p.y); }
    eq(p) { return this.x === p.x && this.y === p.y; }
    round() { return new Point(Math.round(this.x), Math.round(this.y)); }
    floor() { return new Point(Math.floor(this.x), Math.floor(this.y)); }
    clone() { return new Point(this.x, this.y); }
    
    static from(v) {
      if (v instanceof Point) return v;
      if (Array.isArray(v)) return new Point(v[0], v[1]);
      if (v && 'x' in v && 'y' in v) return new Point(v.x, v.y);
      return new Point(0, 0);
    }
  }
  
  // LatLng with smart conversion
  class LatLng {
    constructor(lat, lng, alt) {
      this.lat = +lat;
      this.lng = +lng;
      if (alt !== undefined) this.alt = +alt;
    }
    
    dist(other) {
      const R = 6371e3;
      const φ1 = this.lat * Math.PI / 180;
      const φ2 = other.lat * Math.PI / 180;
      const Δφ = (other.lat - this.lat) * Math.PI / 180;
      const Δλ = (other.lng - this.lng) * Math.PI / 180;
      const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
    
    eq(other, margin = 1e-9) {
      return Math.abs(this.lat - other.lat) <= margin && Math.abs(this.lng - other.lng) <= margin;
    }
    
    static from(v) {
      if (v instanceof LatLng) return v;
      if (Array.isArray(v)) return new LatLng(v[0], v[1], v[2]);
      if (v && 'lat' in v) return new LatLng(v.lat, v.lng || v.lon, v.alt);
      return null;
    }
  }
  
  // Bounds with smart containment
  class Bounds {
    constructor(a, b) {
      const points = b ? [Point.from(a), Point.from(b)] : (Array.isArray(a) ? a.map(Point.from) : []);
      this.min = new Point(Infinity, Infinity);
      this.max = new Point(-Infinity, -Infinity);
      points.forEach(p => this.extend(p));
    }
    
    extend(p) {
      p = Point.from(p);
      this.min = new Point(Math.min(this.min.x, p.x), Math.min(this.min.y, p.y));
      this.max = new Point(Math.max(this.max.x, p.x), Math.max(this.max.y, p.y));
      return this;
    }
    
    getCenter() { return new Point((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2); }
    getSize() { return this.max.sub(this.min); }
    contains(p) { p = Point.from(p); return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y; }
    intersects(b) { return b.max.x >= this.min.x && b.min.x <= this.max.x && b.max.y >= this.min.y && b.min.y <= this.max.y; }
  }
  
  // LatLngBounds
  class LatLngBounds {
    constructor(sw, ne) {
      if (sw) {
        const latlngs = ne ? [sw, ne] : (Array.isArray(sw) ? sw : [sw]);
        latlngs.forEach(ll => this.extend(ll));
      }
    }
    
    extend(obj) {
      const ll = LatLng.from(obj);
      if (!this._sw && !this._ne) {
        this._sw = new LatLng(ll.lat, ll.lng);
        this._ne = new LatLng(ll.lat, ll.lng);
      } else {
        this._sw.lat = Math.min(ll.lat, this._sw.lat);
        this._sw.lng = Math.min(ll.lng, this._sw.lng);
        this._ne.lat = Math.max(ll.lat, this._ne.lat);
        this._ne.lng = Math.max(ll.lng, this._ne.lng);
      }
      return this;
    }
    
    getCenter() { return new LatLng((this._sw.lat + this._ne.lat) / 2, (this._sw.lng + this._ne.lng) / 2); }
    getSW() { return this._sw; }
    getNE() { return this._ne; }
    contains(ll) { ll = LatLng.from(ll); return ll.lat >= this._sw.lat && ll.lat <= this._ne.lat && ll.lng >= this._sw.lng && ll.lng <= this._ne.lng; }
  }

  // ============================================================================
  // SMART PROJECTION - Minimal Web Mercator
  // ============================================================================
  const Projection = {
    MAX_LAT: 85.0511287798,
    R: 6378137,
    
    project(latlng) {
      const d = Math.PI / 180;
      const lat = $.clamp(latlng.lat, -this.MAX_LAT, this.MAX_LAT);
      const sin = Math.sin(lat * d);
      return new Point(
        this.R * latlng.lng * d,
        this.R * Math.log((1 + sin) / (1 - sin)) / 2
      );
    },
    
    unproject(point) {
      const d = 180 / Math.PI;
      return new LatLng(
        (2 * Math.atan(Math.exp(point.y / this.R)) - Math.PI / 2) * d,
        point.x * d / this.R
      );
    },
    
    scale(zoom) { return 256 * Math.pow(2, zoom); },
    zoom(scale) { return Math.log2(scale / 256); }
  };

  // ============================================================================
  // SMART LAYER SYSTEM - Composition over inheritance
  // ============================================================================
  class Layer extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = { pane: 'overlayPane', ...options };
      this._map = null;
    }
    
    addTo(map) { map.addLayer(this); return this; }
    remove() { this._map?.removeLayer(this); return this; }
    
    onAdd(map) { this._map = map; }
    onRemove() { this._map = null; }
  }

  // ============================================================================
  // SMART MARKER - Minimal DOM manipulation
  // ============================================================================
  class Marker extends Layer {
    constructor(latlng, options = {}) {
      super(options);
      this._latlng = LatLng.from(latlng);
      this.options = {
        icon: '📍',
        draggable: false,
        ...options
      };
    }
    
    onAdd(map) {
      super.onAdd(map);
      if (!this._el) {
        this._el = $.create('div', 'nexus-marker', map._container);
        this._el.innerHTML = typeof this.options.icon === 'string' ? this.options.icon : '📍';
        this._el.style.cssText = 'position:absolute;font-size:32px;cursor:pointer;user-select:none;';
        this._el.addEventListener('click', () => this.fire('click'));
        
        if (this.options.draggable) this._makeDraggable();
      }
      this._update();
    }
    
    onRemove() {
      $.remove(this._el);
      this._el = null;
      super.onRemove();
    }
    
    setLatLng(latlng) {
      this._latlng = LatLng.from(latlng);
      this._update();
      return this;
    }
    
    getLatLng() { return this._latlng; }
    
    _update() {
      if (!this._map || !this._el) return;
      const pos = this._map.latLngToContainerPoint(this._latlng);
      this._el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    }
    
    _makeDraggable() {
      let dragging = false;
      this._el.addEventListener('mousedown', e => {
        dragging = true;
        e.preventDefault();
      });
      document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const point = new Point(e.clientX, e.clientY);
        this._latlng = this._map.containerPointToLatLng(point);
        this._update();
        this.fire('drag');
      });
      document.addEventListener('mouseup', () => {
        if (dragging) {
          dragging = false;
          this.fire('dragend');
        }
      });
    }
  }

  // ============================================================================
  // SMART TILE LAYER - Efficient tile management
  // ============================================================================
  class TileLayer extends Layer {
    constructor(url, options = {}) {
      super(options);
      this._url = url;
      this._tiles = new Map();
      this.options = {
        minZoom: 0,
        maxZoom: 18,
        tileSize: 256,
        subdomains: 'abc',
        ...options
      };
    }
    
    onAdd(map) {
      super.onAdd(map);
      this._container = $.create('div', 'nexus-tiles', map._panes.tilePane);
      this._container.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;';
      this._update();
    }
    
    onRemove() {
      $.remove(this._container);
      this._tiles.clear();
      super.onRemove();
    }
    
    _update() {
      if (!this._map) return;
      
      const zoom = Math.floor(this._map.getZoom());
      const bounds = this._map.getPixelBounds();
      const tileSize = this.options.tileSize;
      
      const tileBounds = new Bounds(
        bounds.min.div(tileSize).floor(),
        bounds.max.div(tileSize).floor()
      );
      
      // Remove old tiles
      const currentTiles = new Set();
      for (let y = tileBounds.min.y; y <= tileBounds.max.y; y++) {
        for (let x = tileBounds.min.x; x <= tileBounds.max.x; x++) {
          const key = `${x}:${y}:${zoom}`;
          currentTiles.add(key);
          if (!this._tiles.has(key)) this._createTile(x, y, zoom);
        }
      }
      
      // Clean up
      this._tiles.forEach((tile, key) => {
        if (!currentTiles.has(key)) {
          $.remove(tile);
          this._tiles.delete(key);
        }
      });
    }
    
    _createTile(x, y, z) {
      const tile = new Image();
      const key = `${x}:${y}:${z}`;
      
      tile.style.cssText = `position:absolute;width:${this.options.tileSize}px;height:${this.options.tileSize}px;left:${x * this.options.tileSize}px;top:${y * this.options.tileSize}px;`;
      tile.src = $.template(this._url, {
        s: this.options.subdomains[Math.abs(x + y) % this.options.subdomains.length],
        x, y, z
      });
      
      this._container.appendChild(tile);
      this._tiles.set(key, tile);
    }
  }

  // ============================================================================
  // SMART POPUP - Minimal overlay
  // ============================================================================
  class Popup extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = { maxWidth: 300, ...options };
      this._content = '';
    }
    
    setContent(content) { this._content = content; this._update(); return this; }
    setLatLng(latlng) { this._latlng = LatLng.from(latlng); this._update(); return this; }
    
    openOn(map) {
      this._map = map;
      if (!this._el) {
        this._el = $.create('div', 'nexus-popup', map._container);
        this._el.style.cssText = `position:absolute;background:white;padding:12px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.15);max-width:${this.options.maxWidth}px;pointer-events:auto;`;
        
        const close = $.create('button', 'close', this._el);
        close.innerHTML = '×';
        close.style.cssText = 'position:absolute;top:4px;right:4px;border:none;background:none;font-size:20px;cursor:pointer;';
        close.onclick = () => this.remove();
        
        this._contentEl = $.create('div', 'content', this._el);
      }
      this._update();
      return this;
    }
    
    remove() {
      $.remove(this._el);
      this._el = null;
      return this;
    }
    
    _update() {
      if (!this._map || !this._el) return;
      this._contentEl.innerHTML = this._content;
      if (this._latlng) {
        const pos = this._map.latLngToContainerPoint(this._latlng);
        this._el.style.transform = `translate(${pos.x}px, ${pos.y - 10}px) translate(-50%, -100%)`;
      }
    }
  }

  // ============================================================================
  // SMART MAP - The intelligent core
  // ============================================================================
  class NexusMap extends EventEmitter {
    constructor(container, options = {}) {
      super();
      
      this.options = {
        center: [0, 0],
        zoom: 2,
        minZoom: 0,
        maxZoom: 18,
        zoomControl: true,
        ...options
      };
      
      this._container = typeof container === 'string' ? $.qs(container) : container;
      this._layers = [];
      this._zoom = this.options.zoom;
      this._center = LatLng.from(this.options.center);
      
      this._init();
    }
    
    _init() {
      // Setup container
      this._container.style.cssText = 'position:relative;overflow:hidden;background:#e0e0e0;';
      this._container.innerHTML = '';
      
      // Create panes
      this._panes = {
        mapPane: $.create('div', 'nexus-map-pane', this._container),
        tilePane: $.create('div', 'nexus-tile-pane'),
        overlayPane: $.create('div', 'nexus-overlay-pane')
      };
      
      this._panes.mapPane.style.cssText = 'position:absolute;left:0;top:0;';
      this._panes.mapPane.append(this._panes.tilePane, this._panes.overlayPane);
      
      // Setup interactions
      this._setupInteractions();
      
      // Add zoom control
      if (this.options.zoomControl) this._addZoomControl();
      
      // Initial update
      this._update();
    }
    
    _setupInteractions() {
      let dragging = false, start = null, startCenter = null;
      
      // Pan
      this._container.addEventListener('mousedown', e => {
        dragging = true;
        start = new Point(e.clientX, e.clientY);
        startCenter = this._center.clone ? this._center : LatLng.from(this._center);
        this._container.style.cursor = 'grabbing';
      });
      
      document.addEventListener('mousemove', e => {
        if (!dragging) return;
        const delta = new Point(e.clientX - start.x, e.clientY - start.y);
        const centerPoint = this.latLngToContainerPoint(startCenter);
        this._center = this.containerPointToLatLng(centerPoint.sub(delta));
        this._update();
        this.fire('move');
      });
      
      document.addEventListener('mouseup', () => {
        if (dragging) {
          dragging = false;
          this._container.style.cursor = '';
          this.fire('moveend');
        }
      });
      
      // Zoom
      this._container.addEventListener('wheel', e => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.5 : 0.5;
        const mousePos = new Point(e.clientX - this._container.getBoundingClientRect().left, e.clientY - this._container.getBoundingClientRect().top);
        const latLng = this.containerPointToLatLng(mousePos);
        
        this._zoom = $.clamp(this._zoom + delta, this.options.minZoom, this.options.maxZoom);
        
        // Zoom to mouse position
        const newPoint = this.latLngToContainerPoint(latLng);
        const center = this.getCenter();
        const centerPoint = this.latLngToContainerPoint(center);
        const offset = mousePos.sub(newPoint);
        this._center = this.containerPointToLatLng(centerPoint.add(offset));
        
        this._update();
        this.fire('zoom');
      }, { passive: false });
      
      // Double click zoom
      this._container.addEventListener('dblclick', e => {
        const mousePos = new Point(e.clientX - this._container.getBoundingClientRect().left, e.clientY - this._container.getBoundingClientRect().top);
        this.setView(this.containerPointToLatLng(mousePos), this._zoom + 1);
      });
    }
    
    _addZoomControl() {
      const control = $.create('div', 'nexus-zoom-control', this._container);
      control.style.cssText = 'position:absolute;top:10px;right:10px;background:white;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,0.2);overflow:hidden;';
      
      const zoomIn = $.create('button', 'zoom-in', control);
      zoomIn.innerHTML = '+';
      zoomIn.style.cssText = 'display:block;width:32px;height:32px;border:none;background:white;cursor:pointer;font-size:18px;font-weight:bold;';
      zoomIn.onclick = () => this.zoomIn();
      
      const zoomOut = $.create('button', 'zoom-out', control);
      zoomOut.innerHTML = '−';
      zoomOut.style.cssText = 'display:block;width:32px;height:32px;border:none;background:white;cursor:pointer;font-size:18px;font-weight:bold;border-top:1px solid #ddd;';
      zoomOut.onclick = () => this.zoomOut();
    }
    
    _update() {
      this._layers.forEach(layer => {
        if (layer._update) layer._update();
        else if (layer.onAdd) layer._updatePosition?.();
      });
      this.fire('viewupdate');
    }
    
    // Public API
    setView(center, zoom) {
      this._center = LatLng.from(center);
      this._zoom = $.clamp(zoom, this.options.minZoom, this.options.maxZoom);
      this._update();
      return this;
    }
    
    getCenter() { return this._center; }
    getZoom() { return this._zoom; }
    
    zoomIn(delta = 1) { return this.setView(this._center, this._zoom + delta); }
    zoomOut(delta = 1) { return this.setView(this._center, this._zoom - delta); }
    
    panTo(latlng) { return this.setView(latlng, this._zoom); }
    
    addLayer(layer) {
      this._layers.push(layer);
      layer.onAdd(this);
      return this;
    }
    
    removeLayer(layer) {
      const idx = this._layers.indexOf(layer);
      if (idx > -1) {
        this._layers.splice(idx, 1);
        layer.onRemove();
      }
      return this;
    }
    
    // Coordinate conversions
    latLngToContainerPoint(latlng) {
      const projected = Projection.project(LatLng.from(latlng));
      const centerProjected = Projection.project(this._center);
      const scale = Projection.scale(this._zoom);
      const size = this.getSize();
      
      return new Point(
        ((projected.x - centerProjected.x) * scale + size.x / 2),
        ((projected.y - centerProjected.y) * scale + size.y / 2)
      );
    }
    
    containerPointToLatLng(point) {
      const size = this.getSize();
      const scale = Projection.scale(this._zoom);
      const centerProjected = Projection.project(this._center);
      
      const worldPoint = new Point(
        (point.x - size.x / 2) / scale + centerProjected.x,
        (point.y - size.y / 2) / scale + centerProjected.y
      );
      
      return Projection.unproject(worldPoint);
    }
    
    getSize() {
      const rect = this._container.getBoundingClientRect();
      return new Point(rect.width, rect.height);
    }
    
    getPixelBounds() {
      const size = this.getSize();
      const half = size.div(2);
      const center = new Point(size.x / 2, size.y / 2);
      return new Bounds(center.sub(half), center.add(half));
    }
  }

  // ============================================================================
  // SMART FACTORY FUNCTIONS - Fluent API
  // ============================================================================
  const Nexus = {
    version: '1.0.0',
    
    // Core
    map: (container, options) => new NexusMap(container, options),
    
    // Layers
    marker: (latlng, options) => new Marker(latlng, options),
    tileLayer: (url, options) => new TileLayer(url, options),
    popup: (options) => new Popup(options),
    
    // Geometry
    latLng: (lat, lng, alt) => new LatLng(lat, lng, alt),
    point: (x, y) => new Point(x, y),
    bounds: (a, b) => new Bounds(a, b),
    latLngBounds: (sw, ne) => new LatLngBounds(sw, ne),
    
    // Classes (for extending)
    Map: NexusMap,
    Layer,
    Marker,
    TileLayer,
    Popup,
    LatLng,
    Point,
    Bounds,
    LatLngBounds,
    
    // Utilities
    $
  };

  return Nexus;
});

// ============================================================================
// USAGE EXAMPLES
// ============================================================================
/*

// Create a map
const map = Nexus.map('map', {
  center: [33.5731, -7.5898], // Casablanca
  zoom: 13
});

// Add OpenStreetMap tiles
Nexus.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  subdomains: 'abc'
}).addTo(map);

// Add a marker
const marker = Nexus.marker([33.5731, -7.5898], {
  icon: '🇲🇦',
  draggable: true
}).addTo(map);

// Add popup
marker.on('click', () => {
  Nexus.popup()
    .setLatLng(marker.getLatLng())
    .setContent('<h3>Casablanca</h3><p>Welcome to Morocco! 🇲🇦</p>')
    .openOn(map);
});

// Event handling
map.on('zoom', () => console.log('Zoom:', map.getZoom()));
map.on('move', () => console.log('Center:', map.getCenter()));

*/