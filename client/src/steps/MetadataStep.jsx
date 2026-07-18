import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import TaxonomyPicker from './TaxonomyPicker.jsx';
import SidPicker from './SidPicker.jsx';

const DIRECTIONS = ['bidirectional', 'activity consumes', 'activity produces'];
const BLANK_LINK = { etomActivity: '', sidABE: '', direction: 'bidirectional', yamlETOM: '', yamlSID: '' };

// The YAML eTOM/YAML SID cells can reference more than one entry (e.g. a
// link driven by two related eTOM activities), joined with "; " in the
// stored markdown - see TMFC005's "Loyalty Program Management / Loyalty
// Program Operation" row for a real example.
function parseMulti(str) {
  return (str || '').split(';').map((s) => s.trim()).filter(Boolean);
}

// The eTOM/SID pair a row actually connects - order-independent (picking
// the same two eTOMs in a different order is still the same relationship)
// and only meaningful once both sides are chosen, so a fresh blank row
// isn't flagged as a duplicate of every other blank row.
function pairKey(row) {
  const etom = parseMulti(row.yamlETOM).slice().sort().join(';');
  const sid = parseMulti(row.yamlSID).slice().sort().join(';');
  if (!etom || !sid) return null;
  return `${etom}||${sid}`;
}

// Constrains a YAML eTOM/YAML SID cell to a multi-select of exactly the
// entries already chosen in this component's eTOMs/SIDs pickers above,
// instead of free text - those are the only values that can validly appear
// here, so typing them by hand only invites typos and drift from the
// pickers. Any previously-stored value that isn't in that list still shows
// (as a warning) rather than silently vanishing, but is dropped the next
// time this specific field is changed, since at that point the multi-select
// becomes the source of truth for it.
function MultiSelectField({ label, hint, options, valueString, onChange }) {
  const selected = parseMulti(valueString);
  const unmatched = selected.filter((v) => !options.includes(v));

  return (
    <div className="field">
      <label>{label} <span className="hint">{hint}</span></label>
      {options.length === 0 ? (
        <p className="hint">Nothing selected in the form above yet.</p>
      ) : (
        <>
          <select
            multiple
            size={Math.max(2, Math.min(5, options.length))}
            value={selected}
            onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value).join('; '))}
            style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
          >
            {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <p className="hint">Ctrl/Cmd-click to select more than one.</p>
        </>
      )}
      {unmatched.length > 0 && (
        <p className="hint" style={{ color: 'var(--danger)' }}>
          Not in the current selection above (will be dropped if this field is changed): {unmatched.join('; ')}
        </p>
      )}
    </div>
  );
}

// Editor for specifications/<dirName>/Diagrams/<ID>_eTOM_SID_Links.md - the
// hand-transcribed table backing each component's "eTOM L2 - SID ABEs links"
// diagram. Only meaningful once a component directory exists on disk, so
// this is hidden while creating a brand-new (not yet saved) component.
function LinksEditor({ dirName, eTOMs, SIDs }) {
  const [data, setData] = useState(null); // { exists, heading, notesBefore, notesAfter, links }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error? }

  useEffect(() => {
    setData(null);
    setResult(null);
    if (!dirName) return;
    api.componentLinks(dirName).then((d) => {
      if (d.exists) {
        setData({ ...d, justCreated: false });
        return;
      }
      // No links file yet for this component - create an empty one on disk
      // right away instead of only writing one the first time "Save links"
      // is clicked, so every component that's been opened here has a file
      // in its Diagrams/ folder ready to fill in (or leave empty).
      api.saveComponentLinks(dirName, { heading: d.heading, notesBefore: '', notesAfter: '', links: [] })
        .then(() => setData({ ...d, exists: true, justCreated: true }))
        .catch((err) => {
          setData(d);
          setResult({ ok: false, error: `Could not auto-create the links file: ${err.message}` });
        });
    }).catch((err) => setResult({ ok: false, error: err.message }));
  }, [dirName]);

  if (!dirName) {
    return (
      <div className="field">
        <label>eTOM&ndash;SID links</label>
        <p className="hint">Available once this component has been saved at least once.</p>
      </div>
    );
  }

  if (!data) return <div className="field"><label>eTOM&ndash;SID links</label><div className="hint">Loading...</div></div>;

  const updateRow = (i, field, value) => {
    const links = data.links.slice();
    links[i] = { ...links[i], [field]: value };
    setData({ ...data, links });
  };
  const addRow = () => setData({ ...data, links: [...data.links, { ...BLANK_LINK }] });
  const removeRow = (i) => setData({ ...data, links: data.links.filter((_, idx) => idx !== i) });

  const pairKeys = data.links.map(pairKey);
  const duplicateRows = new Set();
  pairKeys.forEach((k, i) => {
    if (k === null) return;
    const firstIdx = pairKeys.indexOf(k);
    if (firstIdx !== i) { duplicateRows.add(i); duplicateRows.add(firstIdx); }
  });

  const save = async () => {
    if (duplicateRows.size > 0) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await api.saveComponentLinks(dirName, {
        heading: data.heading,
        notesBefore: data.notesBefore,
        notesAfter: data.notesAfter,
        links: data.links,
      });
      if (res.ok) {
        setResult({ ok: true, path: res.path });
        setData({ ...data, exists: true });
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
      <label>eTOM&ndash;SID links <span className="hint">{data.heading}{data.justCreated ? ' — file just created' : ''}</span></label>

      <div className="field">
        <label>Notes (before table) <span className="hint">optional</span></label>
        <textarea
          value={data.notesBefore}
          onChange={(e) => setData({ ...data, notesBefore: e.target.value })}
          placeholder="e.g. Source: transcribed from the original PDF's eTOM L2 - SID ABEs links diagram..."
        />
      </div>

      <div className="card-list">
        {data.links.map((row, i) => {
          const isDuplicate = duplicateRows.has(i);
          return (
            <div className="card" key={i} style={isDuplicate ? { borderColor: 'var(--danger)' } : undefined}>
              <button type="button" className="card-remove ghost" onClick={() => removeRow(i)}>Remove</button>
              {isDuplicate && (
                <p className="hint" style={{ color: 'var(--danger)' }}>
                  This eTOM/SID pair is already captured by another row - each relationship should appear once.
                </p>
              )}
              <div className="row">
                <div className="field">
                  <label>eTOM diagram display Label</label>
                  <input type="text" value={row.etomActivity} onChange={(e) => updateRow(i, 'etomActivity', e.target.value)} />
                </div>
                <div className="field">
                  <label>SID diagram display label</label>
                  <input type="text" value={row.sidABE} onChange={(e) => updateRow(i, 'sidABE', e.target.value)} />
                </div>
                <div className="field">
                  <label>Direction</label>
                  <select value={row.direction} onChange={(e) => updateRow(i, 'direction', e.target.value)}>
                    {DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="row">
                <MultiSelectField
                  label="YAML eTOM"
                  hint="from the eTOMs picker above"
                  options={eTOMs}
                  valueString={row.yamlETOM}
                  onChange={(v) => updateRow(i, 'yamlETOM', v)}
                />
                <MultiSelectField
                  label="YAML SID"
                  hint="from the SIDs picker above"
                  options={SIDs}
                  valueString={row.yamlSID}
                  onChange={(v) => updateRow(i, 'yamlSID', v)}
                />
              </div>
            </div>
          );
        })}
        <button type="button" className="ghost" onClick={addRow}>+ Add link</button>
      </div>

      <div className="field">
        <label>Notes (after table) <span className="hint">optional</span></label>
        <textarea
          value={data.notesAfter}
          onChange={(e) => setData({ ...data, notesAfter: e.target.value })}
          placeholder="e.g. caveats about how the diagram should render these links..."
        />
      </div>

      <div style={{ marginTop: 10 }}>
        <button type="button" onClick={save} disabled={saving || duplicateRows.size > 0}>{saving ? 'Saving...' : 'Save links'}</button>
      </div>
      {duplicateRows.size > 0 && (
        <div className="hint" style={{ marginTop: 6, color: 'var(--danger)' }}>
          Resolve the duplicate eTOM/SID pair(s) highlighted above before saving.
        </div>
      )}
      {result?.ok && <div className="hint" style={{ marginTop: 6, color: 'var(--ok)' }}>Saved to {result.path}.</div>}
      {result?.error && <div className="hint" style={{ marginTop: 6, color: 'var(--danger)' }}>{result.error}</div>}
    </div>
  );
}

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

export default function MetadataStep({ state, setState, functionalBlocks, locked, dirName }) {
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
          <label>Status</label>
          <select value={state.status} onChange={set('status')}>
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

      <LinksEditor dirName={dirName} eTOMs={state.eTOMs} SIDs={state.SIDs} />
    </div>
  );
}
