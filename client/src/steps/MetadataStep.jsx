import React from 'react';
import TaxonomyPicker from './TaxonomyPicker.jsx';
import SidPicker from './SidPicker.jsx';

function ContactList({ label, items, onChange }) {
  const update = (i, field, value) => {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...items, { name: '', email: '', url: '' }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>{label} <span className="hint">optional</span></label>
      <div className="card-list">
        {items.map((item, i) => (
          <div className="card" key={i}>
            <button type="button" className="card-remove ghost" onClick={() => remove(i)}>Remove</button>
            <div className="row">
              <div className="field">
                <label>Name</label>
                <input type="text" value={item.name} onChange={(e) => update(i, 'name', e.target.value)} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="text" value={item.email} onChange={(e) => update(i, 'email', e.target.value)} />
              </div>
              <div className="field">
                <label>URL</label>
                <input type="text" value={item.url} onChange={(e) => update(i, 'url', e.target.value)} />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="ghost" onClick={add}>+ Add {label.slice(0, -1)}</button>
      </div>
    </div>
  );
}

export default function MetadataStep({ state, setState, functionalBlocks, locked }) {
  const set = (field) => (e) => setState({ ...state, [field]: e.target.value });

  return (
    <div className="panel">
      <div className="row">
        <div className="field">
          <label>Component ID <span className="hint">TMFCxxx{locked ? ' — locked while editing' : ''}</span></label>
          <input type="text" value={state.id} onChange={set('id')} placeholder="TMFC042" disabled={locked} />
        </div>
        <div className="field">
          <label>Name{locked ? <span className="hint">locked while editing</span> : null}</label>
          <input type="text" value={state.name} onChange={set('name')} placeholder="MyNewComponent" disabled={locked} />
        </div>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea value={state.description} onChange={set('description')} placeholder="What this component is responsible for..." />
      </div>

      <div className="row">
        <div className="field">
          <label>Version</label>
          <input type="text" value={state.version} onChange={set('version')} placeholder="1.0.0" />
        </div>
        <div className="field">
          <label>Status <span className="hint">not editable</span></label>
          <select value={state.status} disabled>
            <option value="roadmap">roadmap</option>
            <option value="preview">preview</option>
            <option value="production">production</option>
          </select>
        </div>
        <div className="field">
          <label>Publication date</label>
          <input type="date" value={state.publicationDate} onChange={set('publicationDate')} />
        </div>
      </div>

      <div className="field">
        <label>Functional block</label>
        <input
          type="text"
          list="functional-block-options"
          value={state.functionalBlock}
          onChange={set('functionalBlock')}
          placeholder="e.g. CoreCommerce"
        />
        <datalist id="functional-block-options">
          {functionalBlocks.map((fb) => <option key={fb} value={fb} />)}
        </datalist>
      </div>

      <ContactList label="Owners" items={state.owners} onChange={(v) => setState({ ...state, owners: v })} />
      <ContactList label="Maintainers" items={state.maintainers} onChange={(v) => setState({ ...state, maintainers: v })} />

      <TaxonomyPicker
        title="eTOMs"
        hint="Business Process Framework"
        kind="etom"
        value={state.eTOMs}
        onChange={(v) => setState({ ...state, eTOMs: v })}
      />
      <TaxonomyPicker
        title="Functional Framework Functions"
        hint="Functional Framework"
        kind="functional-framework"
        value={state.functionalFrameworkFunctions}
        onChange={(v) => setState({ ...state, functionalFrameworkFunctions: v })}
      />
      <SidPicker
        value={state.SIDs}
        onChange={(v) => setState({ ...state, SIDs: v })}
      />
    </div>
  );
}
