import { expect } from 'chai';

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
});
