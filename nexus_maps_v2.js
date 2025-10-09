/* Nexus Maps v2.0.0 - Full-Featured Mapping Library 🗺️ */
/* MIT License | (c) 2025 Nexus Maps Authors */
/* NEW: Vector layers, GeoJSON, Icons, Layer Groups, Attribution, Overlays */
(function(global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = globalThis || global || self, global.Nexus = factory());
})(this, function() {
  'use strict';

  // ============================================================================
  // UTILITIES (from v1.2.3)
  // ============================================================================
  const $ = {
    extend: (t, ...s) => Object.assign(t, ...s),
    clone: o => JSON.parse(JSON.stringify(o)),
    get: (o, p, d) => p.split('.').reduce((a, v) => a?.[v], o) ?? d,
    bind: (fn, ctx, ...args) => fn.bind(ctx, ...args),
    once: fn => { let ran; return (...args) => ran !== undefined ? ran : (ran = fn(...args)); },
    debounce: (fn, ms) => { let t; return (...a) => (clearTimeout(t), t = setTimeout(() => fn(...a), ms)); },
    throttle: (fn, ms) => { let w, l = 0; return (...a) => { const n = Date.now(); if (n - l >= ms) { l = n; fn(...a); } else { clearTimeout(w); w = setTimeout(() => { l = n; fn(...a); }, ms - (n - l)); } }; },
    chunk: (a, n) => Array.from({length: Math.ceil(a.length / n)}, (_, i) => a.slice(i * n, i * n + n)),
    unique: a => [...new Set(a)],
    template: (s, d) => s.replace(/\{(\w+)\}/g, (_, k) => d[k] ?? ''),
    qs: (s, p = document) => p.querySelector(s),
    qsa: (s, p = document) => [...p.querySelectorAll(s)],
    create: (t, c, p) => { const e = document.createElement(t); if (c) e.className = c; if (p) p.appendChild(e); return e; },
    remove: e => e?.parentNode?.removeChild(e),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    raf: fn => requestAnimationFrame(fn),
    caf: id => cancelAnimationFrame(id),
    isTouch: 'ontouchstart' in window,
    isRetina: window.devicePixelRatio > 1,
    is3d: (() => { const t = document.createElement('div').style; return 'WebKitCSSMatrix' in window || 'MozPerspective' in t; })()
  };

  // ============================================================================
  // EVENT SYSTEM (from v1.2.3)
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
  // GEOMETRY (from v1.2.3)
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
    lerp(p, t) { return new Point($.lerp(this.x, p.x, t), $.lerp(this.y, p.y, t)); }
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
    clone() { return new LatLng(this.lat, this.lng, this.alt); }
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
    getNW() { return this._sw && this._ne ? new LatLng(this._ne.lat, this._sw.lng) : null; }
    getSE() { return this._sw && this._ne ? new LatLng(this._sw.lat, this._ne.lng) : null; }
    contains(ll) { 
      ll = LatLng.from(ll);
      if (!ll || !this.isValid()) return false;
      return ll.lat >= this._sw.lat && ll.lat <= this._ne.lat && 
             ll.lng >= this._sw.lng && ll.lng <= this._ne.lng; 
    }
    intersects(bounds) {
      if (!this.isValid() || !bounds.isValid()) return false;
      return bounds._ne.lat >= this._sw.lat && bounds._sw.lat <= this._ne.lat &&
             bounds._ne.lng >= this._sw.lng && bounds._sw.lng <= this._ne.lng;
    }
    isValid() { 
      return this._sw !== null && this._ne !== null && 
             this._sw.lat <= this._ne.lat && this._sw.lng <= this._ne.lng; 
    }
    pad(ratio) {
      const sw = this._sw;
      const ne = this._ne;
      const heightBuffer = Math.abs(ne.lat - sw.lat) * ratio;
      const widthBuffer = Math.abs(ne.lng - sw.lng) * ratio;
      return new LatLngBounds(
        new LatLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
        new LatLng(ne.lat + heightBuffer, ne.lng + widthBuffer)
      );
    }
  }

  // ============================================================================
  // PROJECTION (from v1.2.3)
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
  // LAYER SYSTEM (Enhanced)
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
    bindPopup(content, options) {
      this._popup = new Popup(options).setContent(content);
      this.on('click', () => {
        if (this._popup && this._map) {
          const latlng = this.getLatLng ? this.getLatLng() : this.getCenter?.() || this.getBounds?.()?.getCenter();
          if (latlng) {
            this._popup.setLatLng(latlng).openOn(this._map);
          }
        }
      });
      return this;
    }
    unbindPopup() {
      this._popup = null;
      return this;
    }
    getPopup() {
      return this._popup;
    }
  }

  // ============================================================================
  // NEW: ICON SYSTEM
  // ============================================================================
  class Icon {
    constructor(options = {}) {
      this.options = {
        iconUrl: '',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowUrl: '',
        shadowSize: [41, 41],
        shadowAnchor: [12, 41],
        className: '',
        ...options
      };
    }
    createIcon(oldIcon) {
      return this._createIcon('icon', oldIcon);
    }
    createShadow(oldShadow) {
      return this.options.shadowUrl ? this._createIcon('shadow', oldShadow) : null;
    }
    _createIcon(type, oldEl) {
      const src = type === 'icon' ? this.options.iconUrl : this.options.shadowUrl;
      const size = type === 'icon' ? this.options.iconSize : this.options.shadowSize;
      const anchor = type === 'icon' ? this.options.iconAnchor : this.options.shadowAnchor;
      
      if (!src) return null;
      
      const img = oldEl && oldEl.tagName === 'IMG' ? oldEl : document.createElement('img');
      img.src = src;
      img.alt = '';
      img.className = `nexus-marker-${type} ${this.options.className}`;
      
      if (size) {
        img.style.width = size[0] + 'px';
        img.style.height = size[1] + 'px';
      }
      
      if (anchor) {
        img.style.marginLeft = (-anchor[0]) + 'px';
        img.style.marginTop = (-anchor[1]) + 'px';
      }
      
      return img;
    }
  }

  Icon.Default = new Icon({
    iconUrl: 'data:image/svg+xml;base64,' + btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41">
        <path fill="#3388ff" stroke="#fff" stroke-width="2" d="M12.5 0C5.6 0 0 5.6 0 12.5c0 8.5 12.5 28.5 12.5 28.5S25 21 25 12.5C25 5.6 19.4 0 12.5 0z"/>
        <circle fill="#fff" cx="12.5" cy="12.5" r="4.5"/>
      </svg>
    `),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34]
  });

  class DivIcon extends Icon {
    constructor(options = {}) {
      super({
        iconSize: [12, 12],
        html: '',
        className: 'nexus-div-icon',
        ...options
      });
    }
    createIcon(oldIcon) {
      const div = oldIcon && oldIcon.tagName === 'DIV' ? oldIcon : document.createElement('div');
      div.className = `nexus-marker-icon ${this.options.className}`;
      
      if (this.options.html) {
        if (typeof this.options.html === 'string') {
          div.innerHTML = this.options.html;
        } else {
          div.replaceChildren(this.options.html);
        }
      }
      
      const size = this.options.iconSize;
      if (size) {
        div.style.width = size[0] + 'px';
        div.style.height = size[1] + 'px';
      }
      
      const anchor = this.options.iconAnchor;
      if (anchor) {
        div.style.marginLeft = (-anchor[0]) + 'px';
        div.style.marginTop = (-anchor[1]) + 'px';
      }
      
      return div;
    }
    createShadow() {
      return null;
    }
  }

  // ============================================================================
  // MARKER (Enhanced with Icon support)
  // ============================================================================
  class Marker extends Layer {
    constructor(latlng, options = {}) {
      super(options);
      this._latlng = LatLng.from(latlng);
      if (!this._latlng) {
        throw new Error('Marker: invalid LatLng provided');
      }
      this.options = {
        icon: null,
        draggable: false,
        title: '',
        alt: 'Map marker',
        className: 'nexus-marker',
        zIndexOffset: 0,
        opacity: 1,
        ...options
      };
      
      if (!this.options.icon) {
        this.options.icon = Icon.Default;
      }
      
      this._dragHandlers = null;
      this._el = null;
      this._shadow = null;
    }
    onAdd(map) {
      super.onAdd(map);
      if (!this._el) {
        this._el = $.create('div', this.options.className, map._panes.markerPane);
        this._el.setAttribute('role', 'button');
        this._el.setAttribute('tabindex', '0');
        if (this.options.title) {
          this._el.setAttribute('title', this.options.title);
          this._el.setAttribute('aria-label', this.options.title);
        } else if (this.options.alt) {
          this._el.setAttribute('aria-label', this.options.alt);
        }
        this._el.setAttribute('aria-roledescription', 'map marker');
        
        this._el.style.cssText = `
          position: absolute;
          cursor: pointer;
          user-select: none;
          pointer-events: auto;
          will-change: transform;
          opacity: ${this.options.opacity};
          z-index: ${1000 + this.options.zIndexOffset};
        `;
        
        const icon = this.options.icon;
        if (icon) {
          const iconEl = icon.createIcon();
          if (iconEl) this._el.appendChild(iconEl);
          
          if (map._panes.shadowPane) {
            const shadowEl = icon.createShadow();
            if (shadowEl) {
              this._shadow = $.create('div', 'nexus-marker-shadow', map._panes.shadowPane);
              this._shadow.appendChild(shadowEl);
              this._shadow.style.cssText = `
                position: absolute;
                pointer-events: none;
                will-change: transform;
              `;
            }
          }
        }
        
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
      $.remove(this._shadow);
      this._el = null;
      this._shadow = null;
      super.onRemove();
    }
    setLatLng(latlng) {
      this._latlng = LatLng.from(latlng);
      if (!this._latlng) {
        throw new Error('Marker.setLatLng: invalid LatLng provided');
      }
      this._update();
      this.fire('move', { latlng: this._latlng });
      return this;
    }
    getLatLng() { return this._latlng; }
    setIcon(icon) {
      this.options.icon = icon;
      if (this._map && this._el) {
        const oldIconEl = this._el.querySelector('.nexus-marker-icon, img');
        const newIconEl = icon.createIcon(oldIconEl);
        if (newIconEl && newIconEl !== oldIconEl) {
          if (oldIconEl) oldIconEl.replaceWith(newIconEl);
          else this._el.appendChild(newIconEl);
        }
        this._update();
      }
      return this;
    }
    setOpacity(opacity) {
      this.options.opacity = opacity;
      if (this._el) this._el.style.opacity = opacity;
      return this;
    }
    setZIndexOffset(offset) {
      this.options.zIndexOffset = offset;
      if (this._el) this._el.style.zIndex = 1000 + offset;
      return this;
    }
    _update() {
      if (!this._map || !this._el) return;
      const pos = this._map.latLngToContainerPoint(this._latlng);
      this._el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      if (this._shadow) {
        this._shadow.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      }
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
  // NEW: VECTOR LAYERS - PATH BASE CLASS
  // ============================================================================
  class Path extends Layer {
    constructor(options = {}) {
      super(options);
      this.options = {
        stroke: true,
        color: '#3388ff',
        weight: 3,
        opacity: 1,
        lineCap: 'round',
        lineJoin: 'round',
        dashArray: null,
        fill: false,
        fillColor: null,
        fillOpacity: 0.2,
        className: '',
        interactive: true,
        ...options
      };
      this._path = null;
      this._bounds = null;
    }
    onAdd(map) {
      super.onAdd(map);
      if (!map._renderer) {
        map._renderer = new SVGRenderer({ pane: 'overlayPane' });
        map._renderer.addTo(map);
      }
      map._renderer.addPath(this);
      this._update();
    }
    onRemove() {
      if (this._map && this._map._renderer) {
        this._map._renderer.removePath(this);
      }
      super.onRemove();
    }
    setStyle(style) {
      $.extend(this.options, style);
      if (this._map && this._map._renderer) {
        this._map._renderer.updateStyle(this);
      }
      return this;
    }
    redraw() {
      if (this._map && this._map._renderer) {
        this._map._renderer.updatePath(this);
      }
      return this;
    }
    getBounds() {
      return this._bounds;
    }
    getCenter() {
      return this._bounds ? this._bounds.getCenter() : null;
    }
    _project() {
      // Override in subclasses
    }
    _update() {
      if (this._map) {
        this._project();
        this.redraw();
      }
    }
  }

  // ============================================================================
  // NEW: SVG RENDERER
  // ============================================================================
  class SVGRenderer extends Layer {
    constructor(options = {}) {
      super(options);
      this._paths = new Map();
      this._container = null;
      this._svg = null;
    }
    onAdd(map) {
      super.onAdd(map);
      if (!this._container) {
        this._container = $.create('div', 'nexus-svg-renderer', map._panes[this.options.pane]);
        this._container.style.cssText = `
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
        `;
        this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this._svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        this._svg.style.cssText = 'width: 100%; height: 100%;';
        this._container.appendChild(this._svg);
      }
    }
    onRemove() {
      $.remove(this._container);
      this._container = null;
      this._svg = null;
      this._paths.clear();
      super.onRemove();
    }
    addPath(path) {
      if (!this._paths.has(path)) {
        const element = this._createPathElement(path);
        this._paths.set(path, element);
        this._svg.appendChild(element);
        this.updateStyle(path);
      }
    }
    removePath(path) {
      const element = this._paths.get(path);
      if (element) {
        $.remove(element);
        this._paths.delete(path);
      }
    }
    updatePath(path) {
      const element = this._paths.get(path);
      if (element && path._parts) {
        const d = this._pathToString(path._parts, path instanceof Polygon);
        element.setAttribute('d', d);
      } else if (element && path._point && path._radius) {
        element.setAttribute('cx', path._point.x);
        element.setAttribute('cy', path._point.y);
        element.setAttribute('r', path._radius);
      }
    }
    updateStyle(path) {
      const element = this._paths.get(path);
      if (!element) return;
      
      const options = path.options;
      
      if (options.stroke) {
        element.setAttribute('stroke', options.color);
        element.setAttribute('stroke-width', options.weight);
        element.setAttribute('stroke-opacity', options.opacity);
        element.setAttribute('stroke-linecap', options.lineCap);
        element.setAttribute('stroke-linejoin', options.lineJoin);
        if (options.dashArray) {
          element.setAttribute('stroke-dasharray', options.dashArray);
        } else {
          element.removeAttribute('stroke-dasharray');
        }
      } else {
        element.setAttribute('stroke', 'none');
      }
      
      if (options.fill) {
        element.setAttribute('fill', options.fillColor || options.color);
        element.setAttribute('fill-opacity', options.fillOpacity);
        element.setAttribute('fill-rule', options.fillRule || 'evenodd');
      } else {
        element.setAttribute('fill', 'none');
      }
      
      if (options.className) {
        element.setAttribute('class', options.className);
      }
      
      element.style.pointerEvents = options.interactive ? 'auto' : 'none';
    }
    _createPathElement(path) {
      let element;
      if (path instanceof Circle) {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      } else {
        element = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      }
      
      if (path.options.interactive) {
        element.style.cursor = 'pointer';
        element.addEventListener('click', (e) => {
          e.stopPropagation();
          path.fire('click', { originalEvent: e });
        });
      }
      
      return element;
    }
    _pathToString(parts, closed = false) {
      let str = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        for (let j = 0; j < part.length; j++) {
          str += (j === 0 ? 'M' : 'L') + part[j].x + ' ' + part[j].y;
        }
        if (closed) str += 'Z';
      }
      return str || 'M0 0';
    }
  }

  // ============================================================================
  // NEW: POLYLINE
  // ============================================================================
  class Polyline extends Path {
    constructor(latlngs, options = {}) {
      super(options);
      this._latlngs = this._convertLatLngs(latlngs);
      this._parts = [];
    }
    setLatLngs(latlngs) {
      this._latlngs = this._convertLatLngs(latlngs);
      this._update();
      return this;
    }
    getLatLngs() {
      return this._latlngs;
    }
    addLatLng(latlng) {
      latlng = LatLng.from(latlng);
      if (latlng) {
        this._latlngs.push(latlng);
        this._update();
      }
      return this;
    }
    _convertLatLngs(latlngs) {
      const result = [];
      for (let i = 0; i < latlngs.length; i++) {
        if (Array.isArray(latlngs[i]) && typeof latlngs[i][0] !== 'number') {
          // Multi-polyline
          return latlngs.map(ll => this._convertLatLngs(ll));
        }
        const ll = LatLng.from(latlngs[i]);
        if (ll) result.push(ll);
      }
      return result;
    }
    _project() {
      this._parts = [];
      this._bounds = new LatLngBounds();
      
      const isFlat = this._latlngs.length && this._latlngs[0] instanceof LatLng;
      const latlngs = isFlat ? [this._latlngs] : this._latlngs;
      
      for (let i = 0; i < latlngs.length; i++) {
        const ring = latlngs[i];
        const part = [];
        for (let j = 0; j < ring.length; j++) {
          const p = this._map.latLngToContainerPoint(ring[j]);
          part.push(p);
          this._bounds.extend(ring[j]);
        }
        this._parts.push(part);
      }
    }
  }

  // ============================================================================
  // NEW: POLYGON
  // ============================================================================
  class Polygon extends Polyline {
    constructor(latlngs, options = {}) {
      super(latlngs, { fill: true, ...options });
    }
  }

  // ============================================================================
  // NEW: RECTANGLE
  // ============================================================================
  class Rectangle extends Polygon {
    constructor(bounds, options = {}) {
      const latlngs = bounds instanceof LatLngBounds ? [
        bounds.getSW(),
        bounds.getNW(),
        bounds.getNE(),
        bounds.getSE()
      ] : [];
      super(latlngs, options);
      this._bounds = bounds;
    }
    setBounds(bounds) {
      this._bounds = bounds;
      return this.setLatLngs([
        bounds.getSW(),
        bounds.getNW(),
        bounds.getNE(),
        bounds.getSE()
      ]);
    }
  }

  // ============================================================================
  // NEW: CIRCLE
  // ============================================================================
  class Circle extends Path {
    constructor(latlng, options = {}) {
      super({ fill: true, ...options });
      this._latlng = LatLng.from(latlng);
      this.options.radius = options.radius || 100; // meters
      this._mRadius = this.options.radius;
      this._point = null;
      this._radius = null;
    }
    setLatLng(latlng) {
      this._latlng = LatLng.from(latlng);
      this._update();
      return this;
    }
    getLatLng() {
      return this._latlng;
    }
    setRadius(radius) {
      this._mRadius = radius;
      this.options.radius = radius;
      this._update();
      return this;
    }
    getRadius() {
      return this._mRadius;
    }
    _project() {
      const lngRadius = this._mRadius / 40075017 * 360;
      const latAccuracy = this._mRadius / 40007863 * 360;
      const latlng2 = new LatLng(this._latlng.lat + latAccuracy, this._latlng.lng);
      
      this._point = this._map.latLngToContainerPoint(this._latlng);
      const point2 = this._map.latLngToContainerPoint(latlng2);
      this._radius = Math.max(Math.round(this._point.y - point2.y), 1);
      
      this._bounds = new LatLngBounds(
        new LatLng(this._latlng.lat - latAccuracy, this._latlng.lng - lngRadius),
        new LatLng(this._latlng.lat + latAccuracy, this._latlng.lng + lngRadius)
      );
    }
  }

  // ============================================================================
  // NEW: CIRCLE MARKER (pixel-based circle)
  // ============================================================================
  class CircleMarker extends Circle {
    constructor(latlng, options = {}) {
      super(latlng, options);
      this.options.radius = options.radius || 10; // pixels
    }
    setRadius(radius) {
      this.options.radius = radius;
      this._radius = radius;
      this.redraw();
      return this;
    }
    _project() {
      this._point = this._map.latLngToContainerPoint(this._latlng);
      this._radius = this.options.radius;
      this._bounds = new LatLngBounds(this._latlng, this._latlng);
    }
  }

  // ============================================================================
  // NEW: LAYER GROUP
  // ============================================================================
  class LayerGroup extends Layer {
    constructor(layers = [], options = {}) {
      super(options);
      this._layers = [];
      if (layers.length) {
        layers.forEach(layer => this.addLayer(layer));
      }
    }
    addLayer(layer) {
      if (this._layers.indexOf(layer) === -1) {
        this._layers.push(layer);
        if (this._map) {
          layer.addTo(this._map);
        }
      }
      return this;
    }
    removeLayer(layer) {
      const idx = this._layers.indexOf(layer);
      if (idx > -1) {
        this._layers.splice(idx, 1);
        if (this._map) {
          layer.remove();
        }
      }
      return this;
    }
    hasLayer(layer) {
      return this._layers.indexOf(layer) !== -1;
    }
    clearLayers() {
      this._layers.forEach(layer => layer.remove());
      this._layers = [];
      return this;
    }
    eachLayer(fn, context) {
      this._layers.forEach(layer => fn.call(context || this, layer));
      return this;
    }
    getLayers() {
      return [...this._layers];
    }
    onAdd(map) {
      super.onAdd(map);
      this._layers.forEach(layer => layer.addTo(map));
    }
    onRemove() {
      this._layers.forEach(layer => layer.remove());
      super.onRemove();
    }
  }

  // ============================================================================
  // NEW: FEATURE GROUP (LayerGroup with popup/event support)
  // ============================================================================
  class FeatureGroup extends LayerGroup {
    bindPopup(content, options) {
      this._popupContent = content;
      this._popupOptions = options;
      this._layers.forEach(layer => {
        if (layer.bindPopup) {
          layer.bindPopup(content, options);
        }
      });
      return this;
    }
    getBounds() {
      const bounds = new LatLngBounds();
      this._layers.forEach(layer => {
        if (layer.getBounds) {
          const b = layer.getBounds();
          if (b && b.isValid()) bounds.extend(b.getSW()).extend(b.getNE());
        } else if (layer.getLatLng) {
          bounds.extend(layer.getLatLng());
        }
      });
      return bounds;
    }
    setStyle(style) {
      this._layers.forEach(layer => {
        if (layer.setStyle) layer.setStyle(style);
      });
      return this;
    }
    addLayer(layer) {
      super.addLayer(layer);
      if (this._popupContent && layer.bindPopup) {
        layer.bindPopup(this._popupContent, this._popupOptions);
      }
      return this;
    }
  }

  // ============================================================================
  // NEW: GEOJSON LAYER
  // ============================================================================
  class GeoJSON extends FeatureGroup {
    constructor(geojson, options = {}) {
      super([], options);
      this.options = {
        pointToLayer: null,
        style: null,
        onEachFeature: null,
        filter: null,
        coordsToLatLng: (coords) => new LatLng(coords[1], coords[0], coords[2]),
        ...options
      };
      if (geojson) {
        this.addData(geojson);
      }
    }
    addData(geojson) {
      if (geojson.type === 'FeatureCollection') {
        geojson.features.forEach(feature => this._addFeature(feature));
      } else if (geojson.type === 'Feature') {
        this._addFeature(geojson);
      } else {
        this._addGeometry(geojson);
      }
      return this;
    }
    _addFeature(feature) {
      if (this.options.filter && !this.options.filter(feature)) return;
      const layer = this._geometryToLayer(feature.geometry, feature);
      if (layer) {
        layer.feature = feature;
        if (this.options.onEachFeature) {
          this.options.onEachFeature(feature, layer);
        }
        this.addLayer(layer);
      }
    }
    _addGeometry(geometry) {
      const layer = this._geometryToLayer(geometry);
      if (layer) this.addLayer(layer);
    }
    _geometryToLayer(geometry, feature) {
      const coords = geometry.coordinates;
      const layers = [];
      let latlng, latlngs, layer;
      
      switch (geometry.type) {
        case 'Point':
          latlng = this.options.coordsToLatLng(coords);
          if (this.options.pointToLayer) {
            return this.options.pointToLayer(feature || { geometry }, latlng);
          }
          return new CircleMarker(latlng, this.options.style ? this.options.style(feature) : {});
          
        case 'MultiPoint':
          coords.forEach(coord => {
            latlng = this.options.coordsToLatLng(coord);
            layer = this.options.pointToLayer ? 
              this.options.pointToLayer(feature || { geometry }, latlng) :
              new CircleMarker(latlng, this.options.style ? this.options.style(feature) : {});
            layers.push(layer);
          });
          return new FeatureGroup(layers);
          
        case 'LineString':
          latlngs = coords.map(c => this.options.coordsToLatLng(c));
          return new Polyline(latlngs, this.options.style ? this.options.style(feature) : {});
          
        case 'MultiLineString':
          latlngs = coords.map(line => line.map(c => this.options.coordsToLatLng(c)));
          return new Polyline(latlngs, this.options.style ? this.options.style(feature) : {});
          
        case 'Polygon':
          latlngs = coords.map(ring => ring.map(c => this.options.coordsToLatLng(c)));
          return new Polygon(latlngs, this.options.style ? this.options.style(feature) : {});
          
        case 'MultiPolygon':
          coords.forEach(polygon => {
            latlngs = polygon.map(ring => ring.map(c => this.options.coordsToLatLng(c)));
            layers.push(new Polygon(latlngs, this.options.style ? this.options.style(feature) : {}));
          });
          return new FeatureGroup(layers);
          
        case 'GeometryCollection':
          geometry.geometries.forEach(geom => {
            layer = this._geometryToLayer(geom, feature);
            if (layer) layers.push(layer);
          });
          return new FeatureGroup(layers);
      }
      return null;
    }
  }

  // ============================================================================
  // NEW: IMAGE OVERLAY
  // ============================================================================
  class ImageOverlay extends Layer {
    constructor(url, bounds, options = {}) {
      super(options);
      this._url = url;
      this._bounds = bounds instanceof LatLngBounds ? bounds : new LatLngBounds(bounds[0], bounds[1]);
      this.options = {
        opacity: 1,
        alt: '',
        interactive: false,
        crossOrigin: false,
        className: '',
        ...options
      };
      this._image = null;
    }
    onAdd(map) {
      super.onAdd(map);
      if (!this._image) {
        this._image = $.create('img', `nexus-image-overlay ${this.options.className}`, map._panes.overlayPane);
        this._image.style.cssText = `
          position: absolute;
          opacity: ${this.options.opacity};
          pointer-events: ${this.options.interactive ? 'auto' : 'none'};
        `;
        if (this.options.alt) this._image.alt = this.options.alt;
        if (this.options.crossOrigin) this._image.crossOrigin = typeof this.options.crossOrigin === 'string' ? this.options.crossOrigin : 'anonymous';
        
        this._image.addEventListener('load', () => this.fire('load'));
        this._image.addEventListener('error', () => this.fire('error'));
        
        this._image.src = this._url;
      }
      map.on('zoom move', this._update, this);
      this._update();
    }
    onRemove() {
      if (this._map) {
        this._map.off('zoom move', this._update, this);
      }
      $.remove(this._image);
      this._image = null;
      super.onRemove();
    }
    setOpacity(opacity) {
      this.options.opacity = opacity;
      if (this._image) this._image.style.opacity = opacity;
      return this;
    }
    setUrl(url) {
      this._url = url;
      if (this._image) this._image.src = url;
      return this;
    }
    setBounds(bounds) {
      this._bounds = bounds instanceof LatLngBounds ? bounds : new LatLngBounds(bounds[0], bounds[1]);
      this._update();
      return this;
    }
    getBounds() {
      return this._bounds;
    }
    getElement() {
      return this._image;
    }
    _update() {
      if (!this._map || !this._image || !this._bounds.isValid()) return;
      
      const topLeft = this._map.latLngToContainerPoint(this._bounds.getNW());
      const bottomRight = this._map.latLngToContainerPoint(this._bounds.getSE());
      
      const size = bottomRight.sub(topLeft);
      
      this._image.style.transform = `translate(${topLeft.x}px, ${topLeft.y}px)`;
      this._image.style.width = size.x + 'px';
      this._image.style.height = size.y + 'px';
    }
  }

  // ============================================================================
  // NEW: SVG OVERLAY
  // ============================================================================
  class SVGOverlay extends ImageOverlay {
    constructor(svgElement, bounds, options = {}) {
      super('', bounds, options);
      this._svgElement = typeof svgElement === 'string' ? this._parseSVG(svgElement) : svgElement;
    }
    onAdd(map) {
      if (!this._image) {
        this._image = this._svgElement.cloneNode(true);
        this._image.classList.add('nexus-svg-overlay', this.options.className);
        this._image.style.cssText = `
          position: absolute;
          opacity: ${this.options.opacity};
          pointer-events: ${this.options.interactive ? 'auto' : 'none'};
        `;
        map._panes.overlayPane.appendChild(this._image);
      }
      map.on('zoom move', this._update, this);
      this._map = map;
      this._update();
    }
    _parseSVG(svgString) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgString, 'image/svg+xml');
      return doc.documentElement;
    }
  }

  // ============================================================================
  // TILE LAYER (from v1.2.3 - unchanged)
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
      this._update();
      map.on('moveend zoom', this._updateHandler, this);
    }
    onRemove() {
      if (this._map) {
        this._map.off('moveend zoom', this._updateHandler, this);
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
  // POPUP (from v1.2.3 - unchanged)
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
      if (this._el) return this;
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
      close.type = 'button';
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
      if (this.options.closeOnEscape) {
        addHandler(document, 'keydown', (e) => {
          if (e.key === 'Escape' && this._el) {
            this.remove();
          }
        });
      }
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
      if (!this._el) return this;
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
  // ATTRIBUTION CONTROL (Refactored)
  // ============================================================================
  class AttributionControl extends Control {
    constructor(options = {}) {
      super({ position: 'bottomright', ...options });
      this.options.prefix = options.prefix === undefined ? 'Nexus Maps' : options.prefix;
      this._attributions = new Map();
    }

    onAdd(map) {
      super.onAdd(map); // Sets this._map and this._container
      this._update();
      // The super.onAdd already appends the container, so no need to do it here.
      return this._container;
    }

    draw() {
      const container = $.create('div', 'nexus-control-attribution nexus-control');
      container.setAttribute('role', 'contentinfo');
      container.setAttribute('aria-label', 'Map attribution');
      container.style.cssText = `
        background: rgba(255, 255, 255, 0.8);
        padding: 2px 8px;
        font-size: 11px;
        line-height: 1.4;
        max-width: 100%;
        box-sizing: border-box;
        pointer-events: auto; /* Allow clicks on links */
      `;
      return container;
    }
    addAttribution(text) {
      if (!text) return this;
      const count = this._attributions.get(text) || 0;
      this._attributions.set(text, count + 1);
      this._update();
      return this;
    }
    removeAttribution(text) {
      if (!text) return this;
      const count = this._attributions.get(text);
      if (count) {
        if (count === 1) {
          this._attributions.delete(text);
        } else {
          this._attributions.set(text, count - 1);
        }
        this._update();
      }
      return this;
    }
    setPrefix(prefix) {
      this.options.prefix = prefix;
      this._update();
      return this;
    }
    _update() {
      if (!this._container) return;
      const parts = [];
      if (this.options.prefix) {
        parts.push(this.options.prefix);
      }
      this._attributions.forEach((count, text) => {
        parts.push(text);
      });
      this._container.innerHTML = parts.join(' | ');
    }
  }

  // ============================================================================
  // NEW: BASE CONTROL CLASS
  // ============================================================================
  class Control extends EventEmitter {
    constructor(options = {}) {
      super();
      this.options = { position: 'topright', ...options };
      this._map = null;
      this._container = null;
    }
    addTo(map) {
      if (!(map instanceof NexusMap)) {
        throw new Error('Control.addTo: map must be a NexusMap instance');
      }
      map.addControl(this);
      return this;
    }
    remove() {
      if (this._map) {
        this._map.removeControl(this);
      }
      return this;
    }
    onAdd(map) {
      // To be implemented by subclasses
      this._map = map;
      this._container = this.draw();
      const corner = this._map._controlCorners[this.options.position];
      if (corner) {
        corner.appendChild(this._container);
      }
      return this._container;
    }
    onRemove() {
      // To be implemented by subclasses
      $.remove(this._container);
      this._container = null;
      this._map = null;
    }
    draw() {
      // Subclasses must implement this method to return an HTMLElement
      return $.create('div', 'nexus-control');
    }
    getContainer() {
      return this._container;
    }
  }

  // ============================================================================
  // NEW: LAYERS CONTROL
  // ============================================================================
  class LayersControl extends Control {
    constructor(baseLayers = {}, overlays = {}, options = {}) {
      super({ position: 'topright', ...options });
      this.options.collapsed = options.collapsed === undefined ? true : options.collapsed;
      this._baseLayers = new Map();
      this._overlays = new Map();
      this._layerControlIdCounter = 0;

      for (const name in baseLayers) {
        this.addBaseLayer(baseLayers[name], name);
      }
      for (const name in overlays) {
        this.addOverlay(overlays[name], name);
      }
    }

    onAdd(map) {
      super.onAdd(map); // Creates this._container
      if (this.options.collapsed) {
        this._container.addEventListener('mouseenter', this._expand.bind(this));
        this._container.addEventListener('mouseleave', this._collapse.bind(this));
      }
      this._update();
      return this._container;
    }

    onRemove() {
      // Clean up event listeners if any were added to the map
      super.onRemove();
    }

    draw() {
      const container = $.create('div', 'nexus-control-layers nexus-control');
      container.style.cssText = `
        background: white;
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.2);
        clear: both;
      `;

      this._layersLink = $.create('a', 'nexus-control-layers-toggle', container);
      this._layersLink.href = '#';
      this._layersLink.title = 'Layers';
      this._layersLink.setAttribute('role', 'button');
      this._layersLink.setAttribute('aria-haspopup', 'true');
      this._layersLink.setAttribute('aria-expanded', 'false');
      this._layersLink.style.cssText = `
        display: block;
        width: 36px;
        height: 36px;
        background-image: url('data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93s3.05-7.44 7-7.93v15.86zm2-15.86c1.03.13 2 .45 2.87.93L15.87 5H14v.07zm0 4.07V11h2.13c.05.33.07.66.07 1s-.02.67-.07 1H14v1.93c.87.48 1.84.8 2.87.93H14v2.07c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/></svg>')');
        background-size: 24px 24px;
        background-position: center;
        background-repeat: no-repeat;
      `;

      this._form = $.create('form', 'nexus-control-layers-list', container);
      this._form.style.display = this.options.collapsed ? 'none' : 'block';
      this._form.style.padding = '6px 10px';
      this._form.style.lineHeight = '1.5';

      this._baseLayersList = $.create('div', 'nexus-control-layers-base', this._form);
      this._separator = $.create('div', 'nexus-control-layers-separator', this._form);
      this._separator.style.borderTop = '1px solid #ddd';
      this._separator.style.margin = '5px 0';
      this._overlaysList = $.create('div', 'nexus-control-layers-overlays', this._form);

      return container;
    }

    addBaseLayer(layer, name) {
      this._addLayer(layer, name, false);
      return this;
    }

    addOverlay(layer, name) {
      this._addLayer(layer, name, true);
      return this;
    }

    _addLayer(layer, name, isOverlay) {
      const id = `nexus-layer-control-${this._layerControlIdCounter++}`;
      layer._nexusLayerId = id;

      const list = isOverlay ? this._overlays : this._baseLayers;
      list.set(id, { layer, name });

      if (this._map) {
        this._update();
      }
    }

    _update() {
      if (!this._form) return;

      this._baseLayersList.innerHTML = '';
      this._overlaysList.innerHTML = '';

      let hasBaseLayers = false;
      let hasOverlays = false;

      this._baseLayers.forEach((obj, id) => {
        this._createLayerItem(obj, id, false);
        hasBaseLayers = true;
      });

      this._overlays.forEach((obj, id) => {
        this._createLayerItem(obj, id, true);
        hasOverlays = true;
      });

      this._separator.style.display = hasBaseLayers && hasOverlays ? '' : 'none';
    }

    _createLayerItem(obj, id, isOverlay) {
      const label = document.createElement('label');
      label.style.display = 'block';

      const input = document.createElement('input');
      input.type = isOverlay ? 'checkbox' : 'radio';
      input.name = isOverlay ? `overlay-${id}` : 'nexus-base-layer';
      input.checked = this._map.hasLayer(obj.layer);
      input.layerId = id;
      input.style.marginRight = '5px';

      input.addEventListener('click', () => this._onInputChange(input, isOverlay));

      const nameSpan = document.createElement('span');
      nameSpan.textContent = obj.name;

      label.appendChild(input);
      label.appendChild(nameSpan);

      const list = isOverlay ? this._overlaysList : this._baseLayersList;
      list.appendChild(label);
    }

    _onInputChange(input, isOverlay) {
      const id = input.layerId;
      const obj = (isOverlay ? this._overlays : this._baseLayers).get(id);

      if (input.checked && !this._map.hasLayer(obj.layer)) {
        this._map.addLayer(obj.layer);
      } else if (!input.checked && this._map.hasLayer(obj.layer)) {
        this._map.removeLayer(obj.layer);
      }

      if (!isOverlay) {
        this._baseLayers.forEach((otherObj, otherId) => {
          if (otherId !== id && this._map.hasLayer(otherObj.layer)) {
            this._map.removeLayer(otherObj.layer);
          }
        });
      }
    }

    _expand() {
      this._form.style.display = '';
      this._container.style.width = 'auto';
      this._layersLink.setAttribute('aria-expanded', 'true');
    }

    _collapse() {
      this._form.style.display = 'none';
      this._container.style.width = '';
      this._layersLink.setAttribute('aria-expanded', 'false');
    }
  }

  // ============================================================================
  // ZOOM CONTROL (Refactored)
  // ============================================================================
  class ZoomControl extends Control {
    constructor(options = {}) {
      super({ position: 'topright', ...options });
    }

    draw() {
      const container = $.create('div', 'nexus-zoom-control nexus-control');
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'Map zoom controls');
      container.style.cssText = `
        background: white;
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.2);
        overflow: hidden;
      `;

      const zoomIn = $.create('button', 'nexus-zoom-in', container);
      zoomIn.type = 'button';
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
      zoomIn.onclick = (e) => {
        e.stopPropagation();
        this._map.zoomIn();
      };

      const zoomOut = $.create('button', 'nexus-zoom-out', container);
      zoomOut.type = 'button';
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
      zoomOut.onclick = (e) => {
        e.stopPropagation();
        this._map.zoomOut();
      };

      return container;
    }
  }

  // ============================================================================
  // MAP (Enhanced with new features)
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
        attributionControl: true,
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
      this._renderer = null;
      this._controls = [];
      this._init();

      if (this.options.layers) {
        this.options.layers.forEach(layer => {
          this.addLayer(layer);
        });
      }
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
        shadowPane: $.create('div', 'nexus-shadow-pane'),
        overlayPane: $.create('div', 'nexus-overlay-pane'),
        markerPane: $.create('div', 'nexus-marker-pane')
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
      this._panes.shadowPane.style.cssText = 'position: absolute; pointer-events: none;';
      this._panes.overlayPane.style.cssText = 'position: absolute; pointer-events: none;';
      this._panes.markerPane.style.cssText = 'position: absolute; pointer-events: none;';
      
      this._panes.mapPane.append(
        this._panes.tilePane, 
        this._panes.shadowPane,
        this._panes.overlayPane,
        this._panes.markerPane
      );
      this._setupInteractions();
      if (this.options.zoomControl) this._addZoomControl();
      if (this.options.attributionControl) {
        this.attributionControl = new AttributionControl();
        this.attributionControl.onAdd(this);
      }
      if (this.options.trackResize) {
        this._setupResizeObserver();
      }
      this._initControls();
      this._update();
    }
    _initControls() {
      this._controlCorners = {
        topleft: $.create('div', 'nexus-control-corner nexus-control-top nexus-control-left', this._container),
        topright: $.create('div', 'nexus-control-corner nexus-control-top nexus-control-right', this._container),
        bottomleft: $.create('div', 'nexus-control-corner nexus-control-bottom nexus-control-left', this._container),
        bottomright: $.create('div', 'nexus-control-corner nexus-control-bottom nexus-control-right', this._container),
      };
      for (const corner in this._controlCorners) {
        this._controlCorners[corner].style.cssText = `
          position: absolute;
          z-index: 1000;
          pointer-events: none;
        `;
      }
      this._controlCorners.topleft.style.top = '0';
      this._controlCorners.topleft.style.left = '0';
      this._controlCorners.topright.style.top = '0';
      this._controlCorners.topright.style.right = '0';
      this._controlCorners.bottomleft.style.bottom = '0';
      this._controlCorners.bottomleft.style.left = '0';
      this._controlCorners.bottomright.style.bottom = '0';
      this._controlCorners.bottomright.style.right = '0';

      if (this.options.zoomControl) {
        this.zoomControl = new ZoomControl();
        this.addControl(this.zoomControl);
      }
      if (this.options.attributionControl) {
        this.attributionControl = new AttributionControl();
        this.addControl(this.attributionControl);
      }
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
    fitBounds(bounds, options = {}) {
      bounds = bounds instanceof LatLngBounds ? bounds : new LatLngBounds(bounds);
      if (!bounds.isValid()) return this;
      
      const padding = options.padding || [0, 0];
      const paddingTL = options.paddingTopLeft || padding;
      const paddingBR = options.paddingBottomRight || padding;
      
      const size = this.getSize();
      const targetSize = size.sub(new Point(paddingTL[0] + paddingBR[0], paddingTL[1] + paddingBR[1]));
      
      const center = bounds.getCenter();
      const nw = bounds.getNW();
      const se = bounds.getSE();
      
      let zoom = this.options.maxZoom;
      for (let z = this.options.minZoom; z <= this.options.maxZoom; z++) {
        this._zoom = z;
        const nwPoint = this.latLngToContainerPoint(nw);
        const sePoint = this.latLngToContainerPoint(se);
        const boundsSize = sePoint.sub(nwPoint);
        
        if (boundsSize.x <= targetSize.x && boundsSize.y <= targetSize.y) {
          zoom = z;
        } else {
          break;
        }
      }
      
      if (options.maxZoom) {
        zoom = Math.min(zoom, options.maxZoom);
      }
      
      return this.setView(center, zoom);
    }
    addControl(control) {
      if (!(control instanceof Control)) {
        throw new Error('NexusMap.addControl: control must extend Control');
      }
      if (this._controls.indexOf(control) === -1) {
        this._controls.push(control);
        control.onAdd(this);
      }
      return this;
    }
    removeControl(control) {
      const idx = this._controls.indexOf(control);
      if (idx > -1) {
        this._controls.splice(idx, 1);
        control.onRemove();
      }
      return this;
    }
    addLayer(layer) {
      if (!(layer instanceof Layer)) {
        throw new Error('NexusMap.addLayer: layer must extend Layer');
      }
      if (this._layers.indexOf(layer) === -1) {
        this._layers.push(layer);
        layer.onAdd(this);
        if (layer.options && layer.options.attribution && this.attributionControl) {
          this.attributionControl.addAttribution(layer.options.attribution);
        }
      }
      return this;
    }
    removeLayer(layer) {
      const idx = this._layers.indexOf(layer);
      if (idx > -1) {
        this._layers.splice(idx, 1);
        layer.onRemove();
        if (layer.options && layer.options.attribution && this.attributionControl) {
          this.attributionControl.removeAttribution(layer.options.attribution);
        }
      }
      return this;
    }
    hasLayer(layer) {
      return this._layers.indexOf(layer) !== -1;
    }
    eachLayer(fn, context) {
      this._layers.forEach(layer => fn.call(context || this, layer));
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
      if (this.attributionControl) {
        this.attributionControl.onRemove();
        this.attributionControl = null;
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
  // FACTORY FUNCTIONS & EXPORTS
  // ============================================================================
  const Nexus = {
    version: '2.0.0',
    
    // Map
    map: (container, options) => new NexusMap(container, options),
    Map: NexusMap,
    
    // Markers & Icons
    marker: (latlng, options) => new Marker(latlng, options),
    Marker,
    icon: (options) => new Icon(options),
    Icon,
    divIcon: (options) => new DivIcon(options),
    DivIcon,
    
    // Vector Layers
    polyline: (latlngs, options) => new Polyline(latlngs, options),
    Polyline,
    polygon: (latlngs, options) => new Polygon(latlngs, options),
    Polygon,
    rectangle: (bounds, options) => new Rectangle(bounds, options),
    Rectangle,
    circle: (latlng, options) => new Circle(latlng, options),
    Circle,
    circleMarker: (latlng, options) => new CircleMarker(latlng, options),
    CircleMarker,
    
    // Layer Groups
    layerGroup: (layers, options) => new LayerGroup(layers, options),
    LayerGroup,
    featureGroup: (layers, options) => new FeatureGroup(layers, options),
    FeatureGroup,
    
    // GeoJSON
    geoJSON: (geojson, options) => new GeoJSON(geojson, options),
    geoJson: (geojson, options) => new GeoJSON(geojson, options),
    GeoJSON,
    
    // Overlays
    imageOverlay: (url, bounds, options) => new ImageOverlay(url, bounds, options),
    ImageOverlay,
    svgOverlay: (svg, bounds, options) => new SVGOverlay(svg, bounds, options),
    SVGOverlay,
    
    // Tile Layers
    tileLayer: (url, options) => new TileLayer(url, options),
    TileLayer,
    
    // UI
    popup: (options) => new Popup(options),
    Popup,
    
    // Controls
    control: {
      zoom: (options) => new ZoomControl(options),
      layers: (base, overlays, options) => new LayersControl(base, overlays, options),
      attribution: (options) => new AttributionControl(options),
    },
    ZoomControl,
    LayersControl,
    AttributionControl,
    Control,

    // Geometry
    latLng: (lat, lng, alt) => new LatLng(lat, lng, alt),
    LatLng,
    latLngBounds: (sw, ne) => new LatLngBounds(sw, ne),
    LatLngBounds,
    point: (x, y) => new Point(x, y),
    Point,
    bounds: (a, b) => new Bounds(a, b),
    Bounds,
    
    // Base Classes
    Layer,
    Path,
    SVGRenderer,
    
    // Utilities
    $,
    Projection,
    EventEmitter
  };

  return Nexus;
});