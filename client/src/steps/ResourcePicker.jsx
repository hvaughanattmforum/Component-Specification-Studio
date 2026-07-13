import React, { useState } from 'react';
import { api } from '../api.js';
import { matchCatalogEntry } from '../apiCatalogUtils.js';

export default function ResourcePicker({ apiId, apiVersion, apiCatalog, existingResources, onAdd }) {
  const [resources, setResources] = useState(null);
  const [checked, setChecked] = useState({}); // { [resourceName]: Set(verbs) }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const match = matchCatalogEntry(apiCatalog, (apiId || '').trim(), apiVersion);

  const load = async () => {
    if (!match) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.apiResources(match.swagger);
      setResources(result.resources);
      const initialChecked = {};
      result.resources.forEach((r) => { initialChecked[r.name] = new Set(); });
      setChecked(initialChecked);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (resourceName, verb) => {
    setChecked((prev) => {
      const next = new Set(prev[resourceName]);
      if (next.has(verb)) next.delete(verb); else next.add(verb);
      return { ...prev, [resourceName]: next };
    });
  };

  const add = (resourceName) => {
    const verbs = [...(checked[resourceName] || [])];
    if (!verbs.length) return;
    onAdd(resourceName, verbs);
  };

  if (!apiId) return null;

  return (
    <div className="field">
      <label>Resource picker <span className="hint">from the API's real swagger spec</span></label>
      {!match && <div className="hint">No catalog entry found for {apiId}{apiVersion ? ` v${apiVersion}` : ''} - use the resource rows below manually.</div>}
      {match && (
        <button type="button" onClick={load} disabled={loading}>
          {loading ? 'Loading spec...' : `Load resources from ${match.id} v${match.version} spec`}
        </button>
      )}
      {error && <div className="status-banner error" style={{ marginTop: 8 }}>{error}</div>}

      {resources && (
        <div className="card-list" style={{ marginTop: 10, maxHeight: 280, overflowY: 'auto' }}>
          {resources.map((r) => {
            const already = existingResources.some((er) => er.name === r.name);
            return (
              <div className="card" key={r.name}>
                <div className="row" style={{ alignItems: 'center' }}>
                  <strong style={{ flex: 1 }}>{r.name}{already ? ' (already added)' : ''}</strong>
                  <button type="button" className="ghost" onClick={() => add(r.name)}>+ Add</button>
                </div>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                  {r.operations.map((verb) => (
                    <label key={verb} className="checkbox-row" style={{ fontSize: '0.82rem' }}>
                      <input
                        type="checkbox"
                        checked={checked[r.name]?.has(verb) || false}
                        onChange={() => toggle(r.name, verb)}
                      />
                      {verb}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
