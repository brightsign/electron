import { expect } from 'chai';
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ifdescribe } from './lib/spec-helpers';

const fixture = path.join(__dirname, 'fixtures', 'api', 'renderer-privileges');

function lookupUser (name: string) {
  try {
    const line = fs.readFileSync('/etc/passwd', 'utf8').split('\n').find(l => l.startsWith(name + ':'));
    if (!line) return null;
    const f = line.split(':');
    return { uid: Number(f[2]), gid: Number(f[3]) };
  } catch {
    return null;
  }
}

const rendererUser = process.env.ELECTRON_TEST_RENDERER_UID
  ? { uid: Number(process.env.ELECTRON_TEST_RENDERER_UID), gid: Number(process.env.ELECTRON_TEST_RENDERER_GID || process.env.ELECTRON_TEST_RENDERER_UID) }
  : lookupUser('nodejs');

// Needs root so the browser can drop renderers to the unprivileged user.
const canRun = process.platform === 'linux' && process.getuid?.() === 0 && !!rendererUser;

ifdescribe(canRun)('renderer privilege drop', function () {
  this.timeout(60000);

  // The zygote path is the default; --no-zygote forces base::LaunchProcess.
  const launchPaths: [string, string[]][] = [
    ['zygote fork', []],
    ['direct LaunchProcess', ['--no-zygote']]
  ];

  const protectedPaths = [process.env.ELECTRON_TEST_NSS_DB, '/root'].filter(Boolean) as string[];

  for (const [name, extraArgs] of launchPaths) {
    describe(name, () => {
      let result: any;

      before(() => {
        const gids = process.env.ELECTRON_TEST_RENDERER_GIDS || String(rendererUser!.gid);
        const out = cp.spawnSync(process.execPath, [
          fixture, '--no-sandbox', '--disable-gpu',
          `--renderer-process-uid=${rendererUser!.uid}`,
          `--renderer-process-gids=${gids}`,
          ...extraArgs
        ], {
          encoding: 'utf8',
          timeout: 45000,
          env: { ...process.env, RENDERER_PRIV_PROTECTED_PATHS: protectedPaths.join(',') }
        });
        const line = out.stdout.split('\n').find(l => l.startsWith('RESULT:'));
        expect(line, `no result; stderr: ${out.stderr}`).to.be.a('string');
        result = JSON.parse(line!.slice('RESULT:'.length));
      });

      it('runs the renderer as the intended uid and gid', () => {
        const uid = String(rendererUser!.uid);
        expect(result.renderer.uid.split(/\s+/)).to.deep.equal([uid, uid, uid, uid]);
        const gid = String(rendererUser!.gid);
        expect(result.renderer.gid.split(/\s+/)).to.deep.equal([gid, gid, gid, gid]);
      });

      it('leaves the main process as root', () => {
        expect(result.mainUid.split(/\s+/)).to.deep.equal(['0', '0', '0', '0']);
      });

      it('has no capabilities in any set', () => {
        const zero = '0000000000000000';
        expect(result.renderer.capInh).to.equal(zero);
        expect(result.renderer.capPrm).to.equal(zero);
        expect(result.renderer.capEff).to.equal(zero);
        expect(result.renderer.capAmb).to.equal(zero);
      });

      it('sets NoNewPrivs', () => {
        expect(result.renderer.noNewPrivs).to.equal('1');
      });

      it('cannot regain uid 0', () => {
        expect(result.renderer.setuidThrew).to.equal(true);
        if (result.renderer.python) {
          const [setresuidRet, capsetRet, uid] = result.renderer.python;
          expect(setresuidRet).to.equal(-1);
          expect(capsetRet).to.equal(-1);
          expect(uid).to.equal(rendererUser!.uid);
        }
      });

      it('cannot read protected paths', () => {
        for (const p of protectedPaths) {
          expect(result.renderer.readable[p], p).to.equal(false);
        }
      });
    });
  }
});
