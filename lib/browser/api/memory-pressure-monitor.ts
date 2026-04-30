import { EventEmitter } from 'events';

const {
  createMemoryPressureMonitor
} = process._linkedBinding('electron_browser_memory_pressure_monitor');

class MemoryPressureMonitor extends EventEmitter {
  #native: any;

  constructor () {
    super();
    // Lazily create the native binding on first listener, following
    // the powerMonitor pattern. This avoids creating a
    // base::MemoryPressureListener until someone actually cares.
    this.once('newListener', () => {
      this.#native = createMemoryPressureMonitor();
      this.#native.emit = this.emit.bind(this);
    });
  }

  /**
   * Returns the current memory pressure level reported by the OS.
   * @returns {'none' | 'moderate' | 'critical'}
   */
  getCurrentPressureLevel (): 'none' | 'moderate' | 'critical' {
    if (this.#native) {
      return this.#native.getCurrentPressureLevel();
    }
    // If native binding hasn't been created yet, create it now
    this.#native = createMemoryPressureMonitor();
    this.#native.emit = this.emit.bind(this);
    return this.#native.getCurrentPressureLevel();
  }

  /**
   * Sets the memory pressure level. For 'moderate' and 'critical',
   * broadcasts a notification to all listeners in this process and
   * renderer processes. For 'none', records the level without
   * broadcasting (Chromium does not accept none notifications).
   *
   * @param level - 'none' | 'moderate' | 'critical'
   */
  notifyMemoryPressure (level: 'none' | 'moderate' | 'critical'): void {
    if (this.#native) {
      this.#native.notifyMemoryPressure(level);
      return;
    }
    // If native binding hasn't been created yet, create it now
    this.#native = createMemoryPressureMonitor();
    this.#native.emit = this.emit.bind(this);
    this.#native.notifyMemoryPressure(level);
  }
}

module.exports = new MemoryPressureMonitor();
