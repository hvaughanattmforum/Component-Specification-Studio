// Bundles the generated frameworks catalog JSON (etom_*.json, sid_*.json,
// functionalFramework_*.json) into dist/frameworks/ as part of `npm run
// dist`, so a fresh install works out of the box with no setup step. The
// source .xlsx spreadsheets they were generated from are deliberately never
// copied - they're large and license-bearing, and the app only ever needs
// the converted JSON at runtime (see server/index.js's REFERENCE_DATA_DIR).
//
// Source directory: FRAMEWORKS_DIR env var if set (matching the server's own
// override), otherwise a "frameworks" folder sibling to this app's own repo
// checkout - the conventional dev workspace layout.
const fs = require('fs');
const path = require('path');

const sourceDir = process.env.FRAMEWORKS_DIR
  || path.join(__dirname, '..', '..', 'frameworks');
const destDir = path.join(__dirname, '..', 'dist', 'frameworks');

const CATALOG_RE = /^(etom|sid|functionalFramework)_.+\.json$/i;

fs.rmSync(destDir, { recursive: true, force: true });

if (!fs.existsSync(sourceDir)) {
  console.warn(`No frameworks catalogs bundled: source directory not found (${sourceDir}).`);
  console.warn('Set the FRAMEWORKS_DIR env var to point at a directory containing the generated catalog JSON, or regenerate them after install via the Setup page.');
  process.exit(0);
}

const catalogFiles = fs.readdirSync(sourceDir).filter((f) => CATALOG_RE.test(f));

if (!catalogFiles.length) {
  console.warn(`No frameworks catalog JSON found in ${sourceDir} - nothing bundled.`);
  console.warn('Run scripts/parse_reference_data.py against your frameworks directory first if you want catalogs shipped with the package.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
for (const file of catalogFiles) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
}

console.log(`Bundled ${catalogFiles.length} frameworks catalog file(s) into dist/frameworks/: ${catalogFiles.join(', ')}`);
