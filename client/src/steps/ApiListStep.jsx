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

// One card per declared specification version. Each version manages its own
// resources independently - the same API can expose a different resource
// shape release to release (e.g. TMF620 v5's "productCatalog" was called
// "catalog" in v4), so resources picked for one version must never bleed
// into another.
function SpecVersionCard({ apiId, spec, onChange, onRemove, apiCatalog, removable }) {
  const addResourceFromPicker = (name, verbs) => {
    const resources = spec.resources || [];
    const existingIdx = resources.findIndex((r) => r.name === name);
    const verbsText = verbs.join(', ');
    const next = existingIdx >= 0
      ? resources.map((r, idx) => (idx === existingIdx ? { ...r, verbs: verbsText } : r))
      : [...resources, { name, verbs: verbsText }];
    onChange('resources', next);
  };

  return (
    <div className="card" style={{ background: 'var(--panel-alt, rgba(255,255,255,0.03))' }}>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="field">
          <label>Version</label>
          <input type="text" value={spec.version} onChange={(e) => onChange('version', e.target.value)} placeholder="5" />
        </div>
        {removable && <button type="button" className="ghost" onClick={onRemove}>Remove version</button>}
      </div>
      <ResourcePicker
        apiId={apiId}
        apiVersion={spec.version}
        apiCatalog={apiCatalog}
        existingResources={spec.resources}
        onAdd={addResourceFromPicker}
      />
      <ResourceRows resources={spec.resources} onChange={(v) => onChange('resources', v)} />
    </div>
  );
}

export default function ApiListStep({ title, items, onChange, apiCatalog, requiredMeaning }) {
  const update = (i, field, value) => {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...items, {
    id: '', apiSDO: 'tmForum', required: false, name: '', specifications: [{ version: '', resources: [], raw: {} }],
  }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  const updateSpec = (i, specIdx, field, value) => {
    const specs = items[i].specifications.slice();
    specs[specIdx] = { ...specs[specIdx], [field]: value };
    update(i, 'specifications', specs);
  };
  const addSpec = (i) => update(i, 'specifications', [...items[i].specifications, { version: '', resources: [], raw: {} }]);
  const removeSpec = (i, specIdx) => update(i, 'specifications', items[i].specifications.filter((_, idx) => idx !== specIdx));

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

            <div className="field">
              <label>Specification versions <span className="hint">each version's resources are managed separately</span></label>
              <div className="card-list">
                {item.specifications.map((spec, specIdx) => (
                  <SpecVersionCard
                    key={specIdx}
                    apiId={item.id}
                    spec={spec}
                    onChange={(field, value) => updateSpec(i, specIdx, field, value)}
                    onRemove={() => removeSpec(i, specIdx)}
                    apiCatalog={apiCatalog}
                    removable={item.specifications.length > 1}
                  />
                ))}
              </div>
              <button type="button" className="ghost" onClick={() => addSpec(i)}>+ Add specification version</button>
            </div>
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
