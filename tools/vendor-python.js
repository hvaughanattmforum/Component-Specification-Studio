// Vendors openpyxl (+ its only dependency, et-xmlfile) into scripts/vendor/
// as part of `npm run dist`, so the packaged exe never needs the end user's
// Python to already have openpyxl installed - or even network access to pip
// install it. Both packages are pure Python (no compiled extensions), so a
// `pip install --target` done here on the build machine works unmodified on
// any target machine's Python 3, regardless of version or OS.
//
// Tries `python` then `python3` since which one exists on PATH varies by
// machine/OS (same fallback order as server/index.js's regenerate endpoint).
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const vendorDir = path.join(__dirname, '..', 'scripts', 'vendor');
const requirementsPath = path.join(__dirname, '..', 'scripts', 'requirements.txt');

fs.rmSync(vendorDir, { recursive: true, force: true });

let installed = false;
for (const command of ['python', 'python3']) {
  try {
    execFileSync(
      command,
      ['-m', 'pip', 'install', '--target', vendorDir, '--no-user', '-r', requirementsPath],
      { stdio: 'inherit' }
    );
    installed = true;
    break;
  } catch (err) {
    if (err.code === 'ENOENT') continue; // this command isn't on PATH - try the next one
    throw err;
  }
}

if (!installed) {
  throw new Error(
    'Could not find a Python interpreter on PATH (tried "python" and "python3") to vendor openpyxl into scripts/vendor/.'
  );
}
