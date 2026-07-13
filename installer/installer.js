// Packaged (via pkg) into ComponentSpecStudio-Setup.exe. Its only job is to
// unpack its embedded payload (the app exe, built UI, and install/uninstall
// scripts) to a temp folder and hand off to install.ps1, which does the
// actual work (copy to %LOCALAPPDATA%, Start Menu shortcut, Add/Remove
// Programs registration). Keeping that logic in PowerShell - rather than
// reimplementing shortcut/registry creation in Node - means it's the same
// tested script whether run via this installer or by hand.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const payloadDir = path.join(__dirname, 'payload');
const tempDir = path.join(os.tmpdir(), 'ComponentSpecStudio-install');

console.log('ODA Component Specification Studio - Setup');
console.log('Extracting installer files...');

fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });

for (const file of ['ComponentSpecStudio.exe', 'public.zip', 'scripts.zip', 'install.ps1', 'uninstall.ps1']) {
  fs.copyFileSync(path.join(payloadDir, file), path.join(tempDir, file));
}

console.log('Running installer...\n');
const result = spawnSync('powershell.exe', [
  '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(tempDir, 'install.ps1'),
], { stdio: 'inherit' });

fs.rmSync(tempDir, { recursive: true, force: true });

process.exit(result.status || 0);
