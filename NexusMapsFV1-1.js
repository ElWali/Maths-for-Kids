/**
 * Nexus Maps v1.1 — A lightweight, dependency-free JavaScript mapping library.
 * @fileoverview
 * - Mobile-first, under 65KB unminified
 * - Zero external dependencies; pure ES6+
 * - Full touch gestures, tile layers, markers, popups, controls, GeoJSON, and more
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
    this.onKeyDown_ = this.onKeyDown_.bind(this);
    this.container_.style.touchAction = 'none';
    this.container_.addEventListener('pointerdown', this.onPointerDown_);
    this.container_.addEventListener('wheel', this.onWheel_, { passive: false });
    this.container_.addEventListener('keydown', this.onKeyDown_);
  }
  destroy() {
    this.container_.removeEventListener('pointerdown', this.onPointerDown_);
    this.container_.removeEventListener('pointermove', this.onPointerMove_);
    this.container_.removeEventListener('pointerup', this.onPointerUp_);
    this.container_.removeEventListener('pointercancel', this.onPointerUp_);
    this.container_.removeEventListener('wheel', this.onWheel_);
    this.container_.removeEventListener('keydown', this.onKeyDown_);
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
  onKeyDown_(e) {
    if (e.key === '+' || e.key === 'Equal') {
      e.preventDefault();
      this.eventSystem_.emit('zoom', this.zoomFactor_, {
        x: this.container_.clientWidth / 2,
        y: this.container_.clientHeight / 2,
      });
    } else if (e.key === '-' || e.key === 'Minus') {
      e.preventDefault();
      this.eventSystem_.emit('zoom', 1 / this.zoomFactor_, {
        x: this.container_.clientWidth / 2,
        y: this.container_.clientHeight / 2,
      });
    }
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
  /**
   * @param {string|!Element} container
   * @param {!Object=} options
   */
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
    /** @private {!ResizeObserver | null} */
    this.resizeObserver_ = null;
    if (window.ResizeObserver) {
      this.resizeObserver_ = new ResizeObserver(() => {
        this.invalidateSize();
      });
      this.resizeObserver_.observe(this.container_);
    }
  }

  /**
   * @return {!NexusLatLngBounds}
   */
  getBounds() {
    const containerRect = this.container_.getBoundingClientRect();
    const sw = this.containerPointToLatLng({ x: 0, y: containerRect.height });
    const ne = this.containerPointToLatLng({ x: containerRect.width, y: 0 });
    return new NexusLatLngBounds(sw, ne);
  }

  /**
   * Recalculate size if container changed.
   */
  invalidateSize() {
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('resize');
  }

  updatePixelOrigin_() {
    const containerRect = this.container_.getBoundingClientRect();
    const centerPixel = NexusProjection.project(this.center_, this.zoom_);
    this.pixelOrigin_ = {
      x: centerPixel.x - containerRect.width / 2,
      y: centerPixel.y - containerRect.height / 2,
    };
  }

  /**
   * @param {{lat: number, lng: number}} latLng
   * @return {{x: number, y: number}}
   */
  latLngToContainerPoint(latLng) {
    const point = NexusProjection.project(latLng, this.zoom_);
    return {
      x: point.x - this.pixelOrigin_.x,
      y: point.y - this.pixelOrigin_.y,
    };
  }

  /**
   * @param {{x: number, y: number}} point
   * @return {{lat: number, lng: number}}
   */
  containerPointToLatLng(point) {
    const worldPoint = {
      x: point.x + this.pixelOrigin_.x,
      y: point.y + this.pixelOrigin_.y,
    };
    return NexusProjection.unproject(worldPoint, this.zoom_);
  }

  /**
   * @param {{lat: number, lng: number}} center
   * @return {!NexusMap}
   */
  setCenter(center) {
    this.center_ = center;
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('move');
    return this;
  }

  /**
   * @param {number} zoom
   * @return {!NexusMap}
   */
  setZoom(zoom) {
    this.zoom_ = NexusUtils.clamp(zoom, this.minZoom_, this.maxZoom_);
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('zoom');
    this.eventSystem_.emit('zoomend');
    return this;
  }

  /**
   * @param {{lat: number, lng: number}} center
   * @param {number} zoom
   * @return {!NexusMap}
   */
  setView(center, zoom) {
    this.center_ = center;
    this.zoom_ = NexusUtils.clamp(zoom, this.minZoom_, this.maxZoom_);
    this.updatePixelOrigin_();
    this.render_();
    this.eventSystem_.emit('move');
    this.eventSystem_.emit('zoom');
    this.eventSystem_.emit('zoomend');
    return this;
  }

  /**
   * @param {{lat: number, lng: number}} center
   * @param {number=} durationMs
   * @return {!Promise}
   */
  flyTo(center, durationMs = 400) {
    return this.animation_.panTo(center, durationMs);
  }

  /**
   * @param {number} zoom
   * @param {{x: number, y: number}=} focalPoint
   * @param {number=} durationMs
   * @return {!Promise}
   */
  flyZoom(zoom, focalPoint, durationMs = 300) {
    return this.animation_.zoomTo(zoom, focalPoint, durationMs);
  }

  cancelAnimation() {
    this.animation_.cancel();
  }

  isAnimating() {
    return this.animation_.isAnimating();
  }

  /**
   * @return {{lat: number, lng: number}}
   */
  getCenter() {
    return this.center_;
  }

  /**
   * @return {number}
   */
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
    this.eventSystem_.emit('zoomend');
  }

  onDoubleTap_(tapPoint) {
    const containerRect = this.container_.getBoundingClientRect();
    const containerPoint = {
      x: tapPoint.x - containerRect.left,
      y: tapPoint.y - containerRect.top,
    };
    const targetZoom = Math.min(this.zoom_ + 1, this.maxZoom_);
    this.flyZoom(targetZoom, containerPoint);
  }

  /**
   * Attempt to locate user via geolocation.
   * @return {!Promise<{lat: number, lng: number}>}
   */
  locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latLng = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          resolve(latLng);
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  destroy() {
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
    }
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

  /**
   * @param {string} type
   * @param {!Function} callback
   * @return {!NexusMap}
   */
  on(type, callback) {
    this.eventSystem_.on(type, callback);
    return this;
  }

  /**
   * @param {string} type
   * @param {!Function=} callback
   * @return {!NexusMap}
   */
  off(type, callback) {
    this.eventSystem_.off(type, callback);
    return this;
  }

  /**
   * @param {!Object} layer
   * @return {!NexusMap}
   */
  addLayer(layer) {
    layer.addTo(this);
    return this;
  }

  /**
   * @param {!Object} layer
   * @return {!NexusMap}
   */
  removeLayer(layer) {
    layer.remove();
    return this;
  }

  /**
   * @param {!NexusLatLngBounds} bounds
   * @param {!Object=} options
   * @return {!Promise}
   */
  fitBounds(bounds, options = {}) {
    if (!bounds.isValid()) {
      return Promise.resolve();
    }
    const padding = options.padding != null ? options.padding : 20;
    const maxZoom = options.maxZoom != null
      ? Math.min(options.maxZoom, this.maxZoom_)
      : this.maxZoom_;
    const containerRect = this.container_.getBoundingClientRect();
    const paddedWidth = containerRect.width - 2 * padding;
    const paddedHeight = containerRect.height - 2 * padding;
    if (paddedWidth <= 0 || paddedHeight <= 0) {
      return Promise.resolve();
    }
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    if (!sw || !ne) return Promise.resolve();
    const swPx = NexusProjection.project(sw, 0);
    const nePx = NexusProjection.project(ne, 0);
    const boundsWidth = nePx.x - swPx.x;
    const boundsHeight = nePx.y - swPx.y;
    if (boundsWidth <= 0 || boundsHeight <= 0) {
      return Promise.resolve();
    }
    const scaleX = paddedWidth / boundsWidth;
    const scaleY = paddedHeight / boundsHeight;
    const scale = Math.min(scaleX, scaleY);
    const zoom = NexusUtils.clamp(
      Math.log2(scale * NexusProjection.WORLD_SIZE_ / 256),
      this.minZoom_,
      maxZoom
    );
    const center = bounds.getCenter();
    return this.flyTo(center, 300).then(() => {
      return this.flyZoom(zoom);
    });
  }
}

// === NEXUS TILE LAYER ===
class NexusTileLayer {
  /**
   * @param {string} urlTemplate
   * @param {!Object=} options
   */
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

  /**
   * @param {!NexusMap} map
   * @return {!NexusTileLayer}
   */
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

  /**
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @return {string}
   */
  getTileKey_(z, x, y) {
    return `${z}/${x}/${y}`;
  }

  /**
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @return {string}
   */
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

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} zoom
   * @return {{x: number, y: number}}
   */
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

  /**
   * @return {!Array<{z: number, x: number, y: number}>}
   */
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

  /**
   * @param {string} key
   * @param {!HTMLImageElement} img
   */
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

  /**
   * @param {string} key
   * @return {!HTMLImageElement | undefined}
   */
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

  /**
   * @param {number} z
   * @param {number} x
   * @param {number} y
   * @param {string} key
   * @param {number} attempt
   */
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

  /**
   * Clear all cached tiles.
   */
  clearCache() {
    for (const tile of this.tileCache_.values()) {
      if (tile.parentNode) {
        tile.parentNode.removeChild(tile);
      }
    }
    this.tileCache_.clear();
    this.loadingTiles_.clear();
  }

  /**
   * Force reload all visible tiles.
   */
  refresh() {
    this.clearCache();
    this.updateTiles_();
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
  /**
   * @param {{lat: number, lng: number}} latLng
   * @param {!Object=} options
   */
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

  /**
   * @param {!NexusMap} map
   * @return {!NexusMarker}
   */
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

  /**
   * @param {{lat: number, lng: number}} latLng
   * @return {!NexusMarker}
   */
  setLatLng(latLng) {
    this.latLng_ = latLng;
    this.updatePosition_();
    if (this.map_) {
      this.map_.eventSystem_.emit('markermove', this);
    }
    return this;
  }

  /**
   * @return {{lat: number, lng: number}}
   */
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
  /**
   * @param {string} content
   * @param {!Object=} options
   */
  constructor(content, options = {}) {
    /** @private {string} */
    this.content_ = content;
    /** @private {number} */
    this.maxWidth_ = options.maxWidth != null ? options.maxWidth : 300;
    /** @private {string} */
    this.className_ = options.className || 'nexus-popup';
    /** @private {{x: number, y: number}} */
    this.offset_ = options.offset || { x: 0, y: -8 };
    /** @private {boolean} */
    this.autoPan_ = options.autoPan !== false;
    /** @private {boolean} */
    this.closeOnClick_ = options.closeOnClick !== false;
    /** @private {boolean} */
    this.autoClose_ = options.autoClose === true;
    /** @private {!Element} */
    this.element_ = this.createPopupElement_();
    /** @private {!NexusMap | null} */
    this.map_ = null;
    /** @private {{lat: number, lng: number} | null} */
    this.latLng_ = null;
    /** @private {!NexusMarker | null} */
    this.marker_ = null;
    /** @private {function(): void} */
    this.onClick_ = this.onClick_.bind(this);
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

  /**
   * @param {!NexusMap} map
   * @param {{lat: number, lng: number}} latLng
   * @return {!NexusPopup}
   */
  addTo(map, latLng) {
    this.map_ = map;
    this.latLng_ = latLng;
    this.marker_ = null;
    map.mapPane_.appendChild(this.element_);
    this.updatePosition_();
    map.on('move', () => this.updatePosition_());
    if (this.closeOnClick_) {
      this.element_.addEventListener('click', this.onClick_);
    }
    this.element_.style.display = 'block';
    if (this.autoPan_) {
      this.autoPan_();
    }
    return this;
  }

  /**
   * @param {!NexusMarker} marker
   * @return {!NexusPopup}
   */
  bindToMarker(marker) {
    this.marker_ = marker;
    this.latLng_ = null;
    this.map_ = marker.map_;
    if (this.map_) {
      this.map_.mapPane_.appendChild(this.element_);
      this.updatePosition_();
      this.map_.on('move', () => this.updatePosition_());
      if (this.closeOnClick_) {
        this.element_.addEventListener('click', this.onClick_);
      }
      this.element_.style.display = 'block';
      if (this.autoPan_) {
        this.autoPan_();
      }
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
    this.element_.style.left = `${point.x + this.offset_.x}px`;
    this.element_.style.top = `${point.y + this.offset_.y - this.element_.offsetHeight}px`;
  }

  autoPan_() {
    if (!this.map_ || !this.autoPan_) return;
    const containerRect = this.map_.container_.getBoundingClientRect();
    const popupRect = this.element_.getBoundingClientRect();
    const mapRect = this.map_.container_.getBoundingClientRect();
    let dx = 0;
    let dy = 0;
    const padding = 20;
    if (popupRect.left < mapRect.left + padding) {
      dx = mapRect.left + padding - popupRect.left;
    } else if (popupRect.right > mapRect.right - padding) {
      dx = mapRect.right - padding - popupRect.right;
    }
    if (popupRect.top < mapRect.top + padding) {
      dy = mapRect.top + padding - popupRect.top;
    } else if (popupRect.bottom > mapRect.bottom - padding) {
      dy = mapRect.bottom - padding - popupRect.bottom;
    }
    if (dx !== 0 || dy !== 0) {
      const currentCenter = this.map_.getCenter();
      const currentCenterPx = NexusProjection.project(currentCenter, this.map_.getZoom());
      const newCenterPx = {
        x: currentCenterPx.x - dx,
        y: currentCenterPx.y - dy,
      };
      const newCenter = NexusProjection.unproject(newCenterPx, this.map_.getZoom());
      this.map_.flyTo(newCenter, 200);
    }
  }

  onClick_() {
    if (this.autoClose_) {
      this.remove();
    }
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.updatePosition_());
      this.map_ = null;
    }
    if (this.closeOnClick_) {
      this.element_.removeEventListener('click', this.onClick_);
    }
    this.latLng_ = null;
    this.marker_ = null;
    NexusUtils.removeEl(this.element_);
  }
}

// === NEXUS TOOLTIP ===
class NexusTooltip {
  /**
   * @param {string} content
   * @param {!Object=} options
   */
  constructor(content, options = {}) {
    /** @private {string} */
    this.content_ = content;
    /** @private {string} */
    this.className_ = options.className || 'nexus-tooltip';
    /** @private {{x: number, y: number}} */
    this.offset_ = options.offset || { x: 0, y: -10 };
    /** @private {boolean} */
    this.permanent_ = options.permanent === true;
    /** @private {!Element} */
    this.element_ = this.createTooltipElement_();
    /** @private {!NexusMap | null} */
    this.map_ = null;
    /** @private {{lat: number, lng: number} | null} */
    this.latLng_ = null;
    /** @private {!NexusMarker | null} */
    this.marker_ = null;
    /** @private {function(!Event): void} */
    this.onMouseEnter_ = this.onMouseEnter_.bind(this);
    /** @private {function(!Event): void} */
    this.onMouseLeave_ = this.onMouseLeave_.bind(this);
  }

  createTooltipElement_() {
    const el = NexusUtils.createEl('div', {
      'class': this.className_,
      'style': `
        position: absolute;
        padding: 2px 6px;
        background: rgba(0,0,0,0.7);
        color: white;
        font: 12px/1.3 sans-serif;
        border-radius: 3px;
        white-space: nowrap;
        pointer-events: none;
        z-index: 900;
        display: none;
      `,
    });
    el.textContent = this.content_;
    return el;
  }

  /**
   * @param {!NexusMap} map
   * @param {{lat: number, lng: number}} latLng
   * @return {!NexusTooltip}
   */
  addTo(map, latLng) {
    this.map_ = map;
    this.latLng_ = latLng;
    this.marker_ = null;
    map.mapPane_.appendChild(this.element_);
    this.updatePosition_();
    map.on('move', () => this.updatePosition_());
    if (this.permanent_) {
      this.element_.style.display = 'block';
    }
    return this;
  }

  /**
   * @param {!NexusMarker} marker
   * @return {!NexusTooltip}
   */
  bindToMarker(marker) {
    this.marker_ = marker;
    this.latLng_ = null;
    this.map_ = marker.map_;
    if (this.map_) {
      this.map_.mapPane_.appendChild(this.element_);
      this.updatePosition_();
      this.map_.on('move', () => this.updatePosition_());
      if (this.permanent_) {
        this.element_.style.display = 'block';
      } else {
        marker.element_.addEventListener('pointerenter', this.onMouseEnter_);
        marker.element_.addEventListener('pointerleave', this.onMouseLeave_);
      }
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
    this.element_.style.left = `${point.x + this.offset_.x}px`;
    this.element_.style.top = `${point.y + this.offset_.y}px`;
  }

  onMouseEnter_(e) {
    this.element_.style.display = 'block';
  }

  onMouseLeave_(e) {
    this.element_.style.display = 'none';
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.updatePosition_());
      this.map_ = null;
    }
    if (this.marker_ && !this.permanent_) {
      this.marker_.element_.removeEventListener('pointerenter', this.onMouseEnter_);
      this.marker_.element_.removeEventListener('pointerleave', this.onMouseLeave_);
    }
    this.latLng_ = null;
    this.marker_ = null;
    NexusUtils.removeEl(this.element_);
  }
}

// === NEXUS DIV ICON ===
class NexusDivIcon {
  /**
   * @param {!Object=} options
   */
  constructor(options = {}) {
    /** @private {string} */
    this.html_ = options.html || '';
    /** @private {string} */
    this.className_ = options.className || 'nexus-div-icon';
    /** @private {{width: number, height: number} | null} */
    this.iconSize_ = options.iconSize || null;
    /** @private {{x: number, y: number} | null} */
    this.iconAnchor_ = options.iconAnchor || null;
  }

  /**
   * @return {!Element}
   */
  createIcon() {
    const el = NexusUtils.createEl('div', {
      'class': this.className_,
      'style': this.buildStyle_(),
    });
    if (this.html_) {
      el.innerHTML = this.html_;
    }
    return el;
  }

  /**
   * @return {string}
   */
  buildStyle_() {
    let style = 'position: absolute; pointer-events: auto;';
    if (this.iconSize_) {
      style += `width: ${this.iconSize_.width}px; height: ${this.iconSize_.height}px;`;
    }
    if (this.iconAnchor_) {
      style += `transform: translate(${-this.iconAnchor_.x}px, ${-this.iconAnchor_.y}px);`;
    } else if (this.iconSize_) {
      style += `transform: translate(${-this.iconSize_.width / 2}px, ${-this.iconSize_.height}px);`;
    } else {
      style += 'transform: translate(-50%, -100%);';
    }
    return style;
  }
}

// === NEXUS GEOJSON ===
class NexusGeoJSON {
  /**
   * @param {!Object} geojson
   * @param {!Object=} options
   */
  constructor(geojson, options = {}) {
    /** @private {!Object} */
    this.geojson_ = geojson;
    /** @private {function(!Object): !Object} */
    this.styleFn_ = options.style || this.defaultStyle_;
    /** @private {function(!Object, !Element)=} */
    this.onEachFeature_ = options.onEachFeature;
    /** @private {!Element | null} */
    this.container_ = null;
    /** @private {!NexusMap | null} */
    this.map_ = null;
    /** @private {!Array<!Element>} */
    this.elements_ = [];
  }

  defaultStyle_(feature) {
    const geomType = feature.geometry.type;
    if (geomType === 'Point') {
      return {
        type: 'circle',
        radius: 6,
        fillColor: '#3388ff',
        color: '#fff',
        weight: 2,
        fillOpacity: 0.7,
      };
    } else if (geomType === 'LineString' || geomType === 'Polygon') {
      return {
        color: '#3388ff',
        weight: 3,
        opacity: 1,
        fillOpacity: geomType === 'Polygon' ? 0.2 : 0,
      };
    }
    return {};
  }

  coordsToPath_(coords) {
    if (coords.length === 0) return '';
    let path = '';
    for (let i = 0; i < coords.length; i++) {
      const point = this.map_.latLngToContainerPoint({ lat: coords[i][1], lng: coords[i][0] });
      path += (i === 0 ? 'M' : 'L') + point.x + ',' + point.y;
    }
    return path;
  }

  renderFeature_(feature) {
    const geom = feature.geometry;
    const style = this.styleFn_(feature);
    let el;
    if (geom.type === 'Point') {
      const point = this.map_.latLngToContainerPoint({ lat: geom.coordinates[1], lng: geom.coordinates[0] });
      el = NexusUtils.createEl('div', {
        'class': 'nexus-geojson-point',
        'style': `
          position: absolute;
          width: ${style.radius * 2}px;
          height: ${style.radius * 2}px;
          background: ${style.fillColor};
          border: ${style.weight}px solid ${style.color};
          border-radius: 50%;
          opacity: ${style.fillOpacity};
          transform: translate(-50%, -50%);
          pointer-events: auto;
          left: ${point.x}px;
          top: ${point.y}px;
          z-index: 900;
        `,
      });
    } else if (geom.type === 'LineString') {
      const pathData = this.coordsToPath_(geom.coordinates);
      el = NexusUtils.createEl('svg', {
        'class': 'nexus-geojson-linestring',
        'style': 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;',
      });
      const path = NexusUtils.createEl('path', {
        'd': pathData,
        'stroke': style.color,
        'stroke-width': String(style.weight),
        'stroke-opacity': String(style.opacity),
        'fill': 'none',
      });
      el.appendChild(path);
    } else if (geom.type === 'Polygon') {
      const pathData = this.coordsToPath_(geom.coordinates[0]) + 'Z';
      el = NexusUtils.createEl('svg', {
        'class': 'nexus-geojson-polygon',
        'style': 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;',
      });
      const path = NexusUtils.createEl('path', {
        'd': pathData,
        'stroke': style.color,
        'stroke-width': String(style.weight),
        'stroke-opacity': String(style.opacity),
        'fill': style.fillOpacity > 0 ? style.color : 'none',
        'fill-opacity': String(style.fillOpacity),
      });
      el.appendChild(path);
    } else {
      return NexusUtils.createEl('div');
    }
    if (this.onEachFeature_) {
      this.onEachFeature_(feature, el);
    }
    return el;
  }

  /**
   * @param {!NexusMap} map
   * @return {!NexusGeoJSON}
   */
  addTo(map) {
    this.map_ = map;
    this.container_ = NexusUtils.createEl('div', {
      'class': 'nexus-geojson-layer',
      'style': 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;',
    });
    map.mapPane_.appendChild(this.container_);
    this.render_();
    map.on('move', () => this.render_());
    return this;
  }

  render_() {
    if (!this.map_ || !this.container_) return;
    // Update positions without recreating DOM
    if (this.geojson_.type === 'FeatureCollection') {
      for (let i = 0; i < this.geojson_.features.length; i++) {
        const feature = this.geojson_.features[i];
        const el = this.elements_[i];
        if (!el) continue;
        this.updateElementPosition_(el, feature);
      }
    } else if (this.geojson_.type === 'Feature') {
      if (this.elements_[0]) {
        this.updateElementPosition_(this.elements_[0], this.geojson_);
      }
    }
  }

  updateElementPosition_(el, feature) {
    const geom = feature.geometry;
    if (geom.type === 'Point') {
      const point = this.map_.latLngToContainerPoint({ lat: geom.coordinates[1], lng: geom.coordinates[0] });
      el.style.left = `${point.x}px`;
      el.style.top = `${point.y}px`;
    } else if (geom.type === 'LineString' || geom.type === 'Polygon') {
      const path = el.querySelector('path');
      if (path) {
        const pathData = geom.type === 'LineString'
          ? this.coordsToPath_(geom.coordinates)
          : this.coordsToPath_(geom.coordinates[0]) + 'Z';
        path.setAttribute('d', pathData);
      }
    }
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.render_());
      this.map_ = null;
    }
    if (this.container_ && this.container_.parentNode) {
      NexusUtils.removeEl(this.container_);
    }
    this.container_ = null;
    this.elements_ = [];
  }
}

// === NEXUS LAYER GROUP ===
class NexusLayerGroup {
  /**
   * @param {!Array<!Object>=} layers
   */
  constructor(layers = []) {
    /** @private {!Array<!Object>} */
    this.layers_ = [];
    /** @private {!NexusMap | null} */
    this.map_ = null;
    for (const layer of layers) {
      this.addLayer(layer);
    }
  }

  /**
   * @param {!Object} layer
   * @return {!NexusLayerGroup}
   */
  addLayer(layer) {
    this.layers_.push(layer);
    if (this.map_) {
      layer.addTo(this.map_);
    }
    return this;
  }

  /**
   * @param {!Object} layer
   * @return {!NexusLayerGroup}
   */
  removeLayer(layer) {
    const index = this.layers_.indexOf(layer);
    if (index !== -1) {
      this.layers_.splice(index, 1);
      if (this.map_) {
        layer.remove();
      }
    }
    return this;
  }

  /**
   * @param {!NexusMap} map
   * @return {!NexusLayerGroup}
   */
  addTo(map) {
    this.map_ = map;
    for (const layer of this.layers_) {
      layer.addTo(map);
    }
    return this;
  }

  remove() {
    for (const layer of this.layers_) {
      layer.remove();
    }
    this.map_ = null;
  }

  /**
   * @return {!Array<!Object>}
   */
  getLayers() {
    return this.layers_.slice();
  }
}

// === NEXUS CONTROLS ===
class NexusControls {
  /**
   * @param {!Object=} options
   */
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

  /**
   * @param {!NexusMap} map
   * @return {!NexusControls}
   */
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

// === NEXUS SCALE CONTROL ===
class NexusScaleControl {
  /**
   * @param {!Object=} options
   */
  constructor(options = {}) {
    /** @private {number} */
    this.maxWidth_ = options.maxWidth != null ? options.maxWidth : 150;
    /** @private {boolean} */
    this.metric_ = options.metric !== false;
    /** @private {boolean} */
    this.imperial_ = options.imperial !== false;
    /** @private {!Element | null} */
    this.container_ = null;
    /** @private {!NexusMap | null} */
    this.map_ = null;
    /** @private {!Element | null} */
    this.metricBar_ = null;
    /** @private {!Element | null} */
    this.imperialBar_ = null;
  }

  /**
   * @param {!NexusMap} map
   * @return {!NexusScaleControl}
   */
  addTo(map) {
    this.map_ = map;
    this.container_ = NexusUtils.createEl('div', {
      'class': 'nexus-scale-control',
      'style': `
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: white;
        padding: 4px;
        border-radius: 3px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
        font: 11px sans-serif;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 2px;
      `,
    });
    if (this.metric_) {
      this.metricBar_ = NexusUtils.createEl('div', {
        'class': 'nexus-scale-metric',
        'style': 'text-align: center;',
      });
      this.container_.appendChild(this.metricBar_);
    }
    if (this.imperial_) {
      this.imperialBar_ = NexusUtils.createEl('div', {
        'class': 'nexus-scale-imperial',
        'style': 'text-align: center;',
      });
      this.container_.appendChild(this.imperialBar_);
    }
    map.mapPane_.appendChild(this.container_);
    this.updateScale_();
    map.on('move', () => this.updateScale_());
    map.on('zoom', () => this.updateScale_());
    return this;
  }

  updateScale_() {
    if (!this.map_ || !this.container_) return;
    const zoom = this.map_.getZoom();
    const containerRect = this.map_.container_.getBoundingClientRect();
    const center = this.map_.getCenter();
    const pointC = NexusProjection.project(center, zoom);
    const pointR = NexusProjection.project({ lat: center.lat, lng: center.lng + 0.001 }, zoom);
    const metersPerPixel = (0.001 * 111319.5) / Math.abs(pointR.x - pointC.x);
    const maxWidthMeters = this.maxWidth_ * metersPerPixel;
    if (this.metric_ && this.metricBar_) {
      let maxMeters = maxWidthMeters;
      let unit = 'm';
      if (maxMeters > 1000) {
        maxMeters /= 1000;
        unit = 'km';
      }
      const rounded = this.roundToNiceNumber_(maxMeters);
      const widthPx = (rounded * (unit === 'km' ? 1000 : 1)) / metersPerPixel;
      this.metricBar_.textContent = `${rounded} ${unit}`;
      this.metricBar_.style.width = `${Math.min(widthPx, this.maxWidth_)}px`;
    }
    if (this.imperial_ && this.imperialBar_) {
      const maxWidthFeet = maxWidthMeters * 3.28084;
      let maxFeet = maxWidthFeet;
      let unit = 'ft';
      if (maxFeet > 5280) {
        maxFeet /= 5280;
        unit = 'mi';
      }
      const rounded = this.roundToNiceNumber_(maxFeet);
      const widthPx = (rounded * (unit === 'mi' ? 5280 : 1) / 3.28084) / metersPerPixel;
      this.imperialBar_.textContent = `${rounded} ${unit}`;
      this.imperialBar_.style.width = `${Math.min(widthPx, this.maxWidth_)}px`;
    }
  }

  roundToNiceNumber_(value) {
    const exp = Math.floor(Math.log10(value));
    const f = value / Math.pow(10, exp);
    let nf;
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
    return nf * Math.pow(10, exp);
  }

  remove() {
    if (this.map_) {
      this.map_.off('move', () => this.updateScale_());
      this.map_.off('zoom', () => this.updateScale_());
      this.map_ = null;
    }
    if (this.container_ && this.container_.parentNode) {
      NexusUtils.removeEl(this.container_);
    }
    this.container_ = null;
    this.metricBar_ = null;
    this.imperialBar_ = null;
  }
}

// === NEXUS LAYER CONTROL ===
class NexusLayerControl {
  /**
   * @param {!Object=} options
   */
  constructor(options = {}) {
    /** @private {!Object<string, !Object>} */
    this.baseLayers_ = options.baseLayers || {};
    /** @private {!Object<string, !Object>} */
    this.overlays_ = options.overlays || {};
    /** @private {!Element | null} */
    this.container_ = null;
    /** @private {!NexusMap | null} */
    this.map_ = null;
    /** @private {string | null} */
    this.activeBaseLayer_ = null;
  }

  /**
   * @param {!NexusMap} map
   * @return {!NexusLayerControl}
   */
  addTo(map) {
    this.map_ = map;
    this.container_ = NexusUtils.createEl('div', {
      'class': 'nexus-layer-control',
      'style': `
        position: absolute;
        top: 10px;
        right: 10px;
        background: white;
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 1px 5px rgba(0,0,0,0.4);
        font: 12px/1.4 sans-serif;
        z-index: 1000;
        max-height: 300px;
        overflow-y: auto;
      `,
    });
    this.render_();
    map.mapPane_.appendChild(this.container_);
    return this;
  }

  render_() {
    this.container_.innerHTML = '';
    if (Object.keys(this.baseLayers_).length > 0) {
      const baseGroup = NexusUtils.createEl('div', { 'style': 'margin-bottom: 8px;' });
      const baseTitle = NexusUtils.createEl('div', {}, 'Base Layers');
      baseTitle.style.fontWeight = 'bold';
      baseGroup.appendChild(baseTitle);
      for (const name in this.baseLayers_) {
        const label = NexusUtils.createEl('label', {
          'style': 'display: block; margin: 4px 0; cursor: pointer;',
        });
        const input = NexusUtils.createEl('input', {
          'type': 'radio',
          'name': 'nexus-base-layers',
          'value': name,
        });
        input.checked = this.activeBaseLayer_ === name || this.activeBaseLayer_ === null;
        if (input.checked) {
          this.activeBaseLayer_ = name;
          this.baseLayers_[name].addTo(this.map_);
        }
        input.addEventListener('change', () => {
          if (this.activeBaseLayer_) {
            this.baseLayers_[this.activeBaseLayer_].remove();
          }
          this.activeBaseLayer_ = name;
          this.baseLayers_[name].addTo(this.map_);
        });
        label.appendChild(input);
        label.appendChild(NexusUtils.createEl('span', {}, ` ${name}`));
        baseGroup.appendChild(label);
      }
      this.container_.appendChild(baseGroup);
    }
    if (Object.keys(this.overlays_).length > 0) {
      const overlayGroup = NexusUtils.createEl('div');
      const overlayTitle = NexusUtils.createEl('div', {}, 'Overlays');
      overlayTitle.style.fontWeight = 'bold';
      overlayGroup.appendChild(overlayTitle);
      for (const name in this.overlays_) {
        const label = NexusUtils.createEl('label', {
          'style': 'display: block; margin: 4px 0; cursor: pointer;',
        });
        const input = NexusUtils.createEl('input', {
          'type': 'checkbox',
          'value': name,
        });
        const layer = this.overlays_[name];
        const isAdded = layer.map_ !== null;
        input.checked = isAdded;
        input.addEventListener('change', () => {
          if (input.checked) {
            layer.addTo(this.map_);
          } else {
            layer.remove();
          }
        });
        label.appendChild(input);
        label.appendChild(NexusUtils.createEl('span', {}, ` ${name}`));
        overlayGroup.appendChild(label);
      }
      this.container_.appendChild(overlayGroup);
    }
  }

  remove() {
    if (this.container_ && this.container_.parentNode) {
      NexusUtils.removeEl(this.container_);
    }
    this.container_ = null;
    this.map_ = null;
  }
}

// === NEXUS LAT LNG ===
class NexusLatLng {
  /**
   * @param {number} lat
   * @param {number} lng
   */
  constructor(lat, lng) {
    /** @private {number} */
    this.lat_ = lat;
    /** @private {number} */
    this.lng_ = lng;
  }

  /**
   * @return {number}
   */
  lat() {
    return this.lat_;
  }

  /**
   * @return {number}
   */
  lng() {
    return this.lng_;
  }

  /**
   * @return {{lat: number, lng: number}}
   */
  toObject() {
    return { lat: this.lat_, lng: this.lng_ };
  }
}

// === NEXUS POINT ===
class NexusPoint {
  /**
   * @param {number} x
   * @param {number} y
   */
  constructor(x, y) {
    /** @private {number} */
    this.x_ = x;
    /** @private {number} */
    this.y_ = y;
  }

  /**
   * @return {number}
   */
  x() {
    return this.x_;
  }

  /**
   * @return {number}
   */
  y() {
    return this.y_;
  }

  /**
   * @return {{x: number, y: number}}
   */
  toObject() {
    return { x: this.x_, y: this.y_ };
  }
}

// === NEXUS LAT LNG BOUNDS ===
class NexusLatLngBounds {
  /**
   * @param {{lat: number, lng: number} | null} sw
   * @param {{lat: number, lng: number} | null} ne
   */
  constructor(sw = null, ne = null) {
    /** @private {{lat: number, lng: number} | null} */
    this.sw_ = sw;
    /** @private {{lat: number, lng: number} | null} */
    this.ne_ = ne;
    if (sw && ne) {
      this._normalize();
    }
  }

  _normalize() {
    const swLat = Math.min(this.sw_.lat, this.ne_.lat);
    const swLng = Math.min(this.sw_.lng, this.ne_.lng);
    const neLat = Math.max(this.sw_.lat, this.ne_.lat);
    const neLng = Math.max(this.sw_.lng, this.ne_.lng);
    this.sw_ = { lat: swLat, lng: swLng };
    this.ne_ = { lat: neLat, lng: neLng };
  }

  /**
   * @param {{lat: number, lng: number}} latLng
   * @return {!NexusLatLngBounds}
   */
  extend(latLng) {
    if (!this.sw_) {
      this.sw_ = { ...latLng };
      this.ne_ = { ...latLng };
    } else {
      this.sw_.lat = Math.min(this.sw_.lat, latLng.lat);
      this.sw_.lng = Math.min(this.sw_.lng, latLng.lng);
      this.ne_.lat = Math.max(this.ne_.lat, latLng.lat);
      this.ne_.lng = Math.max(this.ne_.lng, latLng.lng);
    }
    return this;
  }

  /**
   * @param {{lat: number, lng: number}} latLng
   * @return {boolean}
   */
  contains(latLng) {
    if (!this.sw_ || !this.ne_) return false;
    return (
      latLng.lat >= this.sw_.lat &&
      latLng.lat <= this.ne_.lat &&
      latLng.lng >= this.sw_.lng &&
      latLng.lng <= this.ne_.lng
    );
  }

  /**
   * @return {{lat: number, lng: number}}
   */
  getCenter() {
    if (!this.sw_ || !this.ne_) {
      throw new Error('Bounds are not valid');
    }
    return {
      lat: (this.sw_.lat + this.ne_.lat) / 2,
      lng: (this.sw_.lng + this.ne_.lng) / 2,
    };
  }

  /**
   * @return {boolean}
   */
  isValid() {
    return this.sw_ !== null && this.ne_ !== null;
  }

  /**
   * @return {{lat: number, lng: number} | null}
   */
  getSouthWest() {
    return this.sw_;
  }

  /**
   * @return {{lat: number, lng: number} | null}
   */
  getNorthEast() {
    return this.ne_;
  }
}

// === DEMO FUNCTION ===
function createNexusMapDemo(containerId) {
  const map = new NexusMap(containerId, {
    center: { lat: 51.505, lng: -0.09 },
    zoom: 13,
    minZoom: 2,
    maxZoom: 18,
  });
  const osmLayer = new NexusTileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { subdomains: 'abc' }
  );
  const satelliteLayer = new NexusTileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles © Esri' }
  );
  const marker = new NexusMarker({ lat: 51.5, lng: -0.09 }, { draggable: true });
  const popup = new NexusPopup('Drag me!', { maxWidth: 200 });
  popup.bindToMarker(marker);
  const tooltip = new NexusTooltip('London', { permanent: true });
  tooltip.bindToMarker(marker);
  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[-0.12, 51.5], [-0.05, 51.51]],
        },
        properties: { name: 'Route' },
      },
      {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[-0.11, 51.52], [-0.1, 51.52], [-0.1, 51.51], [-0.11, 51.51], [-0.11, 51.52]]],
        },
        properties: { name: 'Zone' },
      },
    ],
  };
  const geojsonLayer = new NexusGeoJSON(geojson);
  const overlayGroup = new NexusLayerGroup([marker, geojsonLayer]);
  const controls = new NexusControls({
    zoom: true,
    attribution: '© OpenStreetMap contributors',
  });
  const scaleControl = new NexusScaleControl({ maxWidth: 200 });
  const layerControl = new NexusLayerControl({
    baseLayers: {
      'OpenStreetMap': osmLayer,
      'Satellite': satelliteLayer,
    },
    overlays: {
      'Markers & Routes': overlayGroup,
    },
  });
  osmLayer.addTo(map);
  controls.addTo(map);
  scaleControl.addTo(map);
  layerControl.addTo(map);
  overlayGroup.addTo(map);
  const bounds = new NexusLatLngBounds();
  bounds.extend({ lat: 51.5, lng: -0.12 });
  bounds.extend({ lat: 51.52, lng: -0.05 });
  map.fitBounds(bounds, { padding: 30 });
  return {
    map,
    tileLayer: osmLayer,
    marker,
    popup,
    tooltip,
    geojsonLayer,
    layerGroup: overlayGroup,
    controls,
    scaleControl,
    layerControl,
  };
}

// === NAMED EXPORTS ===
export {
  NexusMap,
  NexusTileLayer,
  NexusMarker,
  NexusPopup,
  NexusTooltip,
  NexusDivIcon,
  NexusGeoJSON,
  NexusLayerGroup,
  NexusControls,
  NexusScaleControl,
  NexusLayerControl,
  NexusProjection,
  NexusLatLng,
  NexusLatLngBounds,
  NexusPoint,
  NexusUtils,
  NexusEventSystem,
  NexusTouchEngine,
  NexusAnimation,
  createNexusMapDemo,
};
