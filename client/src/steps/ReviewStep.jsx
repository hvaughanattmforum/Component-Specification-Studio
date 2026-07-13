import React, { useState } from 'react';
import yaml from 'js-yaml';
import { api } from '../api.js';
import { buildComponent, fileNamesFor } from '../buildComponent.js';

export default function ReviewStep({ state, original, originalLocation, mode }) {
  const [validation, setValidation] = useState(null);
  const [saveResult, setSaveResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const component = buildComponent(state, original);
  const yamlText = yaml.dump(component, { sortKeys: false, lineWidth: -1, noArrayIndent: true });
  const { dirName, fileName } = mode === 'edit' && originalLocation ? originalLocation : fileNamesFor(state);

  const runValidate = async () => {
    setBusy(true);
    setSaveResult(null);
    try {
      const result = await api.validate(component);
      setValidation(result);
    } catch (err) {
      setValidation({ valid: false, errors: [{ message: err.message }] });
    } finally {
      setBusy(false);
    }
  };

  const runSave = async (force = false) => {
    setBusy(true);
    try {
      const result = await api.save({ component, dirName, fileName, force: force || mode === 'edit' });
      setSaveResult(result);
      if (result.ok) setValidation({ valid: true, errors: [] });
    } catch (err) {
      setSaveResult({ ok: false, error: err.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Review &amp; save</h3>
      <div className="field">
        <label>{mode === 'edit' ? 'Will update' : 'Will be saved to'}</label>
        <code>specifications/{dirName}/{fileName}</code>
      </div>

      {validation && !validation.valid && (
        <div className="status-banner error">
          Schema validation failed:
          <ul className="errors-list">
            {validation.errors.map((e, i) => (
              <li key={i}>{e.instancePath ? `${e.instancePath} ` : ''}{e.message}</li>
            ))}
          </ul>
        </div>
      )}
      {validation && validation.valid && (
        <div className="status-banner ok">Valid against component.schema.json.</div>
      )}

      {saveResult && saveResult.ok && (
        <div className="status-banner ok">Saved to {saveResult.path}</div>
      )}
      {saveResult && !saveResult.ok && saveResult.status === 409 && (
        <div className="status-banner error">
          {saveResult.error}
          <div style={{ marginTop: 8 }}>
            <button className="danger" onClick={() => runSave(true)} disabled={busy}>Overwrite anyway</button>
          </div>
        </div>
      )}
      {saveResult && !saveResult.ok && saveResult.status !== 409 && (
        <div className="status-banner error">
          {saveResult.error}
          {saveResult.errors && (
            <ul className="errors-list">
              {saveResult.errors.map((e, i) => (
                <li key={i}>{e.instancePath ? `${e.instancePath} ` : ''}{e.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={runValidate} disabled={busy}>Validate</button>
        <button className="primary" onClick={() => runSave(false)} disabled={busy}>{mode === 'edit' ? 'Save changes' : 'Save component'}</button>
      </div>

      <pre className="yaml-preview">{yamlText}</pre>
    </div>
  );
}
