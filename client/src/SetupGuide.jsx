import React, { useEffect, useState } from 'react';
import { api } from './api.js';

function StatusDot({ ok }) {
  return <span style={{ color: ok ? 'var(--ok)' : 'var(--danger)' }}>{ok ? '✓' : '✗'}</span>;
}

function RepoRootConfig({ repoInfo }) {
  const [config, setConfig] = useState(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error? }

  useEffect(() => {
    api.getConfig().then((c) => {
      setConfig(c);
      setValue(c.repoRoot || '');
    }).catch(() => {});
  }, []);

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await api.setConfig(value.trim());
      if (res.ok) {
        setResult({ ok: true });
        setConfig((c) => ({ ...c, repoRoot: res.repoRoot, source: 'config' }));
      } else {
        setResult({ ok: false, error: res.error || 'Save failed' });
      }
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="field">
      <label>Repo root configuration</label>
      {!config && <div className="hint">Loading...</div>}
      {config && (
        <div className="card">
          <div>Currently using: <code>{repoInfo?.repoRoot || config.repoRoot}</code></div>
          <div className="hint" style={{ marginTop: 4 }}>
            Source: {config.source === 'env' ? 'REPO_ROOT environment variable' : config.source === 'config' ? 'saved setting' : 'built-in default'}
          </div>
          {config.envOverrideActive && (
            <div className="hint" style={{ marginTop: 4, color: 'var(--danger)' }}>
              The REPO_ROOT environment variable is set and always takes priority over this setting.
              Unset it to let the value below take effect.
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="C:\path\to\TMForum-ODA-Component-Specification checkout"
              style={{ flex: 1 }}
            />
            <button onClick={save} disabled={saving || !value.trim()}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          {result?.ok && (
            <div className="hint" style={{ marginTop: 6, color: 'var(--ok)' }}>
              Saved to {config.configPath}. Restart the app for this to take effect.
            </div>
          )}
          {result?.error && (
            <div className="hint" style={{ marginTop: 6, color: 'var(--danger)' }}>{result.error}</div>
          )}
        </div>
      )}
    </div>
  );
}

function FrameworksRegenerate({ onRegenerated }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null); // { ok, error?, output?, pythonCommand?, frameworksVersions? }

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await api.regenerateFrameworks();
      setResult(res);
      if (res.ok) onRegenerated?.();
    } catch (err) {
      setResult({ ok: false, error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button type="button" onClick={run} disabled={running}>
        {running ? 'Regenerating...' : 'Regenerate frameworks catalogs now'}
      </button>
      {result?.ok && (
        <div className="status-banner ok" style={{ marginTop: 8 }}>
          Done (via {result.pythonCommand}). eTOM: {result.frameworksVersions.etom.join(', ') || 'none'}
          {' · '}SID: {result.frameworksVersions.sid.join(', ') || 'none'}
          {' · '}Functional Framework: {result.frameworksVersions.functionalFramework.join(', ') || 'none'}
        </div>
      )}
      {result && !result.ok && (
        <div className="status-banner error" style={{ marginTop: 8 }}>{result.error}</div>
      )}
      {result?.output && (
        <pre className="yaml-preview" style={{ marginTop: 8 }}>{result.output}</pre>
      )}
    </div>
  );
}

export default function SetupGuide({ repoInfo, onFrameworksRegenerated }) {
  const parent = repoInfo?.sharedParent;

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Setup</h3>

      <div className="field">
        <label>Current configuration</label>
        {!repoInfo && <div className="hint">Loading...</div>}
        {repoInfo && (
          <div className="card">
            <div>Repo root: <code>{repoInfo.repoRoot}</code></div>
            <div><StatusDot ok={repoInfo.specificationsDirExists} /> specifications/ folder found</div>
            <div><StatusDot ok={repoInfo.schemaExists} /> ci/component.schema.json found</div>
            <div><StatusDot ok={repoInfo.apiIndexExists} /> apiIndex.json found</div>
            {repoInfo.git?.remote && (
              <div>Git: {repoInfo.git.remoteUrl ? <a href={repoInfo.git.remoteUrl} target="_blank" rel="noreferrer">{repoInfo.git.remote}</a> : repoInfo.git.remote}{repoInfo.git.branch ? ` @ ${repoInfo.git.branch}` : ''}</div>
            )}
            <div style={{ marginTop: 8 }}>Frameworks dir: <code>{repoInfo.frameworksDir}</code></div>
            <div><StatusDot ok={repoInfo.frameworksDirExists} /> directory found</div>
            <div><StatusDot ok={repoInfo.frameworksVersions?.etom?.length} /> eTOM versions: {repoInfo.frameworksVersions?.etom?.join(', ') || 'none'}</div>
            <div><StatusDot ok={repoInfo.frameworksVersions?.sid?.length} /> SID versions: {repoInfo.frameworksVersions?.sid?.join(', ') || 'none'}</div>
            <div><StatusDot ok={repoInfo.frameworksVersions?.functionalFramework?.length} /> Functional Framework versions: {repoInfo.frameworksVersions?.functionalFramework?.join(', ') || 'none'}</div>
            <div style={{ marginTop: 8 }}>Shared parent directory: <code>{parent}</code></div>
          </div>
        )}
      </div>

      <RepoRootConfig repoInfo={repoInfo} />

      <div className="field">
        <label>Required directory layout</label>
        <p className="hint">
          The repo checkout and the frameworks data directory must be siblings under one shared parent -
          this is enforced at server startup, not just a convention. Moving the whole workspace only
          means moving one parent folder, instead of re-pointing two independent absolute paths.
        </p>
        <pre className="yaml-preview">{`<workspace>/
  TMForum-ODA-Component-Specification-v1.1.0/   <- REPO_ROOT (the spec repo checkout)
  frameworks/                                    <- eTOM / SID / Functional Framework data ONLY
    GB921_Business_Process_Framework_Processes_Excel_v26.0.xlsx
    GB922_Information_Framework_SID_Excel_v26.0.xlsx
    GB1033F_Functional_Framework_Excel_Format_v26.0.xlsx
    etom_v26.0.json               <- generated; version comes from the xlsx filename
    sid_v26.0.json                <- multiple versions can coexist (etom_v27.0.json, ...)
    functionalFramework_v26.0.json <- the server serves the latest version by default`}</pre>
        <p className="hint">
          The converter script itself (<code>parse_reference_data.py</code>) lives in this app's own
          <code>scripts/</code> folder, not in frameworks/ - that directory should only ever hold the
          source spreadsheets and the generated JSON.
        </p>
      </div>

      <div className="field">
        <label>Environment variables</label>
        <ul className="errors-list">
          <li><code>REPO_ROOT</code> - path to the component spec repo checkout. Precedence: this env var, then the saved setting from the "Repo root configuration" card above, then the built-in default.</li>
          <li><code>FRAMEWORKS_DIR</code> - path to the frameworks data directory. Defaults to a <code>frameworks</code> folder next to <code>REPO_ROOT</code>.</li>
          <li><code>PORT</code> - server port (default 4310).</li>
        </ul>
        <p className="hint">Both directories must resolve to the same parent, or the server refuses to start and prints exactly which paths mismatched.</p>
      </div>

      <div className="field">
        <label>Regenerating the frameworks catalogs</label>
        <p className="hint">
          Drop a new release's spreadsheet into frameworks/ alongside the old one (don't need to remove it)
          and re-run the converter - every GB921*/GB922*/GB1033* file present gets its own versioned JSON,
          named from the version in its filename (e.g. "..._v27.0.xlsx" -&gt; "etom_v27.0.json"). The server
          always serves the latest version by default. If a spreadsheet's filename has no parseable version,
          conversion still succeeds - the output is named with an underscore in place of the version
          (e.g. "etom__.json") instead of failing.
        </p>
        <pre className="yaml-preview">{`python component-spec-editor/scripts/parse_reference_data.py <frameworks-dir>
# or, from inside the frameworks directory itself:
cd frameworks && python ../component-spec-editor/scripts/parse_reference_data.py`}</pre>
        <p className="hint">Or just use the button below - it runs the same script against this server's configured frameworks directory.</p>
        <FrameworksRegenerate onRegenerated={onFrameworksRegenerated} />
      </div>

      <div className="field">
        <label>Running the app (development)</label>
        <p className="hint">Two dev servers, defined in <code>.claude/launch.json</code>:</p>
        <ul className="errors-list">
          <li><code>spec-editor-server</code> - Express API, port 4310, restarts automatically on file changes (<code>node --watch</code>).</li>
          <li><code>spec-editor-client</code> - Vite dev server, port 4320, proxies <code>/api</code> to the server.</li>
        </ul>
      </div>

      <div className="field">
        <label>Packaging a standalone Windows exe</label>
        <p className="hint">
          Bundles the server and built client into one self-contained process - double-click and it
          opens your browser to the app, no Node install or dev servers required.
        </p>
        <pre className="yaml-preview">{`cd component-spec-editor
npm install
npm run dist
# produces dist/ComponentSpecStudio.exe + dist/public/ + dist/scripts/`}</pre>
        <p className="hint">
          Distribute <code>ComponentSpecStudio.exe</code> together with its sibling <code>public/</code>
          (the built UI) and <code>scripts/</code> (frameworks converter) folders - all three must sit in the
          same directory. REPO_ROOT and FRAMEWORKS_DIR still apply the same way as in dev (env vars, or the
          defaults if run on this machine).
        </p>
      </div>

      <div className="field">
        <label>Building an installable Windows exe</label>
        <p className="hint">
          A real installer - Start Menu shortcut, registered in Add/Remove Programs with a working
          uninstaller - rather than the portable exe above. No admin rights needed; installs per-user to
          %LOCALAPPDATA%\Programs\ComponentSpecStudio.
        </p>
        <pre className="yaml-preview">{`cd component-spec-editor
npm run dist
cp dist/ComponentSpecStudio.exe installer/payload/
powershell -Command "Compress-Archive -Path dist/public/* -DestinationPath installer/payload/public.zip -Force"
powershell -Command "Compress-Archive -Path dist/scripts/* -DestinationPath installer/payload/scripts.zip -Force"
cd installer
npx pkg . --targets node22-win-x64 --output ../dist/ComponentSpecStudio-Setup.exe
# produces dist/ComponentSpecStudio-Setup.exe - just run it`}</pre>
        <p className="hint">
          The setup exe embeds the app + install/uninstall PowerShell scripts, unpacks them to a temp
          folder, and runs the installer. To uninstall: Settings → Apps → "ODA Component Specification
          Studio" → Uninstall (or run <code>uninstall.ps1</code> from the install folder directly).
        </p>
      </div>
    </div>
  );
}
