import { BrowserWindow } from 'electron/main';

import { expect } from 'chai';

import { closeAllWindows } from './lib/window-helpers';

describe('memoryPressureMonitor', () => {
  let memoryPressureMonitor: any;

  before(() => {
    memoryPressureMonitor = require('electron').memoryPressureMonitor;
  });

  describe('module availability', () => {
    it('is available from the main process', () => {
      expect(memoryPressureMonitor).to.not.be.undefined();
    });

    it('is an EventEmitter', () => {
      expect(memoryPressureMonitor.on).to.be.a('function');
      expect(memoryPressureMonitor.removeListener).to.be.a('function');
      expect(memoryPressureMonitor.emit).to.be.a('function');
    });
  });

  describe('memoryPressureMonitor.getCurrentPressureLevel', () => {
    it('returns a valid pressure level string', () => {
      const level = memoryPressureMonitor.getCurrentPressureLevel();
      expect(level).to.be.a('string');
      expect(['none', 'moderate', 'critical']).to.include(level);
    });

    it('reflects the level set via notifyMemoryPressure', () => {
      memoryPressureMonitor.notifyMemoryPressure('critical');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).to.equal('critical');

      memoryPressureMonitor.notifyMemoryPressure('moderate');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).to.equal('moderate');

      memoryPressureMonitor.notifyMemoryPressure('none');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).to.equal('none');
    });
  });

  describe('memoryPressureMonitor.notifyMemoryPressure', () => {
    it('accepts "moderate" level', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('moderate');
      }).to.not.throw();
    });

    it('accepts "critical" level', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('critical');
      }).to.not.throw();
    });

    it('accepts "none" level without throwing', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('none');
      }).to.not.throw();
    });

    it('stores "none" level for getCurrentPressureLevel', () => {
      memoryPressureMonitor.notifyMemoryPressure('moderate');
      memoryPressureMonitor.notifyMemoryPressure('none');
      expect(memoryPressureMonitor.getCurrentPressureLevel()).to.equal('none');
    });

    it('does not fire event for "none" level', (done) => {
      let eventFired = false;
      const listener = () => { eventFired = true; };
      memoryPressureMonitor.on('memory-pressure', listener);
      memoryPressureMonitor.notifyMemoryPressure('none');

      // Give the async observer a chance to fire, then verify it didn't
      setTimeout(() => {
        memoryPressureMonitor.removeListener('memory-pressure', listener);
        try {
          expect(eventFired).to.be.false();
          done();
        } catch (e) {
          done(e);
        }
      }, 100);
    });

    it('rejects invalid level strings', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('invalid');
      }).to.throw(/Invalid memory pressure level/);

      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure('');
      }).to.throw(/Invalid memory pressure level/);
    });

    it('rejects non-string arguments', () => {
      expect(() => {
        memoryPressureMonitor.notifyMemoryPressure(42);
      }).to.throw();
    });
  });

  describe('memory-pressure event', () => {
    it('fires when notifyMemoryPressure is called with "critical"', (done) => {
      memoryPressureMonitor.once('memory-pressure', (level: string) => {
        try {
          expect(level).to.equal('critical');
          done();
        } catch (e) {
          done(e);
        }
      });
      memoryPressureMonitor.notifyMemoryPressure('critical');
    });

    it('fires when notifyMemoryPressure is called with "moderate"', (done) => {
      memoryPressureMonitor.once('memory-pressure', (level: string) => {
        try {
          expect(level).to.equal('moderate');
          done();
        } catch (e) {
          done(e);
        }
      });
      memoryPressureMonitor.notifyMemoryPressure('moderate');
    });

    it('includes level as first argument to listener', (done) => {
      memoryPressureMonitor.once('memory-pressure', (level: string) => {
        try {
          expect(level).to.be.a('string');
          expect(['moderate', 'critical']).to.include(level);
          done();
        } catch (e) {
          done(e);
        }
      });
      memoryPressureMonitor.notifyMemoryPressure('critical');
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
      const heapBefore: number = await wc.executeJavaScript(
        'process.memoryUsage().heapUsed'
      );
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
      await new Promise(resolve => setTimeout(resolve, 500));

      const heapAfter: number = await w.webContents.executeJavaScript(
        'process.memoryUsage().heapUsed'
      );

      // Heap should NOT have shrunk substantially — V8's background GC may
      // reclaim a small amount, but without an explicit pressure signal the
      // bulk of the ~80 MB allocation should still be resident.
      expect(heapAfter).to.be.greaterThan(heapBefore * 0.5);
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
      await new Promise(resolve => setTimeout(resolve, 500));

      const heapAfter: number = await w.webContents.executeJavaScript(
        'process.memoryUsage().heapUsed'
      );

      // Heap should have shrunk substantially — the ~80 MB of garbage should
      // have been collected by the V8 GC triggered via memory pressure.
      expect(heapAfter).to.be.lessThan(heapBefore * 0.5);
    });

    it('triggers V8 GC in renderer on moderate pressure', async () => {
      const w = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
      });
      await w.loadURL('data:text/html,<h1>test</h1>');

      const heapBefore = await allocateAndReleaseGarbage(w.webContents);

      memoryPressureMonitor.notifyMemoryPressure('moderate');

      await new Promise(resolve => setTimeout(resolve, 500));

      const heapAfter: number = await w.webContents.executeJavaScript(
        'process.memoryUsage().heapUsed'
      );

      expect(heapAfter).to.be.lessThan(heapBefore * 0.75);
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
      await Promise.all([
        w1.loadURL('data:text/html,<h1>window1</h1>'),
        w2.loadURL('data:text/html,<h1>window2</h1>')
      ]);

      const [heapBefore1, heapBefore2] = await Promise.all([
        allocateAndReleaseGarbage(w1.webContents),
        allocateAndReleaseGarbage(w2.webContents)
      ]);

      memoryPressureMonitor.notifyMemoryPressure('critical');

      await new Promise(resolve => setTimeout(resolve, 500));

      const [heapAfter1, heapAfter2]: [number, number] = await Promise.all([
        w1.webContents.executeJavaScript('process.memoryUsage().heapUsed'),
        w2.webContents.executeJavaScript('process.memoryUsage().heapUsed')
      ]);

      // Both renderers should have collected their garbage
      expect(heapAfter1).to.be.lessThan(heapBefore1 * 0.5);
      expect(heapAfter2).to.be.lessThan(heapBefore2 * 0.5);
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

      await new Promise(resolve => setTimeout(resolve, 500));

      const heapAfter: number = await w.webContents.executeJavaScript(
        'process.memoryUsage().heapUsed'
      );

      // Renderer should still be alive and GC should have run
      expect(heapAfter).to.be.lessThan(heapBefore * 0.5);

      const text = await w.webContents.executeJavaScript(
        'document.querySelector("h1").textContent'
      );
      expect(text).to.equal('stress');
    });
  });
});
