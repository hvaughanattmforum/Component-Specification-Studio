import express from 'express';
import cors from 'cors';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, exec, execFile } from 'child_process';
import { promisify } from 'util';
import yaml from 'js-yaml';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// User-level settings (currently just repoRoot), independent of any single
// install/checkout so they survive reinstalling or moving the app itself.
// The REPO_ROOT env var always wins over this file when set, matching the
// existing env-var-overrides-default precedence.
const CONFIG_PATH = path.join(os.homedir(), '.component-spec-studio', 'config.json');

function readConfigFile() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeConfigFile(partial) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  const next = { ...readConfigFile(), ...partial };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

const savedConfig = readConfigFile();

// Root of the Component Specification repo this app edits. Precedence:
// REPO_ROOT env var > saved config (set via the Setup Instructions tab) >
// the v1.1.0 checkout the original author had attached.
const REPO_ROOT = process.env.REPO_ROOT
  || savedConfig.repoRoot
  || 'C:\\Users\\HugoVaughan\\ClaudeCode\\TMForum-ODA-Component-Specification-v1.1.0';

const REPO_ROOT_SOURCE = process.env.REPO_ROOT ? 'env' : (savedConfig.repoRoot ? 'config' : 'default');

const SPECIFICATIONS_DIR = path.join(REPO_ROOT, 'specifications');
const SCHEMA_PATH = path.join(REPO_ROOT, 'ci', 'component.schema.json');
const API_INDEX_PATH = path.join(REPO_ROOT, 'apiIndex.json');

// Reference taxonomy catalogs (eTOM/SID/Functional Framework), pre-converted
// from the official TMForum GB921/GB922/GB1033 Excel exports by
// scripts/parse_reference_data.py. This directory is configured fully
// independently of REPO_ROOT (env var > saved config, set via the Setup
// Instructions tab > a bundled "frameworks" folder shipped next to the
// packaged exe, if present > the legacy sibling-of-REPO_ROOT default) - the
// two no longer need to share a parent directory, so the repo checkout and
// the frameworks data can live anywhere on disk independently.
function resolveDefaultFrameworksDir() {
  const scriptDir = path.dirname(process.argv[1] || '.');
  const candidates = [
    process.pkg ? path.join(path.dirname(process.execPath), 'frameworks') : null,
    path.join(scriptDir, 'frameworks'),
    path.join(scriptDir, '..', 'frameworks'), // dev: index.js run from server/
    path.join(scriptDir, '..', '..', 'frameworks'), // dev: bundle.cjs run from server/dist/
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || path.join(path.dirname(REPO_ROOT), 'frameworks');
}

const REFERENCE_DATA_DIR = process.env.FRAMEWORKS_DIR
  || savedConfig.frameworksDir
  || resolveDefaultFrameworksDir();

const FRAMEWORKS_DIR_SOURCE = process.env.FRAMEWORKS_DIR ? 'env' : (savedConfig.frameworksDir ? 'config' : 'default');

// Frameworks catalogs are versioned in their filename (etom_v26.0.json,
// sid_v26.0.json, ...), produced by scripts/parse_reference_data.py -
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

app.get('/api/config', (req, res) => {
  res.json({
    repoRoot: REPO_ROOT,
    source: REPO_ROOT_SOURCE,
    envOverrideActive: Boolean(process.env.REPO_ROOT),
    frameworksDir: REFERENCE_DATA_DIR,
    frameworksDirSource: FRAMEWORKS_DIR_SOURCE,
    frameworksDirEnvOverrideActive: Boolean(process.env.FRAMEWORKS_DIR),
    configPath: CONFIG_PATH,
  });
});

app.post('/api/config', (req, res) => {
  const { repoRoot, frameworksDir } = req.body;
  if (repoRoot !== undefined && (typeof repoRoot !== 'string' || !path.isAbsolute(repoRoot))) {
    return res.status(400).json({ ok: false, error: 'repoRoot must be an absolute path' });
  }
  if (frameworksDir !== undefined && (typeof frameworksDir !== 'string' || !path.isAbsolute(frameworksDir))) {
    return res.status(400).json({ ok: false, error: 'frameworksDir must be an absolute path' });
  }
  if (repoRoot === undefined && frameworksDir === undefined) {
    return res.status(400).json({ ok: false, error: 'repoRoot or frameworksDir is required' });
  }
  try {
    const partial = {};
    if (repoRoot !== undefined) partial.repoRoot = repoRoot;
    if (frameworksDir !== undefined) partial.frameworksDir = frameworksDir;
    writeConfigFile(partial);
    res.json({
      ok: true,
      repoRoot: repoRoot !== undefined ? repoRoot : REPO_ROOT,
      frameworksDir: frameworksDir !== undefined ? frameworksDir : REFERENCE_DATA_DIR,
      envOverrideActive: Boolean(process.env.REPO_ROOT),
      frameworksDirEnvOverrideActive: Boolean(process.env.FRAMEWORKS_DIR),
      restartRequired: true,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    repoRoot: REPO_ROOT,
    repoRootSource: REPO_ROOT_SOURCE,
    specificationsDirExists: fs.existsSync(SPECIFICATIONS_DIR),
    schemaExists: fs.existsSync(SCHEMA_PATH),
    apiIndexExists: fs.existsSync(API_INDEX_PATH),
    git: getGitInfo(),
    frameworksDir: REFERENCE_DATA_DIR,
    frameworksDirSource: FRAMEWORKS_DIR_SOURCE,
    frameworksDirExists: fs.existsSync(REFERENCE_DATA_DIR),
    frameworksVersions: currentFrameworksVersions(),
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

// Event names available for publishedEvents/subscribedEvents `resources` -
// these come from the swagger's own `/listener/{eventName}` paths (the
// notification-callback convention TMF APIs use), e.g.
// "/listener/catalogCreateEvent" -> "catalogCreateEvent". This is the same
// name hand-written specs list under `resources`, so no guessing/renaming.
function parseSwaggerEvents(doc) {
  const paths = doc?.paths || {};
  const events = new Set();
  for (const rawPath of Object.keys(paths)) {
    const m = rawPath.match(/^\/listener\/([^/]+)$/i);
    if (m) events.add(m[1]);
  }
  return [...events].sort();
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
    const payload = {
      resources: parseSwaggerResources(doc),
      eventName: parseSwaggerEventName(doc),
      events: parseSwaggerEvents(doc),
    };
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

function currentFrameworksVersions() {
  return {
    etom: listVersions('etom'),
    sid: listVersions('sid'),
    functionalFramework: listVersions('functionalFramework'),
  };
}

// scripts/parse_reference_data.py lives in the app's own code, not in the
// frameworks data directory (which should only ever hold spreadsheets and
// generated JSON), so it has to be located relative to the running server
// the same way resolvePublicDir() locates the built client: a "scripts"
// folder shipped next to the packaged exe, next to this script, or the
// monorepo dev layout, whichever actually has the file.
function resolveParseScriptPath() {
  const scriptDir = path.dirname(process.argv[1] || '.');
  const candidates = [
    process.pkg ? path.join(path.dirname(process.execPath), 'scripts', 'parse_reference_data.py') : null,
    path.join(scriptDir, 'scripts', 'parse_reference_data.py'),
    path.join(scriptDir, '..', 'scripts', 'parse_reference_data.py'), // dev: index.js run from server/
    path.join(scriptDir, '..', '..', 'scripts', 'parse_reference_data.py'), // dev: bundle.cjs run from server/dist/
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// Re-runs scripts/parse_reference_data.py against whatever GB921*/GB922*/
// GB1033* spreadsheets currently sit in the frameworks directory, so a new
// release's spreadsheet can be picked up from the UI instead of a terminal.
// Tries `python` then `python3` on PATH, since which one exists varies by
// machine/OS.
app.post('/api/frameworks/regenerate', async (req, res) => {
  const scriptPath = resolveParseScriptPath();
  if (!scriptPath) {
    return res.status(404).json({ ok: false, error: 'Could not locate scripts/parse_reference_data.py alongside the running server.' });
  }

  for (const command of ['python', 'python3']) {
    try {
      const { stdout, stderr } = await execFileAsync(command, [scriptPath, REFERENCE_DATA_DIR], {
        cwd: REFERENCE_DATA_DIR,
        timeout: 120000,
      });
      return res.json({
        ok: true,
        pythonCommand: command,
        output: [stdout, stderr].filter(Boolean).join('\n').trim(),
        frameworksVersions: currentFrameworksVersions(),
      });
    } catch (err) {
      if (err.code === 'ENOENT') continue; // this command isn't on PATH - try the next one
      return res.status(500).json({
        ok: false,
        pythonCommand: command,
        error: err.message,
        output: [err.stdout, err.stderr].filter(Boolean).join('\n').trim(),
      });
    }
  }
  res.status(500).json({ ok: false, error: 'Could not find a Python interpreter on PATH (tried "python" and "python3"). Install Python 3 and ensure it\'s on PATH (openpyxl is bundled with the app, so no separate pip install is needed).' });
});

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

// eTOM-SID link tables (specifications/<dirName>/Diagrams/<ID>_eTOM_SID_Links.md)
// document which eTOM activities connect to which SID ABEs, transcribed by
// hand from each component's original spec PDF - the source of truth for
// the "eTOM L2 - SID ABEs links" diagram. They're plain GFM tables with a
// title and free-text provenance notes before/after, so parsing has to
// locate the table by its separator row (`|---|---|...`) rather than by
// exact header wording, and cell values that contain a literal `|` (the
// "YAML eTOM"/"YAML SID" columns pack multiple pipe-delimited identifier
// parts into one cell) escape it as `\|` to avoid being read as a column
// break.
const LINKS_COLUMNS = ['eTOM activity', 'SID ABE', 'Direction', 'YAML eTOM', 'YAML SID'];
const LINKS_FIELDS = ['etomActivity', 'sidABE', 'direction', 'yamlETOM', 'yamlSID'];

function linksFilePath(dirName) {
  const id = dirName.split('-')[0];
  return path.join(SPECIFICATIONS_DIR, dirName, 'Diagrams', `${id}_eTOM_SID_Links.md`);
}

function splitTableRow(line) {
  const PLACEHOLDER = ' ';
  let trimmed = line.trim().replace(/\\\|/g, PLACEHOLDER);
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  return trimmed.split('|').map((cell) => cell.trim().split(PLACEHOLDER).join('|'));
}

function parseLinksMarkdown(text, id) {
  const lines = text.split(/\r?\n/);
  const sepIdx = lines.findIndex((l) => /^\s*\|[\s:-]*-[\s:|-]*\|\s*$/.test(l));

  let heading = `${id} eTOM–SID Links`;
  let headingLineIdx = -1;
  const firstNonBlank = lines.findIndex((l) => l.trim() !== '');
  if (firstNonBlank !== -1 && lines[firstNonBlank].trim().startsWith('#')) {
    heading = lines[firstNonBlank].trim().replace(/^#+\s*/, '');
    headingLineIdx = firstNonBlank;
  }

  if (sepIdx === -1 || sepIdx === 0) {
    // No table found - treat the whole file (minus any heading line) as "before" notes.
    const notesBefore = lines.slice(headingLineIdx + 1).join('\n').trim();
    return { heading, notesBefore, notesAfter: '', links: [] };
  }

  const headerRowIdx = sepIdx - 1;
  const notesBefore = lines.slice(headingLineIdx + 1, headerRowIdx).join('\n').trim();

  let dataEndIdx = sepIdx + 1;
  while (dataEndIdx < lines.length && lines[dataEndIdx].trim().startsWith('|')) dataEndIdx++;

  const links = lines.slice(sepIdx + 1, dataEndIdx)
    .map((line) => splitTableRow(line))
    .filter((cells) => cells.some((c) => c !== ''))
    .map((cells) => Object.fromEntries(LINKS_FIELDS.map((f, i) => [f, cells[i] || ''])));

  const notesAfter = lines.slice(dataEndIdx).join('\n').trim();

  return { heading, notesBefore, notesAfter, links };
}

function renderLinksMarkdown({ heading, notesBefore, notesAfter, links }) {
  const escapeCell = (v) => (v || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const parts = [`# ${heading}`, ''];
  if (notesBefore?.trim()) parts.push(notesBefore.trim(), '');
  parts.push(`| ${LINKS_COLUMNS.join(' | ')} |`);
  parts.push(`|${LINKS_COLUMNS.map(() => '---').join('|')}|`);
  for (const row of links) {
    parts.push(`| ${LINKS_FIELDS.map((f) => escapeCell(row[f])).join(' | ')} |`);
  }
  if (notesAfter?.trim()) parts.push('', notesAfter.trim());
  parts.push('');
  return parts.join('\n');
}

app.get('/api/component/:dirName/links', (req, res) => {
  const { dirName } = req.params;
  if (!/^[\w.\-]+$/.test(dirName)) {
    return res.status(400).json({ ok: false, error: 'Invalid dirName' });
  }
  const filePath = linksFilePath(dirName);
  const id = dirName.split('-')[0];
  if (!fs.existsSync(filePath)) {
    return res.json({ ok: true, exists: false, heading: `${id} eTOM–SID Links`, notesBefore: '', notesAfter: '', links: [] });
  }
  try {
    const parsed = parseLinksMarkdown(fs.readFileSync(filePath, 'utf8'), id);
    res.json({ ok: true, exists: true, ...parsed });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/component/:dirName/links', (req, res) => {
  const { dirName } = req.params;
  if (!/^[\w.\-]+$/.test(dirName)) {
    return res.status(400).json({ ok: false, error: 'Invalid dirName' });
  }
  const { heading, notesBefore, notesAfter, links } = req.body;
  if (!Array.isArray(links)) {
    return res.status(400).json({ ok: false, error: 'links must be an array' });
  }
  try {
    const filePath = linksFilePath(dirName);
    const id = dirName.split('-')[0];
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, renderLinksMarkdown({ heading: heading || `${id} eTOM–SID Links`, notesBefore, notesAfter, links }), 'utf8');
    res.json({ ok: true, path: filePath });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// The <ID>_<Name>_Supplement.md file (specifications/<dirName>/Diagrams/) is
// the hand-curated tail of a component's specification - Jira references,
// further resources, and the administrative appendix (document/release
// history, acknowledgements). It's free-form prose and tables whose section
// numbering isn't consistent across components (some nest everything under
// one "Jira References" heading, others use flat top-level sections per
// framework, some have no section 5 content at all), so unlike the eTOM-SID
// links file this is edited as raw markdown rather than parsed into fields -
// any structural assumption strict enough to parse it would misparse a good
// fraction of the real files. The component-specification-markdown skill
// treats this file as a one-time-seeded, hand-maintained input it only ever
// reads (never regenerates), so editing it here is safe and matches how the
// rest of the toolchain already treats it.
//
// The filename doesn't follow a clean mechanical rule in practice (e.g.
// "and" is sometimes kept lowercase and un-split, a few components' files
// are named shorter than their full componentMetadata.name), so an existing
// file is located by pattern rather than by deriving its exact name -
// that derivation is only used as a default when creating a brand new one.
const SUPPLEMENT_TEMPLATE = `### 5.2. Jira References

#### 5.2.1. eTOM
- <https://projects.tmforum.org/jira/browse/XXX-000> short description of the issue

#### 5.2.3. Functional Framework
- <https://projects.tmforum.org/jira/browse/XXX-000> short description of the issue

#### 5.2.4. API
- TMFxxx - API Name: short description of the issue
  - <https://projects.tmforum.org/jira/browse/XXX-000>

### 5.3. Further resources

This component is involved in the following use cases described in <name and reference of guide>.

## 6. Administrative Appendix

### 6.1. Document History

#### 6.1.1. Version History

| Version Number | Date | Modified by | Description of changes |
|---|---|---|---|
| 1.0.0 | DD-Mon-YYYY | Author Name | Initial publication |

#### 6.1.2. Release History

| Release Status | Date Modified | Modified by | Description of changes |
|---|---|---|---|
| Pre-production | DD-Mon-YYYY | Author Name | Initial release |

### 6.2. Acknowledgements

This document was prepared by the members of the TM Forum ODA Components & Canvas team.

| Team Member | Company | Role |
|---|---|---|
| Author Name | Company | Editor |
`;

function pascalToUnderscore(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').trim().replace(/\s+/g, '_');
}

function defaultSupplementFileName(dirName) {
  const id = dirName.split('-')[0];
  const match = listComponentYamlFiles().find((f) => f.dirName === dirName);
  let name = dirName.split('-').slice(1).join('-');
  if (match) {
    try {
      const doc = yaml.load(fs.readFileSync(match.yamlPath, 'utf8'));
      name = doc?.spec?.componentMetadata?.name || name;
    } catch {
      // fall through to the dirName-derived name
    }
  }
  return `${id}_${pascalToUnderscore(name)}_Supplement.md`;
}

// Finds the existing file by pattern (never by deriving its name - see
// comment above) so a legacy non-standard filename is still found rather
// than treated as missing.
function findSupplementFile(dirName) {
  const diagramsDir = path.join(SPECIFICATIONS_DIR, dirName, 'Diagrams');
  if (!fs.existsSync(diagramsDir)) return null;
  const match = fs.readdirSync(diagramsDir).find((f) => f.endsWith('_Supplement.md'));
  return match ? path.join(diagramsDir, match) : null;
}

app.get('/api/component/:dirName/supplement', (req, res) => {
  const { dirName } = req.params;
  if (!/^[\w.\-]+$/.test(dirName)) {
    return res.status(400).json({ ok: false, error: 'Invalid dirName' });
  }
  const filePath = findSupplementFile(dirName);
  if (!filePath) {
    return res.json({ ok: true, exists: false, path: null, content: '' });
  }
  try {
    res.json({ ok: true, exists: true, path: filePath, content: fs.readFileSync(filePath, 'utf8') });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/component/:dirName/supplement', (req, res) => {
  const { dirName } = req.params;
  if (!/^[\w.\-]+$/.test(dirName)) {
    return res.status(400).json({ ok: false, error: 'Invalid dirName' });
  }
  const { content } = req.body;
  if (typeof content !== 'string') {
    return res.status(400).json({ ok: false, error: 'content must be a string' });
  }
  try {
    const filePath = findSupplementFile(dirName) || path.join(SPECIFICATIONS_DIR, dirName, 'Diagrams', defaultSupplementFileName(dirName));
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ ok: true, path: filePath });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
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
  console.log(`REPO_ROOT=${REPO_ROOT} (source: ${REPO_ROOT_SOURCE})`);
  console.log(PUBLIC_DIR ? `Serving built client from ${PUBLIC_DIR}` : 'No built client found - API only (run the Vite dev server separately).');

  // Packaged exe: open the app in the user's default browser automatically,
  // matching the double-click-and-go expectation of a desktop app.
  if (process.pkg) {
    exec(`start "" "http://localhost:${PORT}"`);
  }
});
