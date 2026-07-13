import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { execFileSync, exec } from 'child_process';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Root of the Component Specification repo this app edits. Defaults to the
// v1.1.0 checkout the user already has attached; override with REPO_ROOT env var.
const REPO_ROOT = process.env.REPO_ROOT
  || 'C:\\Users\\HugoVaughan\\ClaudeCode\\TMForum-ODA-Component-Specification-v1.1.0';

const SPECIFICATIONS_DIR = path.join(REPO_ROOT, 'specifications');
const SCHEMA_PATH = path.join(REPO_ROOT, 'ci', 'component.schema.json');
const API_INDEX_PATH = path.join(REPO_ROOT, 'apiIndex.json');

// Reference taxonomy catalogs (eTOM/SID/Functional Framework), pre-converted
// from the official TMForum GB921/GB922/GB1033F Excel exports by
// frameworks/parse_reference_data.py. This lives as a sibling of REPO_ROOT
// (both under one workspace directory) rather than inside the app itself,
// so a fresh checkout of this app can point at anyone's existing workspace
// layout instead of shipping the (large, license-bearing) source spreadsheets.
const REFERENCE_DATA_DIR = process.env.FRAMEWORKS_DIR
  || path.join(path.dirname(REPO_ROOT), 'frameworks');

// Enforced by design: REPO_ROOT and the frameworks directory must be
// siblings under one shared parent, so the whole workspace can be relocated
// (or handed to a teammate) by moving one folder instead of re-pointing two
// independent absolute paths.
const repoParent = path.dirname(REPO_ROOT);
const frameworksParent = path.dirname(REFERENCE_DATA_DIR);
if (repoParent !== frameworksParent) {
  console.error([
    '',
    'Configuration error: REPO_ROOT and the frameworks directory must share a parent directory.',
    `  REPO_ROOT:              ${REPO_ROOT}`,
    `  REPO_ROOT parent:       ${repoParent}`,
    `  frameworks directory:   ${REFERENCE_DATA_DIR}`,
    `  frameworks dir parent:  ${frameworksParent}`,
    '',
    'Place the component spec repo checkout and the frameworks/ folder (eTOM, SID, Functional',
    'Framework source data) side by side under one workspace directory, e.g.:',
    '  <workspace>/TMForum-ODA-Component-Specification-v1.1.0/',
    '  <workspace>/frameworks/',
    'or set the REPO_ROOT and FRAMEWORKS_DIR env vars so both resolve under the same parent.',
    '',
  ].join('\n'));
  process.exit(1);
}

// Frameworks catalogs are versioned in their filename (etom_v26.0.json,
// sid_v26.0.json, ...), produced by frameworks/parse_reference_data.py -
// multiple versions of the same framework can sit side by side. A file whose
// version couldn't be parsed from its source spreadsheet is named with a
// literal underscore in place of the version (e.g. "etom__.json") and always
// sorts last, since it can't be compared against real version numbers.
function listVersionedFiles(baseName) {
  if (!fs.existsSync(REFERENCE_DATA_DIR)) return [];
  const re = new RegExp(`^${baseName}_(.+)\\.json$`);
  return fs.readdirSync(REFERENCE_DATA_DIR)
    .map((f) => {
      const m = f.match(re);
      return m ? { file: m[0], version: m[1] } : null;
    })
    .filter(Boolean);
}

function compareVersions(a, b) {
  if (a === '_' || b === '_') return a === b ? 0 : (a === '_' ? 1 : -1);
  const toParts = (v) => v.replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = toParts(a);
  const pb = toParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function listVersions(baseName) {
  return listVersionedFiles(baseName).map((f) => f.version).sort(compareVersions);
}

// Loads a specific version if given (falls back to the latest available if
// that exact version isn't found), otherwise the latest version.
function loadReferenceJson(baseName, version) {
  const files = listVersionedFiles(baseName);
  if (!files.length) return null;
  files.sort((x, y) => compareVersions(x.version, y.version));
  const chosen = (version && files.find((f) => f.version === version)) || files[files.length - 1];
  return JSON.parse(fs.readFileSync(path.join(REFERENCE_DATA_DIR, chosen.file), 'utf8'));
}

// js-yaml parses bare dates (e.g. `publicationDate: 2026-05-11`) into native
// Date objects. Flatten those back to plain YYYY-MM-DD strings so the client
// (and a subsequent save) sees plain JSON, matching how the files are hand-written.
function normalizeDates(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalizeDates(v)]));
  }
  return value;
}

// Human-friendly "owner/repo" form of a git remote URL, for display only.
function friendlyRemote(url) {
  if (!url) return null;
  const m = url.match(/[/:]([^/:]+\/[^/]+?)(\.git)?$/);
  return m ? m[1] : url;
}

function runGit(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function getGitInfo() {
  const remoteUrl = runGit(['remote', 'get-url', 'origin']);
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return { remoteUrl, remote: friendlyRemote(remoteUrl), branch };
}

function loadSchema() {
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  return JSON.parse(raw);
}

function buildValidator() {
  const schema = loadSchema();
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function listComponentDirs() {
  if (!fs.existsSync(SPECIFICATIONS_DIR)) return [];
  return fs.readdirSync(SPECIFICATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^TMFC\d+-/.test(d.name))
    .map((d) => d.name);
}

function listComponentYamlFiles() {
  return listComponentDirs().map((dirName) => {
    const yamlPath = path.join(SPECIFICATIONS_DIR, dirName, `${dirName.split('-')[0]}-${dirName.split('-').slice(1).join('-')}.yaml`);
    return { dirName, yamlPath };
  }).filter((f) => fs.existsSync(f.yamlPath));
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    repoRoot: REPO_ROOT,
    specificationsDirExists: fs.existsSync(SPECIFICATIONS_DIR),
    schemaExists: fs.existsSync(SCHEMA_PATH),
    apiIndexExists: fs.existsSync(API_INDEX_PATH),
    git: getGitInfo(),
    frameworksDir: REFERENCE_DATA_DIR,
    frameworksDirExists: fs.existsSync(REFERENCE_DATA_DIR),
    frameworksVersions: {
      etom: listVersions('etom'),
      sid: listVersions('sid'),
      functionalFramework: listVersions('functionalFramework'),
    },
    sharedParent: repoParent,
  });
});

// Distinct functionalBlock values seen across existing components, so the
// wizard can offer a dropdown instead of free text.
app.get('/api/functional-blocks', (req, res) => {
  const blocks = new Set();
  for (const { yamlPath } of listComponentYamlFiles()) {
    try {
      const doc = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
      const fb = doc?.spec?.componentMetadata?.functionalBlock;
      if (fb) blocks.add(fb);
    } catch {
      // skip unreadable files
    }
  }
  res.json({ functionalBlocks: [...blocks].sort() });
});

// Cache of parsed swagger docs by URL, so repeatedly picking the same API in
// the wizard doesn't re-fetch/re-parse a multi-hundred-KB file every time.
const swaggerResourceCache = new Map();

const CANONICAL_VERB_ORDER = ['GET', 'GET /id', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Turns a swagger/OpenAPI `paths` object into the {resourceName: [verbs]}
// shape used by componentMetadata resources, matching the convention seen in
// hand-written specs: a bare verb (GET, POST) is the collection-level
// operation; "GET /id" is the item-level GET, while PATCH/DELETE/PUT at item
// level keep their bare name since they're unambiguous there.
function parseSwaggerResources(doc) {
  const paths = doc?.paths || {};
  const byResource = new Map();

  for (const [rawPath, methods] of Object.entries(paths)) {
    const segments = rawPath.split('/').filter(Boolean);
    if (segments.length === 0) continue;
    const resourceName = segments[0];
    if (/^(hub|listener|events?)$/i.test(resourceName)) continue; // eventing plumbing, not a business resource

    let isItemPath;
    if (segments.length === 1) isItemPath = false;
    else if (segments.length === 2 && /^\{.*\}$/.test(segments[1])) isItemPath = true;
    else continue; // deeper nesting than resource/{id} - not modeled here

    if (!byResource.has(resourceName)) byResource.set(resourceName, new Set());
    const verbs = byResource.get(resourceName);
    for (const method of Object.keys(methods)) {
      const httpVerb = method.toUpperCase();
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(httpVerb)) continue;
      verbs.add(isItemPath && httpVerb === 'GET' ? 'GET /id' : httpVerb);
    }
  }

  return [...byResource.entries()].map(([name, verbSet]) => ({
    name,
    operations: CANONICAL_VERB_ORDER.filter((v) => verbSet.has(v)),
  }));
}

// The event group name used in publishedEvents/subscribedEvents (e.g.
// "ProductCatalogManagement") is the swagger's own title with spaces
// stripped - e.g. TMF620's info.title "Product Catalog Management" - which
// is the authoritative source, rather than guessing from the catalog's
// display name (which usually has a trailing "API" to strip first).
function parseSwaggerEventName(doc) {
  const title = doc?.info?.title;
  return title ? title.replace(/\s+/g, '') : null;
}

app.get('/api/api-resources', async (req, res) => {
  const swaggerUrl = req.query.swagger;
  if (!swaggerUrl || !/^https:\/\//.test(swaggerUrl)) {
    return res.status(400).json({ ok: false, error: 'A valid https swagger URL is required' });
  }
  if (swaggerResourceCache.has(swaggerUrl)) {
    return res.json({ ok: true, ...swaggerResourceCache.get(swaggerUrl) });
  }
  try {
    const response = await fetch(swaggerUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return res.status(502).json({ ok: false, error: `Fetching swagger failed: HTTP ${response.status}` });
    }
    const doc = await response.json();
    const payload = { resources: parseSwaggerResources(doc), eventName: parseSwaggerEventName(doc) };
    swaggerResourceCache.set(swaggerUrl, payload);
    res.json({ ok: true, ...payload });
  } catch (err) {
    res.status(502).json({ ok: false, error: `Could not fetch/parse swagger: ${err.message}` });
  }
});

// TMF API catalog (id/version/name/swagger url) for the exposed/dependent API pickers.
app.get('/api/apis', (req, res) => {
  if (!fs.existsSync(API_INDEX_PATH)) return res.json({ apis: [] });
  const raw = JSON.parse(fs.readFileSync(API_INDEX_PATH, 'utf8'));
  const apis = Object.entries(raw).map(([key, val]) => {
    const [id, versionRaw] = key.split('_v');
    return {
      key,
      id,
      version: versionRaw,
      name: val.name,
      swagger: val.swagger,
    };
  }).sort((a, b) => a.id.localeCompare(b.id) || a.version.localeCompare(b.version));
  res.json({ apis });
});

// Taxonomy catalogs for the eTOM / Functional Framework / SID pickers.
// Optional ?version=v26.0 picks a specific release; omitted defaults to the
// latest version found on disk. /versions lists what's available.
app.get('/api/etom', (req, res) => {
  res.json(loadReferenceJson('etom', req.query.version) || { version: null, entries: [] });
});
app.get('/api/etom/versions', (req, res) => res.json({ versions: listVersions('etom') }));

app.get('/api/functional-framework', (req, res) => {
  res.json(loadReferenceJson('functionalFramework', req.query.version) || { version: null, entries: [] });
});
app.get('/api/functional-framework/versions', (req, res) => res.json({ versions: listVersions('functionalFramework') }));

app.get('/api/sid', (req, res) => {
  res.json(loadReferenceJson('sid', req.query.version) || { version: null, domains: [], abesByDomain: {}, besByDomainAbe: {} });
});
app.get('/api/sid/versions', (req, res) => res.json({ versions: listVersions('sid') }));

// Lightweight list of existing components, for the "edit existing" picker.
app.get('/api/components', (req, res) => {
  const components = listComponentYamlFiles().map(({ dirName, yamlPath }) => {
    try {
      const doc = yaml.load(fs.readFileSync(yamlPath, 'utf8'));
      const meta = doc?.spec?.componentMetadata || {};
      return {
        dirName,
        fileName: path.basename(yamlPath),
        id: meta.id,
        name: meta.name,
        version: meta.version,
        status: meta.status,
        functionalBlock: meta.functionalBlock,
      };
    } catch {
      return { dirName, fileName: path.basename(yamlPath), id: null, name: null };
    }
  }).filter((c) => c.id).sort((a, b) => a.id.localeCompare(b.id));
  res.json({ components });
});

// Full parsed YAML for one existing component, to prefill the wizard for editing.
app.get('/api/component/:dirName', (req, res) => {
  const { dirName } = req.params;
  if (!/^[\w.\-]+$/.test(dirName)) {
    return res.status(400).json({ ok: false, error: 'Invalid dirName' });
  }
  const match = listComponentYamlFiles().find((f) => f.dirName === dirName);
  if (!match) {
    return res.status(404).json({ ok: false, error: `No component directory ${dirName}` });
  }
  try {
    const component = normalizeDates(yaml.load(fs.readFileSync(match.yamlPath, 'utf8')));
    res.json({ ok: true, dirName: match.dirName, fileName: path.basename(match.yamlPath), component });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Next unused TMFCxxx id, based on existing component directories.
app.get('/api/next-id', (req, res) => {
  let max = 0;
  for (const dirName of listComponentDirs()) {
    const m = dirName.match(/^TMFC(\d+)-/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  const next = max + 1;
  res.json({ id: `TMFC${String(next).padStart(3, '0')}` });
});

app.post('/api/validate', (req, res) => {
  try {
    const validate = buildValidator();
    const component = req.body.component;
    const valid = validate(component);
    res.json({ valid, errors: valid ? [] : validate.errors });
  } catch (err) {
    res.status(500).json({ valid: false, errors: [{ message: err.message }] });
  }
});

app.post('/api/save', (req, res) => {
  try {
    const { component, dirName, fileName, force } = req.body;
    if (!dirName || !fileName || !component) {
      return res.status(400).json({ ok: false, error: 'dirName, fileName and component are required' });
    }
    if (!/^[\w.\-]+$/.test(dirName) || !/^[\w.\-]+\.yaml$/.test(fileName)) {
      return res.status(400).json({ ok: false, error: 'Invalid dirName or fileName' });
    }

    const validate = buildValidator();
    const valid = validate(component);
    if (!valid) {
      return res.status(422).json({ ok: false, error: 'Component fails schema validation', errors: validate.errors });
    }

    const targetDir = path.join(SPECIFICATIONS_DIR, dirName);
    const targetFile = path.join(targetDir, fileName);

    if (fs.existsSync(targetFile) && !force) {
      return res.status(409).json({ ok: false, error: `${fileName} already exists in ${dirName}` });
    }

    fs.mkdirSync(targetDir, { recursive: true });
    const yamlText = yaml.dump(component, { sortKeys: false, lineWidth: -1, noArrayIndent: true });
    fs.writeFileSync(targetFile, yamlText, 'utf8');

    res.json({ ok: true, path: targetFile });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Locates the built client (client/dist) to serve as static files, so a
// packaged .exe can be one self-contained process instead of needing a
// separate Vite dev server. Checked in order: a "public" folder shipped next
// to the packaged exe, a "public" folder next to this script, then the
// monorepo dev layout (../client/dist) - whichever has an index.html wins.
// process.argv[1] (not __dirname/import.meta.url) is used deliberately so
// this works unchanged whether run as raw ESM in dev or bundled to CJS.
function resolvePublicDir() {
  const scriptDir = path.dirname(process.argv[1] || '.');
  const candidates = [
    process.pkg ? path.join(path.dirname(process.execPath), 'public') : null,
    path.join(scriptDir, 'public'),
    path.join(scriptDir, '..', 'client', 'dist'), // dev: index.js run from server/
    path.join(scriptDir, '..', '..', 'client', 'dist'), // dev: bundle.cjs run from server/dist/
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(path.join(p, 'index.html'))) || null;
}

const PUBLIC_DIR = resolvePublicDir();
if (PUBLIC_DIR) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));
}

const PORT = process.env.PORT || 4310;
app.listen(PORT, () => {
  console.log(`component-spec-editor server listening on http://localhost:${PORT}`);
  console.log(`REPO_ROOT=${REPO_ROOT}`);
  console.log(PUBLIC_DIR ? `Serving built client from ${PUBLIC_DIR}` : 'No built client found - API only (run the Vite dev server separately).');

  // Packaged exe: open the app in the user's default browser automatically,
  // matching the double-click-and-go expectation of a desktop app.
  if (process.pkg) {
    exec(`start "" "http://localhost:${PORT}"`);
  }
});
