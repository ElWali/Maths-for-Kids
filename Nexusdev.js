/* Nexus Maps v1.2.3 - Modern Intelligent Mapping Library 🗺️ */
/* MIT License | (c) 2025 Nexus Maps Authors */
/* Fixes: tile wrapping, memory leaks, XSS guard, z-index, resize robustness, accessibility, edge cases */
(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = globalThis || global || self, global.Nexus = factory());
})(this, function() {
  'use strict';
  // ============================================================================
  // SMART UTILITIES - Enhanced with error handling and performance
  // ============================================================================
  const $ = {
    // Object utilities
    extend: (t, ...s) => Object.assign(t, ...s),
    clone: o => JSON.parse(JSON.stringify(o)),
    get: (o, p, d) => p.split('.').reduce((a, v) => a?.[v], o) ?? d,
    // Function utilities
    bind: (fn, ctx, ...args) => fn.bind(ctx, ...args),
    once: fn => { let ran; return (...args) => ran !== undefined ? ran : (ran = fn(...args)); },
    debounce: (fn, ms) => { let t; return (...a) => (clearTimeout(t), t = setTimeout(() => fn(...a), ms)); },
    throttle: (fn, ms) => { let w, l = 0; return (...a) => { const n = Date.now(); if (n - l >= ms) { l = n; fn(...a); } else { clearTimeout(w); w = setTimeout(() => { l = n; fn(...a); }, ms - (n - l)); } }; },
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
  // SMART EVENT SYSTEM - Enhanced with error boundaries
  // ============================================================================
  class EventEmitter {
    constructor() {
      this._events = new Map();
    }
    on(type, fn, ctx) {
      if (typeof type === 'object') return Object.entries(type).forEach(([t, f]) => this.on(t, f, fn)), this;
      if (typeof fn !== 'function') throw new Error('EventEmitter.on: listener must be a function');
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
      listeners.forEach(({ fn, ctx }) => {
        try {
          fn.call(ctx || this, { type, target: this, ...data });
        } catch (e) {
          console.error(`EventEmitter error in "${type}" handler:`, e);
        }
      });
      return this;
    }
    once(type, fn, ctx) {
      const wrapped = (...args) => { this.off(type, wrapped); fn.call(ctx || this, ...args); };
      return this.on(type, wrapped, ctx);
    }
  }
  // ============================================================================
  // SMART GEOMETRY - Enhanced validation and utilities
  // ============================================================================
  class Point {
    constructor(x, y) {
      this.x = +x || 0;
      this.y = +y || 0;
    }
    add(p) { return new Point(this.x + p.x, this.y + p.y); }
    sub(p) { return new Point(this.x - p.x, this.y - p.y); }
    mul(n) { return new Point(this.x * n, this.y * n); }
    div(n) { 
      if (n === 0) throw new Error('Point.div: division by zero');
      return new Point(this.x / n, this.y / n); 
    }
    dist(p) { return $.dist(this.x, this.y, p.x, p.y); }
    eq(p, tolerance = 0) { 
      return Math.abs(this.x - p.x) <= tolerance && Math.abs(this.y - p.y) <= tolerance; 
    }
    round() { return new Point(Math.round(this.x), Math.round(this.y)); }
    floor() { return new Point(Math.floor(this.x), Math.floor(this.y)); }
    ceil() { return new Point(Math.ceil(this.x), Math.ceil(this.y)); }
    clone() { return new Point(this.x, this.y); }
    static from(v) {
      if (v instanceof Point) return v;
      if (Array.isArray(v)) return new Point(v[0], v[1]);
      if (v && typeof v === 'object' && 'x' in v && 'y' in v) return new Point(v.x, v.y);
      return new Point(0, 0);
    }
  }
  class LatLng {
    constructor(lat, lng, alt) {
      if (lat == null || lng == null) {
        throw new Error('LatLng: lat and lng must be provided');
      }
      lat = +lat;
      lng = +lng;
      if (isNaN(lat) || isNaN(lng)) {
        throw new Error('LatLng: invalid numeric values');
      }
      if (Math.abs(lat) > 90) {
        throw new Error('LatLng: latitude must be between -90 and 90');
      }
      if (Math.abs(lng) > 180) {
        throw new Error('LatLng: longitude must be between -180 and 180');
      }
      this.lat = lat;
      this.lng = lng;
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
    wrap() {
      let lng = this.lng;
      while (lng > 180) lng -= 360;
      while (lng < -180) lng += 360;
      return new LatLng(this.lat, lng, this.alt);
    }
    static from(v) {
      if (v instanceof LatLng) return v;
      if (Array.isArray(v)) {
        if (v.length < 2) return null;
        return new LatLng(v[0], v[1], v[2]);
      }
      if (v && typeof v === 'object') {
        if ('lat' in v) return new LatLng(v.lat, v.lng || v.lon, v.alt);
        if ('latitude' in v) return new LatLng(v.latitude, v.longitude, v.altitude);
      }
      return null;
    }
  }
  class Bounds {
    constructor(a, b) {
      this.min = new Point(Infinity, Infinity);
      this.max = new Point(-Infinity, -Infinity);
      if (b) {
        this.extend(a);
        this.extend(b);
      } else if (Array.isArray(a)) {
        a.forEach(p => this.extend(p));
      } else if (a) {
        this.extend(a);
      }
    }
    extend(p) {
      p = Point.from(p);
      this.min = new Point(Math.min(this.min.x, p.x), Math.min(this.min.y, p.y));
      this.max = new Point(Math.max(this.max.x, p.x), Math.max(this.max.y, p.y));
      return this;
    }
    getCenter() { return new Point((this.min.x + this.max.x) / 2, (this.min.y + this.max.y) / 2); }
    getSize() { return this.max.sub(this.min); }
    contains(p) { 
      p = Point.from(p);
      return p.x >= this.min.x && p.x <= this.max.x && p.y >= this.min.y && p.y <= this.max.y; 
    }
    intersects(b) { 
      return b.max.x >= this.min.x && b.min.x <= this.max.x && 
             b.max.y >= this.min.y && b.min.y <= this.max.y; 
    }
    isValid() { 
      return isFinite(this.min.x) && isFinite(this.min.y) && 
             isFinite(this.max.x) && isFinite(this.max.y); 
    }
  }
  class LatLngBounds {
    constructor(sw, ne) {
      this._sw = null;
      this._ne = null;
      if (sw) {
        const latlngs = ne ? [sw, ne] : (Array.isArray(sw) ? sw : [sw]);
        latlngs.forEach(ll => this.extend(ll));
      }
    }
    extend(obj) {
      const ll = LatLng.from(obj);
      if (!ll) return this;
      if (!this._sw || !this._ne) {
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
    getCenter() { 
      if (!this.isValid()) return null;
      return new LatLng(
        (this._sw.lat + this._ne.lat) / 2, 
        (this._sw.lng + this._ne.lng) / 2
      ); 
    }
    getSW() { return this._sw; }
    getNE() { return this._ne; }
    contains(ll) { 
      ll = LatLng.from(ll);
      if (!ll || !this.isValid()) return false;
      return ll.lat >= this._sw.lat && ll.lat <= this._ne.lat && 
             ll.lng >= this._sw.lng && ll.lng <= this._ne.lng; 
    }
    isValid() { 
      return this._sw !== null && this._ne !== null && 
             this._sw.lat <= this._ne.lat && this._sw.lng <= this._ne.lng; 
    }
  }
  // ============================================================================
  // SMART PROJECTION - Enhanced with error handling
  // ============================================================================
  const Projection = {
    MAX_LAT: 85.0511287798,
    R: 6378137,
    project(latlng) {
      if (!(latlng instanceof LatLng)) {
        throw new Error('Projection.project: expected LatLng instance');
      }
      const d = Math.PI / 180;
      const lat = $.clamp(latlng.lat, -this.MAX_LAT, this.MAX_LAT);
      const sin = Math.sin(lat * d);
      const y = this.R * Math.log((1 + sin) / (1 - sin)) / 2;
      return new Point(this.R * latlng.lng * d, y);
    },
    unproject(point) {
      if (!(point instanceof Point)) {
        throw new Error('Projection.unproject: expected Point instance');
      }
      const d = 180 / Math.PI;
      const lat = (2 * Math.atan(Math.exp(point.y / this.R)) - Math.PI / 2) * d;
      const lng = point.x * d / this.R;
      // Clamp latitude to valid range to prevent invalid LatLng
      const clampedLat = $.clamp(lat, -90, 90);
      return new LatLng(clampedLat, lng);
    },
    scale(zoom) { 
      if (zoom < 0) throw new Error('Projection.scale: zoom must be >= 0');
      return 256 * Math.pow(2, zoom); 
    },
    zoom(scale) { 
      if (scale <= 0) throw new Error('Projection.zoom: scale must be > 0');
      return Math.log2(scale / 256); 
    }
  };
  // ============================================================================
  // SMART LAYER SYSTEM - Enhanced lifecycle
  // ============================================================================
  class Layer extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = { pane: 'overlayPane', ...options };
      this._map = null;
    }
    addTo(map) { 
      if (!(map instanceof NexusMap)) {
        throw new Error('Layer.addTo: map must be a NexusMap instance');
      }
      map.addLayer(this); 
      return this; 
    }
    remove() { this._map?.removeLayer(this); return this; }
    onAdd(map) { this._map = map; }
    onRemove() { this._map = null; }
  }
  // ============================================================================
  // SMART MARKER - Enhanced with accessibility and performance
  // ============================================================================
  class Marker extends Layer {
    constructor(latlng, options = {}) {
      super(options);
      this._latlng = LatLng.from(latlng);
      if (!this._latlng) {
        throw new Error('Marker: invalid LatLng provided');
      }
      this.options = {
        icon: '📍',
        draggable: false,
        title: '',
        alt: 'Map marker',
        className: 'nexus-marker',
        ...options
      };
      this._dragHandlers = null;
      this._el = null;
    }
    onAdd(map) {
      super.onAdd(map);
      if (!this._el) {
        this._el = $.create('div', this.options.className, map._panes.overlayPane);
        this._el.setAttribute('role', 'button');
        this._el.setAttribute('tabindex', '0');
        if (this.options.title) {
          this._el.setAttribute('title', this.options.title);
          this._el.setAttribute('aria-label', this.options.title);
        }
        this._el.setAttribute('aria-roledescription', 'map marker');
        if (this.options.alt && !this.options.title) {
          this._el.setAttribute('aria-label', this.options.alt);
        }
        if (typeof this.options.icon === 'string') {
          this._el.innerHTML = this.options.icon;
        } else if (this.options.icon instanceof HTMLElement) {
          this._el.appendChild(this.options.icon);
        } else {
          this._el.textContent = '📍';
        }
        this._el.style.cssText = `
          position: absolute;
          font-size: 32px;
          cursor: pointer;
          user-select: none;
          pointer-events: auto;
          will-change: transform;
        `;
        this._el.addEventListener('click', this._onClick.bind(this));
        this._el.addEventListener('keydown', this._onKeyDown.bind(this));
        if (this.options.draggable) this._makeDraggable();
      }
      this._update();
    }
    onRemove() {
      if (this._dragHandlers) {
        this._dragHandlers.forEach(({ target, type, handler, options }) => {
          target.removeEventListener(type, handler, options);
        });
        this._dragHandlers = null;
      }
      this._el?.removeEventListener('click', this._onClick);
      this._el?.removeEventListener('keydown', this._onKeyDown);
      $.remove(this._el);
      this._el = null;
      super.onRemove();
    }
    setLatLng(latlng) {
      this._latlng = LatLng.from(latlng);
      if (!this._latlng) {
        throw new Error('Marker.setLatLng: invalid LatLng provided');
      }
      this._update();
      return this;
    }
    getLatLng() { return this._latlng; }
    _update() {
      if (!this._map || !this._el) return;
      const pos = this._map.latLngToContainerPoint(this._latlng);
      this._el.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
    }
    _onClick(e) {
      e.stopPropagation();
      this.fire('click', { originalEvent: e });
    }
    _onKeyDown(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._onClick(e);
      }
    }
    _makeDraggable() {
      this._dragHandlers = [];
      const startDrag = (e) => {
        e.preventDefault();
        this._dragging = true;
        this._dragStartPoint = this._getEventPoint(e);
        this._dragStartLatLng = this._latlng.clone();
        this._el.style.cursor = 'grabbing';
        this._el.setAttribute('aria-grabbed', 'true');
        this.fire('dragstart', { originalEvent: e });
      };
      const doDrag = (e) => {
        if (!this._dragging) return;
        const point = this._getEventPoint(e);
        const containerPoint = this._map._container.getBoundingClientRect();
        const localPoint = new Point(
          point.x - containerPoint.left,
          point.y - containerPoint.top
        );
        this._latlng = this._map.containerPointToLatLng(localPoint);
        this._update();
        this.fire('drag', { originalEvent: e });
      };
      const endDrag = (e) => {
        if (this._dragging) {
          this._dragging = false;
          this._el.style.cursor = 'grab';
          this._el.setAttribute('aria-grabbed', 'false');
          this.fire('dragend', { originalEvent: e, latlng: this._latlng });
        }
      };
      const addHandler = (target, type, handler, options = {}) => {
        target.addEventListener(type, handler, options);
        this._dragHandlers.push({ target, type, handler, options });
      };
      const events = $.isTouch ? 
        ['touchstart', 'touchmove', 'touchend'] : 
        ['mousedown', 'mousemove', 'mouseup'];
      if ($.isTouch) {
        addHandler(this._el, 'touchstart', (e) => startDrag(e.touches[0]), { passive: false });
        addHandler(document, 'touchmove', (e) => doDrag(e.touches[0]), { passive: false });
        addHandler(document, 'touchend', endDrag);
      } else {
        addHandler(this._el, 'mousedown', startDrag);
        addHandler(document, 'mousemove', doDrag);
        addHandler(document, 'mouseup', endDrag);
      }
      this._el.style.cursor = 'grab';
      this._el.setAttribute('aria-grabbed', 'false');
    }
    _getEventPoint(e) {
      return new Point(
        e.clientX !== undefined ? e.clientX : e.pageX,
        e.clientY !== undefined ? e.clientY : e.pageY
      );
    }
  }
  // ============================================================================
  // SMART TILE LAYER - Enhanced with loading states, error handling, and world wrapping
  // ============================================================================
  class TileLayer extends Layer {
    constructor(url, options = {}) {
      super(options);
      this._url = url;
      this._tiles = new Map();
      this._attributionEl = null;
      this._loadingCount = 0;
      this._updateHandler = this._update.bind(this);
      this.options = {
        minZoom: 0,
        maxZoom: 19,
        tileSize: 256,
        subdomains: 'abc',
        attribution: '',
        detectRetina: false,
        keepBuffer: 2,
        ...options
      };
      if (this.options.detectRetina && $.isRetina && this.options.maxZoom > 0) {
        this.options.maxZoom--;
        this.options.tileSize = Math.floor(this.options.tileSize * 2);
      }
    }
    onAdd(map) {
      super.onAdd(map);
      this._container = $.create('div', 'nexus-tiles', map._panes.tilePane);
      this._container.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        will-change: transform;
      `;
      if (this.options.attribution) {
        this._attributionEl = $.create('div', 'nexus-attribution', map._container);
        this._attributionEl.setAttribute('aria-label', 'Map data attribution');
        this._attributionEl.style.cssText = `
          position: absolute;
          bottom: 0;
          right: 0;
          background: rgba(255, 255, 255, 0.7);
          padding: 4px 8px;
          font-size: 11px;
          z-index: 1000;
          border-top-left-radius: 4px;
        `;
        this._attributionEl.innerHTML = this.options.attribution;
      }
      this._update();
      map.on('moveend zoom', this._updateHandler, this);
    }
    onRemove() {
      if (this._map) {
        this._map.off('moveend zoom', this._updateHandler, this);
      }
      if (this._attributionEl) {
        $.remove(this._attributionEl);
        this._attributionEl = null;
      }
      $.remove(this._container);
      this._clearTiles();
      super.onRemove();
    }
    _update() {
      if (!this._map) return;
      const zoom = Math.round(this._map.getZoom());
      if (zoom < this.options.minZoom || zoom > this.options.maxZoom) {
        this._clearTiles();
        return;
      }
      const pixelBounds = this._map.getPixelBounds();
      const tileSize = this.options.tileSize;
      const buffer = this.options.keepBuffer;
      const scale = Projection.scale(zoom);
      const tileBounds = new Bounds(
        pixelBounds.min.div(tileSize / scale).floor().sub(new Point(buffer, buffer)),
        pixelBounds.max.div(tileSize / scale).ceil().add(new Point(buffer, buffer))
      );
      const currentTiles = new Set();
      const maxTiles = Math.pow(2, zoom);
      for (let y = tileBounds.min.y; y <= tileBounds.max.y; y++) {
        for (let x = tileBounds.min.x; x <= tileBounds.max.x; x++) {
          // Normalize x for world wrapping
          let normX = x;
          if (this._map.options.worldCopyJump && maxTiles > 0) {
            normX = ((x % maxTiles) + maxTiles) % maxTiles;
          }
          const key = `${normX}:${y}:${zoom}`;
          currentTiles.add(key);
          if (!this._tiles.has(key)) {
            this._createTile(normX, y, zoom, x, pixelBounds.min, scale);
          }
        }
      }
      this._tiles.forEach((tile, key) => {
        if (!currentTiles.has(key)) {
          this._removeTile(key);
        }
      });
    }
    _clearTiles() {
      this._tiles.forEach((tile, key) => this._removeTile(key));
      this._tiles.clear();
    }
    _createTile(normX, y, z, originalX, worldOrigin, scale) {
      const key = `${normX}:${y}:${z}`;
      const tile = $.create('img', 'nexus-tile');
      const tileSize = this.options.tileSize;
      // Use originalX for positioning to preserve visual continuity during wrap
      const pixelX = (originalX * tileSize / scale - worldOrigin.x) * scale;
      const pixelY = (y * tileSize / scale - worldOrigin.y) * scale;
      tile.style.cssText = `
        position: absolute;
        width: ${tileSize}px;
        height: ${tileSize}px;
        left: ${pixelX}px;
        top: ${pixelY}px;
        opacity: 0;
        transition: opacity 0.2s;
        will-change: opacity, transform;
      `;
      tile.setAttribute('role', 'presentation');
      tile.setAttribute('alt', '');
      const handleError = () => {
        tile.style.opacity = '0.5';
        tile.style.background = '#f8f8f8';
        tile.style.border = '1px solid #ddd';
        this.fire('tileerror', { tile, coords: { x: originalX, y, z } });
      };
      const handleLoad = () => {
        tile.style.opacity = '1';
        this._loadingCount--;
        this.fire('tileload', { tile, coords: { x: originalX, y, z } });
        if (this._loadingCount === 0) {
          this.fire('load');
        }
      };
      tile.addEventListener('load', handleLoad);
      tile.addEventListener('error', handleError);
      // Use normX in URL to avoid redundant tile requests across world copies
      const s = this.options.subdomains[Math.abs(normX + y) % this.options.subdomains.length];
      tile.src = $.template(this._url, { s, x: normX, y, z });
      this._container.appendChild(tile);
      this._tiles.set(key, { el: tile, load: handleLoad, error: handleError });
      this._loadingCount++;
    }
    _removeTile(key) {
      const tileInfo = this._tiles.get(key);
      if (tileInfo) {
        tileInfo.el.removeEventListener('load', tileInfo.load);
        tileInfo.el.removeEventListener('error', tileInfo.error);
        $.remove(tileInfo.el);
      }
      this._tiles.delete(key);
    }
  }
  // ============================================================================
  // SMART POPUP - Enhanced with accessibility, lifecycle, and memory safety
  // ============================================================================
  class Popup extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = { 
        maxWidth: 300, 
        minWidth: 50,
        autoClose: true,
        closeOnEscape: true,
        className: 'nexus-popup',
        ...options 
      };
      this._content = '';
      this._handlers = null;
      this._el = null;
      this._contentEl = null;
      this._closeTimeout = null;
    }
    setContent(content) {
      // Removed unsafeHTML support entirely for security
      this._content = content;
      this._update(); 
      return this; 
    }
    setLatLng(latlng) { 
      this._latlng = LatLng.from(latlng); 
      this._update(); 
      return this; 
    }
    openOn(map) {
      if (this._el) return this; // Prevent duplicate creation
      this._map = map;
      if (!map._panes.popupPane) {
        map._panes.popupPane = $.create('div', 'nexus-popup-pane', map._container);
        map._panes.popupPane.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          pointer-events: none;
          z-index: var(--nexus-popup-z-index, 10000);
        `;
        map._panes.mapPane.appendChild(map._panes.popupPane);
      }
      this._el = $.create('div', this.options.className, map._panes.popupPane);
      this._el.setAttribute('role', 'dialog');
      this._el.setAttribute('aria-modal', 'true');
      this._el.setAttribute('tabindex', '-1');
      if (this.options.ariaLabel) {
        this._el.setAttribute('aria-label', this.options.ariaLabel);
      }
      this._el.style.cssText = `
        position: absolute;
        background: white;
        padding: 12px 32px 12px 12px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
        max-width: ${this.options.maxWidth}px;
        min-width: ${this.options.minWidth}px;
        pointer-events: auto;
        z-index: var(--nexus-popup-z-index, 10000);
        transform: translate(-50%, -100%);
        transition: transform 0.2s, opacity 0.2s;
        opacity: 0;
      `;
      const close = $.create('button', 'nexus-popup-close', this._el);
      close.type = 'button'; // Prevent form submission
      close.innerHTML = '×';
      close.setAttribute('aria-label', 'Close popup');
      close.style.cssText = `
        position: absolute;
        top: 4px;
        right: 4px;
        border: none;
        background: none;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
        line-height: 1;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
      close.onmouseenter = () => close.style.background = 'rgba(0,0,0,0.1)';
      close.onmouseleave = () => close.style.background = 'none';
      this._contentEl = $.create('div', 'nexus-popup-content', this._el);
      this._contentEl.style.cssText = 'overflow: auto; max-height: 300px;';
      this._handlers = [];
      const addHandler = (el, type, handler, options) => {
        el.addEventListener(type, handler, options);
        this._handlers.push({ el, type, handler, options });
      };
      addHandler(close, 'click', (e) => {
        e.stopPropagation();
        this.remove();
      });
      addHandler(this._el, 'click', (e) => {
        if (e.target === this._el) {
          this.remove();
        }
      });
      if (this.options.closeOnEscape) {
        addHandler(document, 'keydown', (e) => {
          if (e.key === 'Escape' && this._el) {
            this.remove();
          }
        });
      }
      addHandler(this._el, 'focusin', () => {
        if (this._el) this._el.focus();
      });
      requestAnimationFrame(() => {
        if (this._el) {
          this._el.style.opacity = '1';
          this._el.style.transform = 'translate(-50%, -100%)';
        }
      });
      this._update();
      this.fire('open');
      return this;
    }
    remove() {
      if (!this._el) return this; // Early exit if already removed
      if (this._closeTimeout) {
        clearTimeout(this._closeTimeout);
        this._closeTimeout = null;
      }
      if (this._handlers) {
        this._handlers.forEach(({ el, type, handler, options }) => {
          el.removeEventListener(type, handler, options);
        });
        this._handlers = null;
      }
      this._map = null;
      this._el.style.opacity = '0';
      this._el.style.transform = 'translate(-50%, -90%)';
      this._closeTimeout = setTimeout(() => {
        if (this._el) $.remove(this._el);
        this._el = null;
        this._contentEl = null;
        this._closeTimeout = null;
        this.fire('close');
      }, 200);
      return this;
    }
    _update() {
      if (!this._map || !this._el) return;
      if (typeof this._content === 'string') {
        this._contentEl.textContent = this._content;
      } else if (this._content instanceof HTMLElement) {
        this._contentEl.replaceChildren(this._content);
      } else {
        this._contentEl.textContent = String(this._content);
      }
      if (this._latlng) {
        const pos = this._map.latLngToContainerPoint(this._latlng);
        this._el.style.left = `${pos.x}px`;
        this._el.style.top = `${pos.y - 10}px`;
      }
    }
  }
  // ============================================================================
  // SMART MAP - Enhanced with robustness, accessibility, and world wrapping
  // ============================================================================
  class NexusMap extends EventEmitter {
    constructor(container, options = {}) {
      super();
      this.options = {
        center: [0, 0],
        zoom: 2,
        minZoom: 0,
        maxZoom: 19,
        zoomControl: true,
        zoomDelta: 1.0,
        trackResize: true,
        inertia: true,
        inertiaDeceleration: 3000,
        inertiaMaxSpeed: 1500,
        worldCopyJump: false,
        ...options
      };
      this._container = typeof container === 'string' ? $.qs(container) : container;
      if (!this._container) {
        throw new Error('NexusMap: container not found');
      }
      this._layers = [];
      this._zoom = $.clamp(this.options.zoom, this.options.minZoom, this.options.maxZoom);
      this._center = LatLng.from(this.options.center);
      if (!this._center) {
        throw new Error('NexusMap: invalid center provided');
      }
      this._interactionHandlers = null;
      this._resizeObserver = null;
      this._init();
    }
    _init() {
      this._container.style.cssText = `
        position: relative;
        overflow: hidden;
        background: #e0e0e0;
        touch-action: none;
        outline: none;
      `;
      this._container.setAttribute('role', 'application');
      this._container.setAttribute('aria-label', 'Interactive map');
      this._container.tabIndex = 0;
      this._container.innerHTML = '';
      this._panes = {
        mapPane: $.create('div', 'nexus-map-pane', this._container),
        tilePane: $.create('div', 'nexus-tile-pane'),
        overlayPane: $.create('div', 'nexus-overlay-pane')
      };
      this._panes.mapPane.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        transform-origin: 0 0;
        will-change: transform;
      `;
      this._panes.mapPane.append(this._panes.tilePane, this._panes.overlayPane);
      this._setupInteractions();
      if (this.options.zoomControl) this._addZoomControl();
      if (this.options.trackResize) {
        this._setupResizeObserver();
      }
      this._update();
    }
    _setupInteractions() {
      this._interactionHandlers = [];
      const addHandler = (target, type, handler, options) => {
        target.addEventListener(type, handler, options);
        this._interactionHandlers.push({ target, type, handler, options });
      };
      let dragging = false;
      let start = null;
      let startCenter = null;
      let lastTouchDistance = 0;
      let touchCenter = null;
      let velocity = new Point(0, 0);
      let lastMoveTime = 0;
      const getEventPoint = (e) => {
        const rect = this._container.getBoundingClientRect();
        if (e.touches && e.touches.length) {
          return new Point(
            e.touches[0].clientX - rect.left,
            e.touches[0].clientY - rect.top
          );
        }
        return new Point(
          e.clientX - rect.left,
          e.clientY - rect.top
        );
      };
      const getTouchCenter = (touches) => {
        const rect = this._container.getBoundingClientRect();
        const x = (touches[0].clientX + touches[1].clientX) / 2 - rect.left;
        const y = (touches[0].clientY + touches[1].clientY) / 2 - rect.top;
        return new Point(x, y);
      };
      const getTouchDistance = (touches) => {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
      };
      const startDrag = (e) => {
        if (e.touches && e.touches.length > 1) {
          lastTouchDistance = getTouchDistance(e.touches);
          touchCenter = getTouchCenter(e.touches);
          dragging = false;
          return;
        }
        dragging = true;
        start = getEventPoint(e);
        startCenter = this._center.clone();
        this._container.style.cursor = 'grabbing';
        lastMoveTime = Date.now();
        velocity = new Point(0, 0);
        e.preventDefault();
      };
      const doDrag = (e) => {
        if (e.touches && e.touches.length > 1) {
          const newDistance = getTouchDistance(e.touches);
          const scale = newDistance / lastTouchDistance;
          if (Math.abs(scale - 1) > 0.05) {
            const newZoom = this._zoom + Math.log2(scale);
            const newClampedZoom = $.clamp(newZoom, this.options.minZoom, this.options.maxZoom);
            const zoomDelta = newClampedZoom - this._zoom;
            if (Math.abs(zoomDelta) > 0.1) {
              const newTouchCenter = getTouchCenter(e.touches);
              const latLng = this.containerPointToLatLng(newTouchCenter);
              this._zoom = newClampedZoom;
              const newPoint = this.latLngToContainerPoint(latLng);
              const offset = newTouchCenter.sub(newPoint);
              this._center = this.containerPointToLatLng(this.latLngToContainerPoint(this._center).add(offset));
              this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
              this._update();
              this.fire('zoom');
              lastTouchDistance = newDistance;
              touchCenter = newTouchCenter;
            }
          }
          return;
        }
        if (!dragging) return;
        const current = getEventPoint(e);
        const delta = current.sub(start);
        const centerPoint = this.latLngToContainerPoint(startCenter);
        this._center = this.containerPointToLatLng(centerPoint.sub(delta));
        this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
        const now = Date.now();
        if (now - lastMoveTime > 16) {
          const timeDelta = (now - lastMoveTime) / 1000;
          velocity = delta.sub(centerPoint.sub(this.latLngToContainerPoint(this._center))).div(timeDelta);
          lastMoveTime = now;
        }
        this._update();
        this.fire('move');
      };
      const endDrag = () => {
        if (dragging) {
          dragging = false;
          this._container.style.cursor = '';
          this.fire('moveend');
          if (this.options.inertia && (velocity.x !== 0 || velocity.y !== 0)) {
            const deceleration = this.options.inertiaDeceleration;
            const maxSpeed = this.options.inertiaMaxSpeed;
            const speed = Math.min(Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y), maxSpeed);
            const duration = speed / deceleration;
            if (duration > 0.1) {
              const endCenterPoint = this.latLngToContainerPoint(this._center).sub(velocity.mul(duration / 2));
              let endCenter = this.containerPointToLatLng(endCenterPoint);
              endCenter = new LatLng($.clamp(endCenter.lat, -Projection.MAX_LAT, Projection.MAX_LAT), endCenter.lng);
              const startTime = Date.now();
              const animate = () => {
                const elapsed = (Date.now() - startTime) / (duration * 1000);
                if (elapsed < 1) {
                  const t = 1 - Math.pow(1 - elapsed, 2);
                  const currentPoint = this.latLngToContainerPoint(this._center).lerp(endCenterPoint, t);
                  this._center = this.containerPointToLatLng(currentPoint);
                  this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
                  this._update();
                  $.raf(animate);
                } else {
                  this._center = endCenter;
                  this._update();
                  this.fire('moveend');
                }
              };
              $.raf(animate);
            }
          }
        }
      };
      addHandler(this._container, 'mousedown', startDrag);
      addHandler(document, 'mousemove', doDrag);
      addHandler(document, 'mouseup', endDrag);
      addHandler(this._container, 'touchstart', startDrag, { passive: false });
      addHandler(this._container, 'touchmove', doDrag, { passive: false });
      addHandler(this._container, 'touchend', endDrag);
      const wheelHandler = (e) => {
        e.preventDefault();
        let delta = e.deltaY > 0 ? -1 : 1;
        if (e.deltaMode === 1) delta *= 3;
        delta *= this.options.zoomDelta;
        const mousePos = getEventPoint(e);
        const latLng = this.containerPointToLatLng(mousePos);
        this._zoom = $.clamp(this._zoom + delta, this.options.minZoom, this.options.maxZoom);
        const newPoint = this.latLngToContainerPoint(latLng);
        const center = this.getCenter();
        const centerPoint = this.latLngToContainerPoint(center);
        const offset = mousePos.sub(newPoint);
        this._center = this.containerPointToLatLng(centerPoint.add(offset));
        this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
        this._update();
        this.fire('zoom');
      };
      addHandler(this._container, 'wheel', wheelHandler, { passive: false });
      const dblClickHandler = (e) => {
        const mousePos = getEventPoint(e);
        this.setView(this.containerPointToLatLng(mousePos), this._zoom + this.options.zoomDelta);
      };
      addHandler(this._container, 'dblclick', dblClickHandler);
      const keyHandler = (e) => {
        if (e.target !== this._container) return;
        const moveAmount = 50;
        let newCenterPoint;
        switch (e.key) {
          case 'ArrowUp':
            newCenterPoint = this.latLngToContainerPoint(this._center).sub(new Point(0, moveAmount));
            break;
          case 'ArrowDown':
            newCenterPoint = this.latLngToContainerPoint(this._center).add(new Point(0, moveAmount));
            break;
          case 'ArrowLeft':
            newCenterPoint = this.latLngToContainerPoint(this._center).sub(new Point(moveAmount, 0));
            break;
          case 'ArrowRight':
            newCenterPoint = this.latLngToContainerPoint(this._center).add(new Point(moveAmount, 0));
            break;
          case '+':
          case '=':
            this.zoomIn();
            return;
          case '-':
            this.zoomOut();
            return;
          default:
            return;
        }
        e.preventDefault();
        this._center = this.containerPointToLatLng(newCenterPoint);
        this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
        this._update();
        this.fire('move');
        this.fire('moveend');
      };
      addHandler(this._container, 'keydown', keyHandler);
    }
    _setupResizeObserver() {
      if (typeof ResizeObserver !== 'undefined') {
        this._resizeObserver = new ResizeObserver(() => {
          this._update();
          this.fire('resize');
        });
        this._resizeObserver.observe(this._container);
      } else {
        const resizeHandler = () => {
          this._update();
          this.fire('resize');
        };
        window.addEventListener('resize', resizeHandler);
        this._resizeObserver = { disconnect: () => window.removeEventListener('resize', resizeHandler) };
      }
    }
    _cleanupInteractions() {
      if (this._interactionHandlers) {
        this._interactionHandlers.forEach(({ target, type, handler, options }) => {
          target.removeEventListener(type, handler, options);
        });
        this._interactionHandlers = null;
      }
      if (this._resizeObserver) {
        this._resizeObserver.disconnect();
        this._resizeObserver = null;
      }
    }
    _addZoomControl() {
      const control = $.create('div', 'nexus-zoom-control', this._container);
      control.setAttribute('role', 'group');
      control.setAttribute('aria-label', 'Map zoom controls');
      control.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: white;
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.2);
        overflow: hidden;
        z-index: 1000;
      `;
      const zoomIn = $.create('button', 'nexus-zoom-in', control);
      zoomIn.type = 'button'; // Prevent form submission
      zoomIn.innerHTML = '+';
      zoomIn.setAttribute('aria-label', 'Zoom in');
      zoomIn.style.cssText = `
        display: block;
        width: 32px;
        height: 32px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        transition: background-color 0.2s;
      `;
      zoomIn.onmouseenter = () => zoomIn.style.backgroundColor = '#f0f0f0';
      zoomIn.onmouseleave = () => zoomIn.style.backgroundColor = 'white';
      zoomIn.onclick = () => this.zoomIn();
      const zoomOut = $.create('button', 'nexus-zoom-out', control);
      zoomOut.type = 'button'; // Prevent form submission
      zoomOut.innerHTML = '−';
      zoomOut.setAttribute('aria-label', 'Zoom out');
      zoomOut.style.cssText = `
        display: block;
        width: 32px;
        height: 32px;
        border: none;
        background: white;
        cursor: pointer;
        font-size: 18px;
        font-weight: bold;
        border-top: 1px solid #ddd;
        transition: background-color 0.2s;
      `;
      zoomOut.onmouseenter = () => zoomOut.style.backgroundColor = '#f0f0f0';
      zoomOut.onmouseleave = () => zoomOut.style.backgroundColor = 'white';
      zoomOut.onclick = () => this.zoomOut();
    }
    _update() {
      this._layers.forEach(layer => {
        if (layer._update) layer._update();
      });
      this.fire('viewupdate');
    }
    setView(center, zoom) {
      this._center = LatLng.from(center);
      if (!this._center) {
        throw new Error('NexusMap.setView: invalid center provided');
      }
      if (zoom !== undefined) {
        this._zoom = $.clamp(zoom, this.options.minZoom, this.options.maxZoom);
      }
      this._center = new LatLng($.clamp(this._center.lat, -Projection.MAX_LAT, Projection.MAX_LAT), this._center.lng);
      this._update();
      this.fire('move');
      this.fire('moveend');
      return this;
    }
    getCenter() { return this._center; }
    getZoom() { return this._zoom; }
    getBounds() {
      const size = this.getSize();
      const topLeft = this.containerPointToLatLng(new Point(0, 0));
      const bottomRight = this.containerPointToLatLng(size);
      return new LatLngBounds(topLeft, bottomRight);
    }
    zoomIn(delta = this.options.zoomDelta) { return this.setView(this._center, this._zoom + delta); }
    zoomOut(delta = this.options.zoomDelta) { return this.setView(this._center, this._zoom - delta); }
    panTo(latlng) { return this.setView(latlng, this._zoom); }
    addLayer(layer) {
      if (!(layer instanceof Layer)) {
        throw new Error('NexusMap.addLayer: layer must extend Layer');
      }
      if (this._layers.indexOf(layer) === -1) {
        this._layers.push(layer);
        layer.onAdd(this);
      }
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
      let latlng = Projection.unproject(worldPoint);
      if (this.options.worldCopyJump) {
        latlng = latlng.wrap();
      }
      return latlng;
    }
    getSize() {
      const rect = this._container.getBoundingClientRect();
      return new Point(rect.width, rect.height);
    }
    getPixelBounds() {
      const size = this.getSize();
      const scale = Projection.scale(this._zoom);
      const halfSize = size.div(2);
      const centerProjected = Projection.project(this._center);
      const topLeftWorld = new Point(
        centerProjected.x - halfSize.x / scale,
        centerProjected.y - halfSize.y / scale
      );
      const bottomRightWorld = new Point(
        centerProjected.x + halfSize.x / scale,
        centerProjected.y + halfSize.y / scale
      );
      return new Bounds(topLeftWorld, bottomRightWorld);
    }
    remove() {
      this._cleanupInteractions();
      while (this._layers.length) {
        this.removeLayer(this._layers[0]);
      }
      if (this._container) {
        this._container.innerHTML = '';
        this._container.style.cssText = '';
        this._container.removeAttribute('role');
        this._container.removeAttribute('aria-label');
        this._container.tabIndex = -1;
      }
      this._panes = null;
      this._container = null;
      this.fire('remove');
    }
  }
  // ============================================================================
  // SMART FACTORY FUNCTIONS - Enhanced with validation
  // ============================================================================
  const Nexus = {
    version: '1.2.3',
    map: (container, options) => new NexusMap(container, options),
    marker: (latlng, options) => new Marker(latlng, options),
    tileLayer: (url, options) => new TileLayer(url, options),
    popup: (options) => new Popup(options),
    latLng: (lat, lng, alt) => new LatLng(lat, lng, alt),
    point: (x, y) => new Point(x, y),
    bounds: (a, b) => new Bounds(a, b),
    latLngBounds: (sw, ne) => new LatLngBounds(sw, ne),
    Map: NexusMap,
    Layer,
    Marker,
    TileLayer,
    Popup,
    LatLng,
    Point,
    Bounds,
    LatLngBounds,
    $
  };
  return Nexus;
});
