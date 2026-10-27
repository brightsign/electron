const { app, BrowserWindow } = require('electron');

const directLaunch = process.argv.includes('--no-zygote');

function readStatus (pid) {
  const status = require('node:fs').readFileSync(`/proc/${pid}/status`, 'utf8');
  const field = (name) => (status.match(new RegExp('^' + name + ':\\s*(.*)$', 'm')) || [])[1];
  return {
    uid: field('Uid'), gid: field('Gid'), groups: field('Groups'),
    capInh: field('CapInh'), capPrm: field('CapPrm'), capEff: field('CapEff'),
    capBnd: field('CapBnd'), capAmb: field('CapAmb'), noNewPrivs: field('NoNewPrivs')
  };
}

// Runs inside the unsandboxed renderer and reports its credentials.
const probe = `(() => {
  const fs = require('node:fs');
  const cp = require('node:child_process');
  const status = fs.readFileSync('/proc/self/status', 'utf8');
  const field = (name) => (status.match(new RegExp('^' + name + ':\\\\s*(.*)$', 'm')) || [])[1];

  let setuidThrew = false;
  try { process.setuid(0); } catch { setuidThrew = true; }

  // setresuid(0,0,0) and capset() restoring CAP_SETUID via ctypes, if python3 exists.
  const py = [
    'import ctypes, os, struct, sys',
    'libc = ctypes.CDLL(None, use_errno=True)',
    'r1 = libc.setresuid(0, 0, 0)',
    'hdr = ctypes.create_string_buffer(struct.pack("Ii", 0x20080522, 0), 8)',
    'data = ctypes.create_string_buffer(struct.pack("III", 1 << 7, 1 << 7, 1 << 7) + b"\\\\0" * 12, 24)',
    'r2 = libc.capset(hdr, data)',
    'print(r1, r2, os.getuid())'
  ].join('\\n');
  const res = cp.spawnSync('python3', ['-c', py], { encoding: 'utf8' });
  const python = res.error ? null : res.stdout.trim().split(' ').map(Number);

  const readable = {};
  for (const p of (process.env.RENDERER_PRIV_PROTECTED_PATHS || '').split(',').filter(Boolean)) {
    try { fs.readdirSync(p); readable[p] = true; } catch { try { fs.readFileSync(p); readable[p] = true; } catch { readable[p] = false; } }
  }

  return {
    uid: field('Uid'), gid: field('Gid'), groups: field('Groups'),
    capInh: field('CapInh'), capPrm: field('CapPrm'), capEff: field('CapEff'),
    capBnd: field('CapBnd'), capAmb: field('CapAmb'), noNewPrivs: field('NoNewPrivs'),
    setuidThrew, python, readable
  };
})()`;

app.whenReady().then(async () => {
  const w = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: directLaunch,
      contextIsolation: false,
      sandbox: !directLaunch
    }
  });
  await w.loadURL('about:blank');
  const renderer = directLaunch
    ? await w.webContents.executeJavaScript(probe)
    : readStatus(w.webContents.getOSProcessId());
  const rendererPid = w.webContents.getOSProcessId();
  const parentPid = Number(require('node:fs').readFileSync(`/proc/${rendererPid}/stat`, 'utf8').match(/^\d+ \(.*\) \S (\d+)/)[1]);
  const parentCommand = require('node:fs').readFileSync(`/proc/${parentPid}/cmdline`, 'utf8').replace(/\0/g, ' ');
  const main = require('node:fs').readFileSync('/proc/self/status', 'utf8').match(/^Uid:\s*(.*)$/m)[1];
  process.stdout.write('RESULT:' + JSON.stringify({ renderer, mainUid: main, parentCommand }) + '\n');
  app.quit();
});
