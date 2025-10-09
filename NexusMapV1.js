/**
 * Nexus Maps v1.0 — A lightweight, dependency-free JavaScript mapping library.
 * @fileoverview
 * - Mobile-first, under 60KB unminified
 * - Zero external dependencies; pure ES6+
 * - Full touch gestures, tile layers, markers, popups, and controls
 * - Compliant with Google JavaScript Style Guide (jsguide.html)
 */

// === NEXUS UTILS ===
class NexusUtils {
  static clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  static wrapNum(value, min, max) {
    const range = max - min;
    return ((value - min) % range + range) % range + min;
  }

  static debounce(func, delay) {
    let timeoutId = null;
    return function(...args) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        func.apply(this, args);
      }, delay);
    };
  }

  static throttle(func, delay) {
    let lastCall = 0;
    let timeoutId = null;
    return function(...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        func.apply(this, args);
        lastCall = now;
      } else if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          func.apply(this, args);
          lastCall = Date.now();
          timeoutId = null;
        }, delay - (now - lastCall));
      }
    };
  }

  static shallowEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
      return false;
    }
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (const key of keysA) {
      if (!Object.prototype.hasOwnProperty.call(b, key) || a[key] !== b[key]) {
        return false;
      }
    }
    return true;
  }

  static createEl(tagName, attrs = {}, text = '') {
    const el = document.createElement(tagName);
    if (text) {
      el.textContent = text;
    }
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    return el;
  }

  static removeEl(el) {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  static now() {
    return Date.now();
  }
}

// === NEXUS EVENT SYSTEM ===
class NexusEventSystem {
  constructor() {
    /** @private {!Object<string, !Array<!Function>>} */
    this.listeners_ = {};
  }

  on(type, callback) {
    if (!this.listeners_[type]) {
      this.listeners_[type] = [];
    }
    this.listeners_[type].push(callback);
    return this;
  }

  off(type, callback = undefined) {
    if (callback === undefined) {
      delete this.listeners_[type];
    } else if (this.listeners_[type]) {
      const index = this.listeners_[type].indexOf(callback);
      if (index !== -1) {
        this.listeners_[type].splice(index, 1);
      }
      if (this.listeners_[type].length === 0) {
        delete this.listeners_[type];
      }
    }
    return this;
  }

  emit(type, ...args) {
    const listeners = this.listeners_[type];
    if (listeners) {
      const copy = listeners.slice();
      for (const listener of copy) {
        listener(...args);
      }
    }
    return this;
  }

  hasListeners(type) {
    return !!this.listeners_[type] && this.listeners_[type].length > 0;
  }
}

// === NEXUS PROJECTION ===
class NexusProjection {
  static get WORLD_SIZE_() {
    return 256;
  }

  static latToY_(lat) {
    const sin = Math.sin(lat * Math.PI / 180);
    const y = Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
    return NexusUtils.clamp(0.5 - y, 0, 1);
  }

  static yToLat_(y) {
    const yClamped = NexusUtils.clamp(y, 0, 1);
    const latRad = Math.atan(Math.sinh((0.5 - yClamped) * (4 * Math.PI)));
    return latRad * 180 / Math.PI;
  }

  static project(latLng, zoom) {
    const scale = Math.pow(2, zoom) * NexusProjection.WORLD_SIZE_;
    const x = NexusUtils.wrapNum(latLng.lng, -180, 180) / 360 + 0.5;
    const y = NexusProjection.latToY_(latLng.lat);
    return {
      x: x * scale,
      y: y * scale,
    };
  }

  static unproject(point, zoom) {
    const scale = Math.pow(2, zoom) * NexusProjection.WORLD_SIZE_;
    const x = point.x / scale;
    const y = point.y / scale;
    const lng = NexusUtils.wrapNum((x - 0.5) * 360, -180, 180);
    const lat = NexusProjection.yToLat_(y);
    return { lat, lng };
  }

  static wrapPoint(point, zoom) {
    const worldSize = Math.pow(2, zoom) * NexusProjection.WORLD_SIZE_;
    const wraps = Math.floor((point.x + worldSize / 2) / worldSize);
    const wrappedX = point.x - wraps * worldSize;
    return {
      x: wrappedX,
      y: point.y,
      wrappedLngOffset: wraps,
    };
  }
}

// === NEXUS TOUCH ENGINE ===
class NexusTouchEngine {
  constructor(container, eventSystem) {
    /** @private {!Element} */
    this.container_ = container;

    /** @private {!NexusEventSystem} */
    this.eventSystem_ = eventSystem;

    /** @private {boolean} */
    this.isPanning_ = false;

    /** @private {{x: number, y: number} | null} */
    this.startPanPoint_ = null;

    /** @private {{x: number, y: number} | null} */
    this.lastPanPoint_ = null;

    /** @private {number} */
    this.lastTimestamp_ = 0;

    /** @private {{x: number, y: number}} */
    this.velocity_ = { x: 0, y: 0 };

    /** @private {number | null} */
    this.doubleTapTimeout_ = null;

    /** @private {number} */
    this.zoomFactor_ = 1.5;

    this.onPointerDown_ = this.onPointerDown_.bind(this);
    this.onPointerMove_ = this.onPointerMove_.bind(this);
    this.onPointerUp_ = this.onPointerUp_.bind(this);
    this.onWheel_ = this.onWheel_.bind(this);

    this.container_.style.touchAction = 'none';

    this.container_.addEventListener('pointerdown', this.onPointerDown_);
    this.container_.addEventListener('wheel', this.onWheel_, { passive: false });
  }

  destroy() {
    this.container_.removeEventListener('pointerdown', this.onPointerDown_);
    this.container_.removeEventListener('pointermove', this.onPointerMove_);
    this.container_.removeEventListener('pointerup', this.onPointerUp_);
    this.container_.removeEventListener('pointercancel', this.onPointerUp_);
    this.container_.removeEventListener('wheel', this.onWheel_);
  }

  onPointerDown_(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;

    e.preventDefault();
    this.startPanPoint_ = this.lastPanPoint_ = { x: e.clientX, y: e.clientY };
    this.lastTimestamp_ = NexusUtils.now();
    this.isPanning_ = true;

    this.container_.addEventListener('pointermove', this.onPointerMove_);
    this.container_.addEventListener('pointerup', this.onPointerUp_);
    this.container_.addEventListener('pointercancel', this.onPointerUp_);

    this.eventSystem_.emit('panstart', this.lastPanPoint_);
  }

  onPointerMove_(e) {
    if (!this.isPanning_) return;
    e.preventDefault();

    const current = { x: e.clientX, y: e.clientY };
    const delta = {
      x: current.x - this.lastPanPoint_.x,
      y: current.y - this.lastPanPoint_.y,
    };

    const now = NexusUtils.now();
    const dt = Math.max(16, now - this.lastTimestamp_);

    this.velocity_ = {
      x: delta.x / dt,
      y: delta.y / dt,
    };

    this.lastPanPoint_ = current;
    this.lastTimestamp_ = now;

    this.eventSystem_.emit('pan', delta, current);
  }

  onPointerUp_(e) {
    if (!this.isPanning_) return;
    e.preventDefault();

    this.isPanning_ = false;

    this.container_.removeEventListener('pointermove', this.onPointerMove_);
    this.container_.removeEventListener('pointerup', this.onPointerUp_);
    this.container_.removeEventListener('pointercancel', this.onPointerUp_);

    this.eventSystem_.emit('panend', this.velocity_);
    this.eventSystem_.emit('inertia', this.velocity_);

    if (e.pointerType === 'touch') {
      if (this.doubleTapTimeout_ !== null) {
        clearTimeout(this.doubleTapTimeout_);
        this.doubleTapTimeout_ = null;
        this.eventSystem_.emit('doubletap', this.lastPanPoint_);
      } else {
        this.doubleTapTimeout_ = setTimeout(() => {
          this.doubleTapTimeout_ = null;
        }, 300);
      }
    }
  }

  onWheel_(e) {
    e.preventDefault();

    const delta = e.deltaY > 0 ? -1 : 1;
    const factor = Math.pow(this.zoomFactor_, delta * 0.2);
    const point = { x: e.clientX, y: e.clientY };

    this.eventSystem_.emit('zoom', factor, point);
  }
}

// === NEXUS ANIMATION ===
class NexusAnimation {
  constructor(map) {
    /** @private {!NexusMap} */
    this.map_ = map;

    /** @private {number | null} */
    this.rafId_ = null;

    /** @private {boolean} */
    this.isAnimating_ = false;
  }

  easeInOutCubic_(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
  }

  panTo(targetCenter, durationMs = 400) {
    if (this.isAnimating_) {
      this.cancel();
    }

    const startCenter = this.map_.getCenter();
    const startTime = NexusUtils.now();
    const endTime = startTime + durationMs;

    this.isAnimating_ = true;

    return new Promise((resolve) => {
      const animate = () => {
        if (!this.isAnimating_) {
          resolve();
          return;
        }

        const now = NexusUtils.now();
        if (now >= endTime) {
          this.map_.setCenter(targetCenter);
          this.isAnimating_ = false;
          this.map_.eventSystem_.emit('moveend');
          resolve();
          return;
        }

        const progress = this.easeInOutCubic_((now - startTime) / durationMs);
        const currentLat = startCenter.lat + (targetCenter.lat - startCenter.lat) * progress;
        const currentLng = NexusUtils.wrapNum(
          startCenter.lng + (NexusUtils.wrapNum(targetCenter.lng - startCenter.lng, -180, 180)) * progress,
          -180,
          180
        );
        this.map_.setCenter({ lat: currentLat, lng: currentLng });
        this.map_.eventSystem_.emit('move');

        this.rafId_ = requestAnimationFrame(animate);
      };

      this.map_.eventSystem_.emit('movestart');
      this.rafId_ = requestAnimationFrame(animate);
    });
  }

  zoomTo(targetZoom, focalPoint = undefined, durationMs = 300) {
    if (this.isAnimating_) {
      this.cancel();
    }

    const startZoom = this.map_.getZoom();
    const clampedTarget = NexusUtils.clamp(targetZoom, this.map_.minZoom_, this.map_.maxZoom_);
    if (Math.abs(clampedTarget - startZoom) < 1e-6) {
      return Promise.resolve();
    }

    const startTime = NexusUtils.now();
    const endTime = startTime + durationMs;
    const startCenter = this.map_.getCenter();

    let fixedWorldPoint = null;
    if (focalPoint) {
      const containerRect = this.map_.container_.getBoundingClientRect();
      const focalContainer = {
        x: focalPoint.x,
        y: focalPoint.y,
      };
      const focalWorld = {
        x: this.map_.pixelOrigin_.x + focalContainer.x,
        y: this.map_.pixelOrigin_.y + focalContainer.y,
      };
      fixedWorldPoint = focalWorld;
    }

    this.isAnimating_ = true;

    return new Promise((resolve) => {
      const animate = () => {
        if (!this.isAnimating_) {
          resolve();
          return;
        }

        const now = NexusUtils.now();
        if (now >= endTime) {
          this.map_.setZoom(clampedTarget);
          if (focalPoint) {
            const containerRect = this.map_.container_.getBoundingClientRect();
            const finalPixelOrigin = {
              x: fixedWorldPoint.x - focalPoint.x,
              y: fixedWorldPoint.y - focalPoint.y,
            };
            this.map_.pixelOrigin_ = finalPixelOrigin;
            const newCenter = this.map_.containerPointToLatLng({
              x: containerRect.width / 2,
              y: containerRect.height / 2,
            });
            this.map_.setCenter(newCenter);
          }
          this.isAnimating_ = false;
          this.map_.eventSystem_.emit('zoomend');
          resolve();
          return;
        }

        const progress = this.easeInOutCubic_((now - startTime) / durationMs);
        const currentZoom = startZoom + (clampedTarget - startZoom) * progress;

        if (focalPoint && fixedWorldPoint) {
          const scale = Math.pow(2, currentZoom);
          const ratio = Math.pow(2, startZoom) / scale;
          this.map_.pixelOrigin_.x = fixedWorldPoint.x - focalPoint.x * ratio;
          this.map_.pixelOrigin_.y = fixedWorldPoint.y - focalPoint.y * ratio;
          const containerRect = this.map_.container_.getBoundingClientRect();
          const newCenter = this.map_.containerPointToLatLng({
            x: containerRect.width / 2,
            y: containerRect.height / 2,
          });
          this.map_.center_ = newCenter;
        }

        this.map_.zoom_ = currentZoom;
        this.map_.render_();
        this.map_.eventSystem_.emit('zoom');

        this.rafId_ = requestAnimationFrame(animate);
      };

      this.map_.eventSystem_.emit('zoomstart');
      this.rafId_ = requestAnimationFrame(animate);
    });
  }

  cancel() {
    if (this.rafId_ !== null) {
      cancelAnimationFrame(this.rafId_);
      this.rafId_ = null;
    }
    this.isAnimating_ = false;
  }

  isAnimating() {
    return this.isAnimating_;
  }
}

// === NEXUS MAP ===
class NexusMap {
  constructor(container, options = {}) {
    /** @private {!Element} */
    this.container_ = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!this.container_) {
      throw new Error('NexusMap: container not found');
    }

    /** @private {!NexusEventSystem} */
    this.eventSystem_ = new NexusEventSystem();

    /** @private {{lat: number, lng: number}} */
    this.center_ = options.center || { lat: 0, lng: 0 };

    /** @private {number} */
    this.zoom_ = options.zoom != null ? options.zoom : 0;

    /** @private {number} */
    this.minZoom_ = options.minZoom != null ? options.minZoom : 0;

    /** @private {number} */
    this.maxZoom_ = options.maxZoom != null ? options.maxZoom : 18;

    this.zoom_ = NexusUtils.clamp(this.zoom_, this.minZoom_, this.maxZoom_);

    /** @private {!Element} */
    this.mapPane_ = NexusUtils.createEl('div', {
      'class': 'nexus-map-pane',
      'style': 'position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;',
    });
    this.container_.appendChild(this.mapPane_);

    /** @private {!NexusTouchEngine} */
    this.touchEngine_ = new NexusTouchEngine(this.mapPane_, this.eventSystem_);

    /** @private {!NexusAnimation} */
    this.animation_ = new NexusAnimation(this);

    this.onPanStart_ = this.onPanStart_.bind(this);
    this.onPan_ = this.onPan_.bind(this);
    this.onPanEnd_ = this.onPanEnd_.bind(this);
    this.onInertia_ = this.onInertia_.bind(this);
    this.onZoom_ = this.onZoom_.bind(this);
    this.onDoubleTap_ = this.onDoubleTap_.bind(this);

    this.eventSystem_
      .on('panstart', this.onPanStart_)
      .on('pan', this.onPan_)
      .on('panend', this.onPanEnd_)
      .on('inertia', this.onInertia_)
      .on('zoom', this.onZoom_)
      .on('doubletap', this.onDoubleTap_);

    /** @private {{x: number, y: number}} */
    this.pixelOrigin_ = { x: 0, y: 0 };

    this.updatePixelOrigin_();
    this.render_();
  }

  updatePixelOrigin_() {
    const containerRect = this.container_.getBoundingClientRect();
    const centerPixel = NexusProjection.project(this.center_, this.zoom_);
    this.pixelOrigin_ = {
      x: centerPixel.x - containerRect.width / 2,
      y: centerPixel.y - containerRect.height / 2,
    };
  }

  latLngToContainerPoint(latLng) {
    const point = NexusProjection.project(latLng, this.zoom_);
    return {
      x: point.x - this.pixelOrigin_.x,
      y: point.y - this.pixelOrigin_.y,
    };
  }

  containerPointToLatLng(point) {
    const worldPoint = {
      x: point.x + this.pixelOrigin_.x,
      y: point.y + this.pixelOrigin_.y,
    };
    return NexusProjection.unproject(worldPoint, this.zoom_);
  }

  setCenter(center) {
    this.center_ = center;
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('move');
    return this;
  }

  setZoom(zoom) {
    this.zoom_ = NexusUtils.clamp(zoom, this.minZoom_, this.maxZoom_);
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('zoomend');
    return this;
  }

  setView(center, zoom) {
    this.center_ = center;
    this.zoom_ = NexusUtils.clamp(zoom, this.minZoom_, this.maxZoom_);
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('move');
    this.eventSystem_.emit('zoomend');
    return this;
  }

  flyTo(center, durationMs = 400) {
    return this.animation_.panTo(center, durationMs);
  }

  flyZoom(zoom, focalPoint, durationMs = 300) {
    return this.animation_.zoomTo(zoom, focalPoint, durationMs);
  }

  cancelAnimation() {
    this.animation_.cancel();
  }

  isAnimating() {
    return this.animation_.isAnimating();
  }

  getCenter() {
    return this.center_;
  }

  getZoom() {
    return this.zoom_;
  }

  render_() {
    // Hook for future layer integration
  }

  onPanStart_(startPoint) {
    this.eventSystem_.emit('movestart');
  }

  onPan_(delta, currentPoint) {
    this.pixelOrigin_.x -= delta.x;
    this.pixelOrigin_.y -= delta.y;

    const containerRect = this.container_.getBoundingClientRect();
    const centerPixel = {
      x: this.pixelOrigin_.x + containerRect.width / 2,
      y: this.pixelOrigin_.y + containerRect.height / 2,
    };
    this.center_ = NexusProjection.unproject(centerPixel, this.zoom_);
    this.center_.lng = NexusUtils.wrapNum(this.center_.lng, -180, 180);

    this.render_();
    this.eventSystem_.emit('move');
  }

  onPanEnd_(velocity) {
    this.eventSystem_.emit('moveend');
  }

  onInertia_(velocity) {
    if (Math.abs(velocity.x) < 0.01 && Math.abs(velocity.y) < 0.01) return;

    const decay = 0.0005;
    const duration = Math.min(800, Math.log(1 / (Math.max(Math.abs(velocity.x), Math.abs(velocity.y)) * 1000)) / decay);
    const distanceX = velocity.x / decay;
    const distanceY = velocity.y / decay;

    const containerRect = this.container_.getBoundingClientRect();
    const currentCenterPx = NexusProjection.project(this.center_, this.zoom_);
    const targetCenterPx = {
      x: currentCenterPx.x - distanceX,
      y: currentCenterPx.y - distanceY,
    };
    const targetCenter = NexusProjection.unproject(targetCenterPx, this.zoom_);
    targetCenter.lng = NexusUtils.wrapNum(targetCenter.lng, -180, 180);

    this.flyTo(targetCenter, duration);
  }

  onZoom_(factor, focalPoint) {
    const oldZoom = this.zoom_;
    const newZoom = NexusUtils.clamp(oldZoom + Math.log2(factor), this.minZoom_, this.maxZoom_);

    if (Math.abs(newZoom - oldZoom) < 1e-6) return;

    const containerRect = this.container_.getBoundingClientRect();
    const focalContainer = {
      x: focalPoint.x - containerRect.left,
      y: focalPoint.y - containerRect.top,
    };
    const focalWorld = {
      x: this.pixelOrigin_.x + focalContainer.x,
      y: this.pixelOrigin_.y + focalContainer.y,
    };

    const scaleOld = Math.pow(2, oldZoom);
    const scaleNew = Math.pow(2, newZoom);
    const ratio = scaleOld / scaleNew;
    this.pixelOrigin_.x = focalWorld.x - focalContainer.x * ratio;
    this.pixelOrigin_.y = focalWorld.y - focalContainer.y * ratio;

    this.zoom_ = newZoom;
    this.center_ = this.containerPointToLatLng({
      x: containerRect.width / 2,
      y: containerRect.height / 2,
    });

    this.render_();
    this.eventSystem_.emit('zoom');
  }

  onDoubleTap_(tapPoint) {
    const containerRect = this.container_.getBoundingClientRect();
    const clientPoint = { x: tapPoint.x, y: tapPoint.y };
    const containerPoint = {
      x: tapPoint.x - containerRect.left,
      y: tapPoint.y - containerRect.top,
    };

    const targetZoom = Math.min(this.zoom_ + 1, this.maxZoom_);
    this.flyZoom(targetZoom, containerPoint);
  }

  destroy() {
    this.touchEngine_.destroy();
    NexusUtils.removeEl(this.mapPane_);
    this.eventSystem_
      .off('panstart', this.onPanStart_)
      .off('pan', this.onPan_)
      .off('panend', this.onPanEnd_)
      .off('inertia', this.onInertia_)
      .off('zoom', this.onZoom_)
      .off('doubletap', this.onDoubleTap_);
  }

  on(type, callback) {
    this.eventSystem_.on(type, callback);
    return this;
  }

  off(type, callback) {
    this.eventSystem_.off(type, callback);
    return this;
  }
}

// === NEXUS TILE LAYER ===
class NexusTileLayer {
  constructor(urlTemplate, options = {}) {
    /** @private {string} */
    this.urlTemplate_ = urlTemplate;

    /** @private {string} */
    this.subdomains_ = options.subdomains || 'abc';

    /** @private {number} */
    this.minZoom_ = options.minZoom != null ? options.minZoom : 0;

    /** @private {number} */
    this.maxZoom_ = options.maxZoom != null ? options.maxZoom : 18;

    /** @private {number} */
    this.errorRetryCount_ = options.errorRetryCount != null ? options.errorRetryCount : 2;

    /** @private {number} */
    this.tileSize_ = options.tileSize != null ? options.tileSize : 256;

    /** @private {number} */
    this.maxCacheSize_ = options.maxCacheSize != null ? options.maxCacheSize : 100;

    /** @private {!Map<string, !HTMLImageElement>} */
    this.tileCache_ = new Map();

    /** @private {!Set<string>} */
    this.loadingTiles_ = new Set();

    /** @private {!Element | null} */
    this.container_ = null;

    /** @private {!NexusMap | null} */
    this.map_ = null;
  }

  addTo(map) {
    this.map_ = map;
    this.container_ = NexusUtils.createEl('div', {
      'class': 'nexus-tile-layer',
      'style': 'position:absolute;top:0;left:0;width:100%;height:100%;',
    });
    map.mapPane_.appendChild(this.container_);

    this.updateTiles_();

    map.on('move', () => this.updateTiles_())
        .on('zoom', () => this.updateTiles_())
        .on('zoomend', () => this.updateTiles_());

    return this;
  }

  getTileKey_(z, x, y) {
    return `${z}/${x}/${y}`;
  }

  getTileUrl_(z, x, y) {
    let url = this.urlTemplate_
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y));

    if (url.includes('{s}')) {
      const subdomain = this.subdomains_[Math.abs(x + y) % this.subdomains_.length];
      url = url.replace('{s}', subdomain);
    }
    return url;
  }

  tileToContainerPixel_(x, y, zoom) {
    const scale = Math.pow(2, zoom);
    const worldSize = 256 * scale;
    const containerRect = this.map_.container_.getBoundingClientRect();
    const origin = this.map_.pixelOrigin_;

    return {
      x: x * this.tileSize_ - origin.x,
      y: y * this.tileSize_ - origin.y,
    };
  }

  getVisibleTileCoords_() {
    const zoom = Math.round(this.map_.getZoom());
    if (zoom < this.minZoom_ || zoom > this.maxZoom_) {
      return [];
    }

    const containerRect = this.map_.container_.getBoundingClientRect();
    const topLeft = this.map_.containerPointToLatLng({ x: 0, y: 0 });
    const bottomRight = this.map_.containerPointToLatLng({
      x: containerRect.width,
      y: containerRect.height,
    });

    const topLeftPx = NexusProjection.project(topLeft, zoom);
    const bottomRightPx = NexusProjection.project(bottomRight, zoom);

    const tilesWide = Math.pow(2, zoom);
    const minX = Math.floor(topLeftPx.x / this.tileSize_);
    const maxX = Math.floor(bottomRightPx.x / this.tileSize_);
    const minY = Math.floor(topLeftPx.y / this.tileSize_);
    const maxY = Math.floor(bottomRightPx.y / this.tileSize_);

    const coords = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const wrappedX = NexusUtils.wrapNum(x, 0, tilesWide);
        coords.push({ z: zoom, x: wrappedX, y });
      }
    }
    return coords;
  }

  cacheTile_(key, img) {
    if (this.tileCache_.has(key)) {
      this.tileCache_.delete(key);
    }
    this.tileCache_.set(key, img);
    while (this.tileCache_.size > this.maxCacheSize_) {
      const oldestKey = this.tileCache_.keys().next().value;
      const oldestTile = this.tileCache_.get(oldestKey);
      if (oldestTile && oldestTile.parentNode) {
        oldestTile.parentNode.removeChild(oldestTile);
      }
      this.tileCache_.delete(oldestKey);
    }
  }

  getCachedTile_(key) {
    if (!this.tileCache_.has(key)) {
      return undefined;
    }
    const tile = this.tileCache_.get(key);
    this.tileCache_.delete(key);
    this.tileCache_.set(key, tile);
    return tile;
  }

  updateTiles_() {
    if (!this.map_ || !this.container_) return;

    const visibleCoords = this.getVisibleTileCoords_();
    const visibleKeys = new Set();

    for (const { z, x, y } of visibleCoords) {
      const key = this.getTileKey_(z, x, y);
      visibleKeys.add(key);

      const cached = this.getCachedTile_(key);
      if (cached) {
        if (!cached.parentNode) {
          this.container_.appendChild(cached);
        }
        continue;
      }

      if (this.loadingTiles_.has(key)) {
        continue;
      }

      this.loadingTiles_.add(key);
      this.loadTile_(z, x, y, key, 0);
    }

    for (const [key, tile] of this.tileCache_) {
      if (!visibleKeys.has(key) && tile.parentNode) {
        tile.parentNode.removeChild(tile);
      }
    }
  }

  loadTile_(z, x, y, key, attempt) {
    const url = this.getTileUrl_(z, x, y);
    const img = new Image();
    img.style.position = 'absolute';
    img.style.width = `${this.tileSize_}px`;
    img.style.height = `${this.tileSize_}px`;

    const position = this.tileToContainerPixel_(x, y, z);
    img.style.left = `${position.x}px`;
    img.style.top = `${position.y}px`;

    const onLoad = () => {
      this.loadingTiles_.delete(key);
      this.cacheTile_(key, img);
      if (this.container_) {
        this.container_.appendChild(img);
      }
    };

    const onError = () => {
      this.loadingTiles_.delete(key);
      if (attempt < this.errorRetryCount_) {
        this.loadingTiles_.add(key);
        this.loadTile_(z, x, y, key, attempt + 1);
      }
    };

    img.addEventListener('load', onLoad, { once: true });
    img.addEventListener('error', onError, { once: true });
    img.src = url;
  }

  remove() {
    if (this.container_ && this.container_.parentNode) {
      NexusUtils.removeEl(this.container_);
    }
    for (const tile of this.tileCache_.values()) {
      if (tile.parentNode) {
        tile.parentNode.removeChild(tile);
      }
    }
    this.tileCache_.clear();
    this.loadingTiles_.clear();
    this.container_ = null;
    this.map_ = null;
  }
}

// === NEXUS MARKER ===
class NexusMarker {
  constructor(latLng, options = {}) {
    /** @private {{lat: number, lng: number}} */
    this.latLng_ = latLng;

    /** @private {boolean} */
    this.draggable_ = options.draggable === true;

    /** @private {!Element} */
    this.element_ = options.icon || NexusUtils.createEl('div', {
      'class': 'nexus-marker',
      'style': `
        width: 24px;
        height: 36px;
        background: #3388ff;
        border-radius: 4px 4px 0 4px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        position: absolute;
        transform: translate(-50%, -100%);
        cursor: ${this.draggable_ ? 'move' : 'pointer'};
      `,
    });

    /** @private {!NexusMap | null} */
    this.map_ = null;

    /** @private {boolean} */
    this.isDragging_ = false;

    /** @private {{x: number, y: number} | null} */
    this.dragStartOffset_ = null;

    if (this.draggable_) {
      this.element_.addEventListener('pointerdown', this.onPointerDown_);
    }
  }

  addTo(map) {
    this.map_ = map;
    map.mapPane_.appendChild(this.element_);
    this.updatePosition_();
    map.on('move', () => this.updatePosition_());
    return this;
  }

  updatePosition_() {
    if (!this.map_) return;
    const point = this.map_.latLngToContainerPoint(this.latLng_);
    this.element_.style.left = `${point.x}px`;
    this.element_.style.top = `${point.y}px`;
  }

  setLatLng(latLng) {
    this.latLng_ = latLng;
    this.updatePosition_();
    if (this.map_) {
      this.map_.eventSystem_.emit('markermove', this);
    }
    return this;
  }

  getLatLng() {
    return this.latLng_;
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.updatePosition_());
      this.map_ = null;
    }
    if (this.draggable_) {
      this.element_.removeEventListener('pointerdown', this.onPointerDown_);
    }
    NexusUtils.removeEl(this.element_);
  }

  onPointerDown_(e) {
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    e.preventDefault();

    const containerRect = this.map_.container_.getBoundingClientRect();
    const currentScreenPos = this.map_.latLngToContainerPoint(this.latLng_);
    this.dragStartOffset_ = {
      x: currentScreenPos.x - (e.clientX - containerRect.left),
      y: currentScreenPos.y - (e.clientY - containerRect.top),
    };

    this.isDragging_ = true;
    document.addEventListener('pointermove', this.onPointerMove_);
    document.addEventListener('pointerup', this.onPointerUp_);
    document.addEventListener('pointercancel', this.onPointerUp_);
  }

  onPointerMove_(e) {
    if (!this.isDragging_ || !this.map_) return;
    e.preventDefault();

    const containerRect = this.map_.container_.getBoundingClientRect();
    const clientX = e.clientX - containerRect.left;
    const clientY = e.clientY - containerRect.top;

    const newScreenPos = {
      x: clientX + this.dragStartOffset_.x,
      y: clientY + this.dragStartOffset_.y,
    };

    const newLatLng = this.map_.containerPointToLatLng(newScreenPos);
    this.setLatLng(newLatLng);
  }

  onPointerUp_(e) {
    if (!this.isDragging_) return;
    e.preventDefault();

    this.isDragging_ = false;
    document.removeEventListener('pointermove', this.onPointerMove_);
    document.removeEventListener('pointerup', this.onPointerUp_);
    document.removeEventListener('pointercancel', this.onPointerUp_);
    this.dragStartOffset_ = null;
  }
}

// === NEXUS POPUP ===
class NexusPopup {
  constructor(content, options = {}) {
    /** @private {string} */
    this.content_ = content;

    /** @private {number} */
    this.maxWidth_ = options.maxWidth != null ? options.maxWidth : 300;

    /** @private {string} */
    this.className_ = options.className || 'nexus-popup';

    /** @private {!Element} */
    this.element_ = this.createPopupElement_();

    /** @private {!NexusMap | null} */
    this.map_ = null;

    /** @private {{lat: number, lng: number} | null} */
    this.latLng_ = null;

    /** @private {!NexusMarker | null} */
    this.marker_ = null;
  }

  createPopupElement_() {
    const container = NexusUtils.createEl('div', {
      'class': this.className_,
      'style': `
        position: absolute;
        max-width: ${this.maxWidth_}px;
        padding: 6px 8px;
        background: white;
        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
        border-radius: 4px;
        font: 12px/1.4 sans-serif;
        white-space: normal;
        pointer-events: auto;
        z-index: 1000;
        display: none;
      `,
    });

    container.innerHTML = this.content_;
    return container;
  }

  addTo(map, latLng) {
    this.map_ = map;
    this.latLng_ = latLng;
    this.marker_ = null;
    map.mapPane_.appendChild(this.element_);
    this.updatePosition_();
    map.on('move', () => this.updatePosition_());
    this.element_.style.display = 'block';
    return this;
  }

  bindToMarker(marker) {
    this.marker_ = marker;
    this.latLng_ = null;
    this.map_ = marker.map_;
    if (this.map_) {
      this.map_.mapPane_.appendChild(this.element_);
      this.updatePosition_();
      this.map_.on('move', () => this.updatePosition_());
      this.element_.style.display = 'block';
    }
    return this;
  }

  updatePosition_() {
    if (!this.map_) return;

    let latLng = this.latLng_;
    if (this.marker_) {
      latLng = this.marker_.getLatLng();
    }
    if (!latLng) return;

    const point = this.map_.latLngToContainerPoint(latLng);
    this.element_.style.left = `${point.x}px`;
    this.element_.style.top = `${point.y - this.element_.offsetHeight - 8}px`;
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.updatePosition_());
      this.map_ = null;
    }
    this.latLng_ = null;
    this.marker_ = null;
    NexusUtils.removeEl(this.element_);
  }
}

// === NEXUS CONTROLS ===
class NexusControls {
  constructor(options = {}) {
    /** @private {boolean} */
    this.showZoom_ = options.zoom !== false;

    /** @private {string | null} */
    this.attributionText_ = options.attribution || null;

    /** @private {!Element | null} */
    this.container_ = null;

    /** @private {!NexusMap | null} */
    this.map_ = null;
  }

  addTo(map) {
    this.map_ = map;
    this.container_ = NexusUtils.createEl('div', {
      'class': 'nexus-controls',
      'style': `
        position: absolute;
        top: 10px;
        right: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        z-index: 1000;
      `,
    });

    if (this.showZoom_) {
      this.createZoomControls_();
    }

    if (this.attributionText_) {
      this.createAttribution_();
    }

    map.mapPane_.appendChild(this.container_);
    return this;
  }

  createZoomControls_() {
    const zoomIn = NexusUtils.createEl('button', {
      'type': 'button',
      'aria-label': 'Zoom in',
      'style': `
        width: 30px;
        height: 30px;
        border: 1px solid #ccc;
        background: white;
        cursor: pointer;
        font: bold 18px sans-serif;
        text-align: center;
        user-select: none;
      `,
    }, '+');

    const zoomOut = NexusUtils.createEl('button', {
      'type': 'button',
      'aria-label': 'Zoom out',
      'style': `
        width: 30px;
        height: 30px;
        border: 1px solid #ccc;
        background: white;
        cursor: pointer;
        font: bold 24px sans-serif;
        text-align: center;
        user-select: none;
      `,
    }, '−');

    zoomIn.addEventListener('click', () => {
      const current = this.map_.getZoom();
      this.map_.setZoom(current + 1);
    });

    zoomOut.addEventListener('click', () => {
      const current = this.map_.getZoom();
      this.map_.setZoom(current - 1);
    });

    this.container_.appendChild(zoomIn);
    this.container_.appendChild(zoomOut);
  }

  createAttribution_() {
    const attr = NexusUtils.createEl('div', {
      'class': 'nexus-attribution',
      'style': `
        background: rgba(255, 255, 255, 0.85);
        padding: 2px 6px;
        font: 11px sans-serif;
        color: #333;
        border-radius: 2px;
        max-width: 200px;
        word-wrap: break-word;
      `,
    }, this.attributionText_);

    this.container_.appendChild(attr);
  }

  remove() {
    if (this.container_ && this.container_.parentNode) {
      NexusUtils.removeEl(this.container_);
    }
    this.container_ = null;
    this.map_ = null;
  }
}

// === DEMO FUNCTION ===
/**
 * Creates a fully functional Nexus Maps demo with all components.
 * @param {string} containerId The ID of the HTML element to host the map.
 * @return {{
 *   map: !NexusMap,
 *   tileLayer: !NexusTileLayer,
 *   marker: !NexusMarker,
 *   popup: !NexusPopup,
 *   controls: !NexusControls
 * }}
 */
function createNexusMapDemo(containerId) {
  const map = new NexusMap(containerId, {
    center: { lat: 51.505, lng: -0.09 },
    zoom: 13,
    minZoom: 2,
    maxZoom: 18,
  });

  const tileLayer = new NexusTileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    {
      subdomains: 'abc',
    }
  );
  tileLayer.addTo(map);

  const controls = new NexusControls({
    zoom: true,
    attribution: '© OpenStreetMap contributors',
  });
  controls.addTo(map);

  const marker = new NexusMarker({ lat: 51.5, lng: -0.09 }, { draggable: true });
  marker.addTo(map);

  const popup = new NexusPopup('Hello! Drag me around.', { maxWidth: 200 });
  popup.bindToMarker(marker);

  return { map, tileLayer, marker, popup, controls };
}

// Named exports only — no default export
export {
  NexusMap,
  NexusTileLayer,
  NexusMarker,
  NexusPopup,
  NexusControls,
  NexusUtils,
  NexusEventSystem,
  NexusProjection,
  NexusTouchEngine,
  NexusAnimation,
  createNexusMapDemo,
};
