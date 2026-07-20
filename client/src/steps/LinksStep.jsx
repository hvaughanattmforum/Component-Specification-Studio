import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

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

// Constrains a YAML eTOM/YAML SID cell to entries already chosen in this
// component's eTOMs/SIDs pickers (on the Metadata tab), instead of free
// text - those are the only values that can validly appear here, so typing
// them by hand only invites typos and drift from the pickers. Picked one at
// a time (a single dropdown + Add), matching the add/remove list pattern
// used by the eTOMs/SIDs pickers themselves, rather than a multi-select
// listbox that hides its own multi-pick gesture (ctrl/cmd-click) from
// anyone who doesn't already know it. A previously-stored value that isn't
// in the current options still shows, flagged, and can be removed
// individually.
function MultiSelectField({ label, hint, options, valueString, onChange }) {
  const selected = parseMulti(valueString);
  const available = options.filter((o) => !selected.includes(o));
  const [pending, setPending] = useState('');

  const add = () => {
    if (!pending) return;
    onChange([...selected, pending].join('; '));
    setPending('');
  };
  const remove = (v) => onChange(selected.filter((s) => s !== v).join('; '));

  return (
    <div className="field">
      <label>{label} <span className="hint">{hint}</span></label>
      {available.length > 0 && (
        <div className="row" style={{ marginBottom: 6 }}>
          <select
            value={pending}
            onChange={(e) => setPending(e.target.value)}
            style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem' }}
          >
            <option value="">Choose one to add...</option>
            {available.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
          <button type="button" onClick={add} disabled={!pending}>+ Add</button>
        </div>
      )}
      {available.length === 0 && options.length > 0 && (
        <p className="hint">All entries from the form above are already added.</p>
      )}
      {options.length === 0 && (
        <p className="hint">Nothing selected on the Metadata tab yet.</p>
      )}
      {selected.length > 0 ? (
        <div className="card-list">
          {selected.map((v) => {
            const isUnmatched = !options.includes(v);
            return (
              <div key={v} className="row" style={{ alignItems: 'center' }}>
                <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', color: isUnmatched ? 'var(--danger)' : 'inherit' }}>
                  {v}{isUnmatched ? ' — not in current selection above' : ''}
                </span>
                <button type="button" className="ghost" onClick={() => remove(v)}>Remove</button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="hint">None selected.</p>
      )}
    </div>
  );
}

// Editor for specifications/<dirName>/Diagrams/<ID>_eTOM_SID_Links.md - the
// hand-transcribed table backing each component's "eTOM L2 - SID ABEs links"
// diagram. Only meaningful once a component directory exists on disk, so
// this is hidden while creating a brand-new (not yet saved) component.
export default function LinksStep({ dirName, eTOMs, SIDs }) {
  const [data, setData] = useState(null); // { exists, heading, notesBefore, notesAfter, links }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error? }
  // Which card's Save button triggered the in-flight/last save, so the
  // Saving.../Saved/error feedback shows right on that card - there's one
  // file (and one save call) for the whole component, but each card gets
  // its own visible Save button and its own feedback next to it.
  const [activeRow, setActiveRow] = useState(null);

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
      <div className="panel panel-white">
        <h3 style={{ marginTop: 0 }}>eTOM&ndash;SID links</h3>
        <p className="hint">Available once this component has been saved at least once.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel panel-white">
        <h3 style={{ marginTop: 0 }}>eTOM&ndash;SID links</h3>
        <div className="hint">Loading...</div>
      </div>
    );
  }

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

  const save = async (rowIndex) => {
    if (duplicateRows.size > 0) return;
    setActiveRow(rowIndex ?? null);
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
    <div className="panel panel-white">
      <h3 style={{ marginTop: 0 }}>eTOM&ndash;SID links <span className="hint">{data.heading}{data.justCreated ? ' — file just created' : ''}</span></h3>
      <p className="hint">These links are to ensure that the SID eTOM links diagram is drawn correctly in the specification document, and do not form part of the specification as such.</p>

      <div className="card-list">
        {data.links.map((row, i) => {
          const isDuplicate = duplicateRows.has(i);
          const isActive = activeRow === i;
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
              <MultiSelectField
                label="YAML eTOM"
                hint="from the eTOMs picker on the Metadata tab"
                options={eTOMs}
                valueString={row.yamlETOM}
                onChange={(v) => updateRow(i, 'yamlETOM', v)}
              />
              <MultiSelectField
                label="YAML SID"
                hint="from the SIDs picker on the Metadata tab"
                options={SIDs}
                valueString={row.yamlSID}
                onChange={(v) => updateRow(i, 'yamlSID', v)}
              />
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button type="button" onClick={() => save(i)} disabled={saving || duplicateRows.size > 0}>
                  {saving && isActive ? 'Saving...' : 'Save'}
                </button>
                {isActive && result?.ok && <span className="hint" style={{ color: 'var(--ok)' }}>Saved.</span>}
                {isActive && result?.error && <span className="hint" style={{ color: 'var(--danger)' }}>{result.error}</span>}
                {isDuplicate && <span className="hint" style={{ color: 'var(--danger)' }}>Resolve the duplicate pair above to save.</span>}
              </div>
            </div>
          );
        })}
        <button type="button" className="ghost" onClick={addRow}>+ Add link</button>
        {data.links.length === 0 && (
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button type="button" onClick={() => save(null)} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <span className="hint">No link rows yet.</span>
            {activeRow === null && result?.ok && <span className="hint" style={{ color: 'var(--ok)' }}>Saved.</span>}
            {activeRow === null && result?.error && <span className="hint" style={{ color: 'var(--danger)' }}>{result.error}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
