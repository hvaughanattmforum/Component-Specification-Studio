import React from 'react';
import ResourcePicker from './ResourcePicker.jsx';

function ResourceRows({ resources, onChange }) {
  const update = (i, field, value) => {
    const next = resources.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...resources, { name: '', verbs: '' }]);
  const remove = (i) => onChange(resources.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>Resources <span className="hint">optional, e.g. productCatalog / GET, GET /id, POST</span></label>
      {resources.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <div className="field">
            <input type="text" placeholder="resource name" value={r.name} onChange={(e) => update(i, 'name', e.target.value)} />
          </div>
          <div className="field">
            <input type="text" placeholder="GET, GET /id, POST, PATCH, DELETE" value={r.verbs} onChange={(e) => update(i, 'verbs', e.target.value)} />
          </div>
          <button type="button" className="ghost" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={add}>+ Add resource</button>
    </div>
  );
}

export default function ApiListStep({ title, items, onChange, apiCatalog, requiredMeaning }) {
  const update = (i, field, value) => {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...items, { id: '', apiSDO: 'tmForum', required: false, version: '', name: '', resources: [] }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  const addResourceFromPicker = (i, name, verbs) => {
    const resources = items[i].resources || [];
    const existingIdx = resources.findIndex((r) => r.name === name);
    const verbsText = verbs.join(', ');
    const next = existingIdx >= 0
      ? resources.map((r, idx) => (idx === existingIdx ? { ...r, verbs: verbsText } : r))
      : [...resources, { name, verbs: verbsText }];
    update(i, 'resources', next);
  };

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <div className="card-list">
        {items.map((item, i) => (
          <div className="card" key={i}>
            <button type="button" className="card-remove ghost" onClick={() => remove(i)}>Remove</button>
            <div className="row">
              <div className="field">
                <label>API ID</label>
                <input
                  type="text"
                  list="api-catalog-options"
                  value={item.id}
                  onChange={(e) => update(i, 'id', e.target.value)}
                  placeholder="TMF620"
                />
              </div>
              <div className="field">
                <label>apiSDO</label>
                <input type="text" value={item.apiSDO} onChange={(e) => update(i, 'apiSDO', e.target.value)} />
              </div>
              <div className="field">
                <label>Specification version</label>
                <input type="text" value={item.version} onChange={(e) => update(i, 'version', e.target.value)} placeholder="5" />
              </div>
            </div>
            <div className="checkbox-row field">
              <input
                type="checkbox"
                id={`required-${title}-${i}`}
                checked={item.required}
                onChange={(e) => update(i, 'required', e.target.checked)}
              />
              <label htmlFor={`required-${title}-${i}`} style={{ marginBottom: 0 }}>{requiredMeaning}</label>
            </div>
            <ResourcePicker
              apiId={item.id}
              apiVersion={item.version}
              apiCatalog={apiCatalog}
              existingResources={item.resources}
              onAdd={(name, verbs) => addResourceFromPicker(i, name, verbs)}
            />
            <ResourceRows resources={item.resources} onChange={(v) => update(i, 'resources', v)} />
          </div>
        ))}
        <button type="button" className="ghost" onClick={add}>+ Add API</button>
      </div>
      <datalist id="api-catalog-options">
        {apiCatalog.map((a) => <option key={a.key} value={a.id}>{a.name} (v{a.version})</option>)}
      </datalist>
    </div>
  );
}
