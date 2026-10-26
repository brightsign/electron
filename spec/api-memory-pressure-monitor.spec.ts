import { BrowserWindow, memoryPressureMonitor } from 'electron/main';

import { afterEach, describe, expect, it } from 'vitest';

import { setTimeout } from 'node:timers/promises';

import { closeAllWindows } from './lib/window-helpers.ts';

describe('memoryPressureMonitor', () => {
  describe('module availability', () => {
    it('is available from the main process', () => {
      expect(memoryPressureMonitor).not.toBeUndefined();
    });

    it('is an EventEmitter', () => {
      expect(memoryPressureMonitor.on).toBeTypeOf('function');
      expect(memoryPressureMonitor.removeListener).toBeTypeOf('function');
      expect(memoryPressureMonitor.emit).toBeTypeOf('function');
    });
  });

  describe('memoryPressureMonitor.getCurrentPressureLevel', () => {
    it('returns a valid pressure level string', () => {
      const level = memoryPressureMonitor.getCurrentPressureLevel();
      expect(level).toBeTypeOf('string');
      expect(['none', 'moderate', 'critical']).toContain(level);
    });

    it('reflects the level set via notifyMemoryPressure', () => {
      memoryPressureMonitor.notifyMemoryPressure('critical');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).toBe('critical');

      memoryPressureMonitor.notifyMemoryPressure('moderate');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).toBe('moderate');

      memoryPressureMonitor.notifyMemoryPressure('none');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).toBe('none');
    });
  });

  describe('memoryPressureMonitor.notifyMemoryPressure', () => {
    it('accepts "moderate" level', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('moderate');
      }).not.toThrow();
    });

    it('accepts "critical" level', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('critical');
      }).not.toThrow();
    });

    it('accepts "none" level without throwing', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('none');
      }).not.toThrow();
    });

    it('stores "none" level for getCurrentPressureLevel', () => {
      memoryPressureMonitor.notifyMemoryPressure('moderate');
      memoryPressureMonitor.notifyMemoryPressure('none');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).toBe('none');
    });

    it('does not fire event for "none" level', async () => {
      let eventFired = false;
      const listener = () => {
        eventFired = true;
      };
      memoryPressureMonitor.on('memory-pressure', listener);
      memoryPressureMonitor.notifyMemoryPressure('none');

      // Give the async observer a chance to fire, then verify it didn't
      await setTimeout(100);
      memoryPressureMonitor.removeListener('memory-pressure', listener);
      expect(eventFired).toBe(false);
    });

    it('rejects invalid level strings', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('invalid');
      }).toThrow(/Invalid memory pressure level/);

      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('');
      }).toThrow(/Invalid memory pressure level/);
    });

    it('rejects non-string arguments', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure(42 as any);
      }).toThrow();
    });
  });

  describe('memory-pressure event', () => {
    it('fires when notifyMemoryPressure is called with "critical"', async () => {
      const received = new Promise<string>((resolve) => memoryPressureMonitor.once('memory-pressure', resolve));
      memoryPressureMonitor.notifyMemoryPressure('critical');
      const level = await received;
      expect(level).toBe('critical');
    });

    it('fires when notifyMemoryPressure is called with "moderate"', async () => {
      const received = new Promise<string>((resolve) => memoryPressureMonitor.once('memory-pressure', resolve));
      memoryPressureMonitor.notifyMemoryPressure('moderate');
      const level = await received;
      expect(level).toBe('moderate');
    });

    it('includes level as first argument to listener', async () => {
      const received = new Promise<string>((resolve) => memoryPressureMonitor.once('memory-pressure', resolve));
      memoryPressureMonitor.notifyMemoryPressure('critical');
      const level = await received;
      expect(level).toBeTypeOf('string');
      expect(['moderate', 'critical']).toContain(level);
    });
  });

  describe('cross-process notification', () => {
    afterEach(closeAllWindows);

    const allocateAndReleaseGarbage = async (wc: Electron.WebContents) => {
      // Allocate ~80 MB of garbage-collectible objects, then release references
      // so they become eligible for GC but won't be collected without pressure.
      await wc.executeJavaScript(`
        globalThis._garbage = [];
        for (let i = 0; i < 200000; i++) {
          globalThis._garbage.push({ data: new Array(100).fill('x'.repeat(4)) });
        }
      `);
      const heapBefore: number = await wc.executeJavaScript('process.memoryUsage().heapUsed');
      // Release references — collectible but not yet collected
      await wc.executeJavaScript('globalThis._garbage = null');
      return heapBefore;
    };

    it('does NOT collect garbage without a pressure notification (control)', async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await w.loadURL('data:text/html,<h1>control</h1>');

      const heapBefore = await allocateAndReleaseGarbage(w.webContents);

      // Do NOT send memory pressure — just wait the same amount of time
      await setTimeout(500);

      const heapAfter: number = await w.webContents.executeJavaScript('process.memoryUsage().heapUsed');

      // Heap should NOT have shrunk substantially — V8's background GC may
      // reclaim a small amount, but without an explicit pressure signal the
      // bulk of the ~80 MB allocation should still be resident.
      expect(heapAfter).toBeGreaterThan(heapBefore * 0.5);
    });

    it('triggers V8 GC in renderer on critical pressure', async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await w.loadURL('data:text/html,<h1>test</h1>');

      const heapBefore = await allocateAndReleaseGarbage(w.webContents);

      memoryPressureMonitor.notifyMemoryPressure('critical');

      // Wait for Mojo IPC + V8 GC to complete
      await setTimeout(500);

      const heapAfter: number = await w.webContents.executeJavaScript('process.memoryUsage().heapUsed');

      // Heap should have shrunk substantially — the ~80 MB of garbage should
      // have been collected by the V8 GC triggered via memory pressure.
      expect(heapAfter).toBeLessThan(heapBefore * 0.5);
    });

    it('triggers V8 GC in renderer on moderate pressure', async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await w.loadURL('data:text/html,<h1>test</h1>');

      const heapBefore = await allocateAndReleaseGarbage(w.webContents);

      memoryPressureMonitor.notifyMemoryPressure('moderate');

      await setTimeout(500);

      const heapAfter: number = await w.webContents.executeJavaScript('process.memoryUsage().heapUsed');

      expect(heapAfter).toBeLessThan(heapBefore * 0.75);
    });

    it('triggers V8 GC across multiple renderer processes', async () => {
      const w1 = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      const w2 = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await Promise.all([w1.loadURL('data:text/html,<h1>window1</h1>'), w2.loadURL('data:text/html,<h1>window2</h1>')]);

      const [heapBefore1, heapBefore2] = await Promise.all([
        allocateAndReleaseGarbage(w1.webContents),
        allocateAndReleaseGarbage(w2.webContents)
      ]);

      memoryPressureMonitor.notifyMemoryPressure('critical');

      await setTimeout(500);

      const [heapAfter1, heapAfter2]: [number, number] = await Promise.all([
        w1.webContents.executeJavaScript('process.memoryUsage().heapUsed'),
        w2.webContents.executeJavaScript('process.memoryUsage().heapUsed')
      ]);

      // Both renderers should have collected their garbage
      expect(heapAfter1).toBeLessThan(heapBefore1 * 0.5);
      expect(heapAfter2).toBeLessThan(heapBefore2 * 0.5);
    });

    it('renderer survives repeated pressure notifications', async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await w.loadURL('data:text/html,<h1>stress</h1>');

      const heapBefore = await allocateAndReleaseGarbage(w.webContents);

      // Send multiple pressure notifications in rapid succession
      memoryPressureMonitor.notifyMemoryPressure('moderate');
      memoryPressureMonitor.notifyMemoryPressure('critical');
      memoryPressureMonitor.notifyMemoryPressure('moderate');
      memoryPressureMonitor.notifyMemoryPressure('critical');

      await setTimeout(500);

      const heapAfter: number = await w.webContents.executeJavaScript('process.memoryUsage().heapUsed');

      // Renderer should still be alive and GC should have run
      expect(heapAfter).toBeLessThan(heapBefore * 0.5);

      const text = await w.webContents.executeJavaScript('document.querySelector("h1").textContent');
      expect(text).toBe('stress');
    });
  });
});
