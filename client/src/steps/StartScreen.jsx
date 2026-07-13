import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function StartScreen({ onCreateNew, onEditExisting }) {
  const [components, setComponents] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.components().then((r) => setComponents(r.components)).catch((err) => setError(err.message));
  }, []);

  const load = async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.component(selected);
      onEditExisting(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>What do you want to do?</h3>

      <div className="card" style={{ marginBottom: 16 }}>
        <strong>Create a new component</strong>
        <p className="hint" style={{ margin: '4px 0 12px' }}>Start a fresh TMFCxxx specification from scratch.</p>
        <button className="primary" onClick={onCreateNew}>Create new component</button>
      </div>

      <div className="card">
        <strong>Edit an existing component</strong>
        <p className="hint" style={{ margin: '4px 0 12px' }}>Load an existing specification and change it.</p>
        <div className="row">
          <div className="field">
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              <option value="">Select a component...</option>
              {components.map((c) => (
                <option key={c.dirName} value={c.dirName}>
                  {c.id} - {c.name} ({c.version || 'no version'})
                </option>
              ))}
            </select>
          </div>
          <button onClick={load} disabled={!selected || loading}>{loading ? 'Loading...' : 'Load'}</button>
        </div>
        {error && <div className="status-banner error">{error}</div>}
      </div>
    </div>
  );
}
