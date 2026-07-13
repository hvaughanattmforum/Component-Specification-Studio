import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const MAX_RESULTS = 25;

// Shared picker for eTOM (Business Process Framework) and Functional
// Framework entries: both are flat catalogs of {id, name, token, domain}
// formatted into "id|token|version" lines, matching the schema's plain
// string-array fields. Owns its own version selection and catalog fetch, so
// switching versions re-queries that release's data instead of always
// searching whatever was loaded first.
export default function TaxonomyPicker({ title, hint, kind, value, onChange }) {
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.frameworkVersions(kind).then((r) => {
      setVersions(r.versions || []);
      setVersion((v) => v || r.versions?.[r.versions.length - 1] || '');
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  useEffect(() => {
    if (!version) return;
    setLoading(true);
    api.frameworkCatalog(kind, version)
      .then((r) => setEntries(r.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [kind, version]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return entries
      .filter((e) => e.id.toLowerCase().includes(q) || e.name.toLowerCase().includes(q) || (e.domain || '').toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [query, entries]);

  const add = (entry) => {
    const line = `${entry.id}|${entry.token}|${version}`;
    if (value.some((v) => v.startsWith(`${entry.id}|`))) return;
    onChange([...value, line]);
  };

  const deleteSelected = () => {
    if (selected === null) return;
    onChange(value.filter((v) => v !== selected));
    setSelected(null);
  };

  return (
    <div className="field">
      <label>{title} <span className="hint">{hint}</span></label>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="field" style={{ flex: 1 }}>
          <select value={version} onChange={(e) => setVersion(e.target.value)}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: 3 }}>
          <input
            type="text"
            placeholder={loading ? 'Loading...' : `Search ${title} by id, name, or domain...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
        </div>
      </div>

      {results.length > 0 && (
        <div className="card-list" style={{ marginBottom: 8, maxHeight: 220, overflowY: 'auto' }}>
          {results.map((e, i) => (
            <button
              type="button"
              key={`${e.id}-${e.token}-${i}`}
              className="ghost"
              style={{ textAlign: 'left' }}
              onClick={() => add(e)}
            >
              <strong>{e.id}</strong> — {e.name}{e.domain ? ` (${e.domain})` : ''}
            </button>
          ))}
        </div>
      )}

      {value.length > 0 && (
        <>
          <div className="card-list">
            {value.map((line) => {
              const isSelected = selected === line;
              return (
                <div
                  key={line}
                  className="row"
                  style={{
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: isSelected ? 'var(--accent)' : 'transparent',
                    color: isSelected ? 'var(--accent-fg)' : 'inherit',
                  }}
                  onClick={() => setSelected(isSelected ? null : line)}
                >
                  <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}>{line}</span>
                </div>
              );
            })}
          </div>
          <button type="button" className="danger" style={{ marginTop: 8 }} onClick={deleteSelected} disabled={selected === null}>
            Delete selected
          </button>
        </>
      )}
    </div>
  );
}
