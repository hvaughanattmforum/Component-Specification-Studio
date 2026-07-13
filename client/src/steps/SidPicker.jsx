import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

function toToken(text) {
  return (text || '').trim().replace(/\s+/g, '_');
}

// SID (Information Framework) reference picker: cascading Domain -> ABE ->
// optional third segment (a nested sub-ABE or a Business Entity, both of
// which appear as the third pipe segment in real specs), formatted into
// "domainToken|abeToken|[childToken|]version" lines. Owns its own version
// selection and catalog fetch, so switching versions browses that release's
// domain/ABE structure instead of always whatever loaded first.
export default function SidPicker({ value, onChange }) {
  const [versions, setVersions] = useState([]);
  const [version, setVersion] = useState('');
  const [catalog, setCatalog] = useState({ domains: [], abesByDomain: {}, besByDomainAbe: {} });
  const [loading, setLoading] = useState(false);
  const [domain, setDomain] = useState('');
  const [abe, setAbe] = useState('');
  const [childKey, setChildKey] = useState('');
  const [customChild, setCustomChild] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.frameworkVersions('sid').then((r) => {
      setVersions(r.versions || []);
      setVersion((v) => v || r.versions?.[r.versions.length - 1] || '');
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!version) return;
    setLoading(true);
    api.frameworkCatalog('sid', version)
      .then((r) => setCatalog(r))
      .catch(() => setCatalog({ domains: [], abesByDomain: {}, besByDomainAbe: {} }))
      .finally(() => setLoading(false));
  }, [version]);

  const abeOptions = domain ? (catalog.abesByDomain[domain] || []) : [];
  const children = useMemo(() => {
    if (!domain || !abe) return [];
    return catalog.besByDomainAbe[`${domain}||${abe}`] || [];
  }, [catalog, domain, abe]);

  const add = () => {
    if (!domain || !abe) return;
    const domainToken = toToken(domain);
    const abeToken = toToken(abe);
    let childToken = '';
    if (customChild.trim()) {
      childToken = toToken(customChild);
    } else if (childKey) {
      const child = children.find((c) => `${c.kind}:${c.name}` === childKey);
      if (child) childToken = child.kind === 'BE' ? `${child.name}_BE` : toToken(child.name);
    }
    const line = childToken
      ? `${domainToken}|${abeToken}|${childToken}|${version}`
      : `${domainToken}|${abeToken}|${version}`;
    if (!value.includes(line)) onChange([...value, line]);
    setChildKey('');
    setCustomChild('');
  };

  const deleteSelected = () => {
    if (selected === null) return;
    onChange(value.filter((v) => v !== selected));
    setSelected(null);
  };

  return (
    <div className="field">
      <label>SIDs <span className="hint">Information Framework: Domain / ABE / optional Business Entity or sub-ABE</span></label>

      <div className="row" style={{ marginBottom: 8 }}>
        <div className="field" style={{ flex: 0.6 }}>
          <select value={version} onChange={(e) => { setVersion(e.target.value); setDomain(''); setAbe(''); setChildKey(''); }}>
            {versions.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field">
          <select value={domain} onChange={(e) => { setDomain(e.target.value); setAbe(''); setChildKey(''); }} disabled={loading}>
            <option value="">Domain...</option>
            {catalog.domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="field">
          <select value={abe} onChange={(e) => { setAbe(e.target.value); setChildKey(''); }} disabled={!domain}>
            <option value="">ABE...</option>
            {abeOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 8 }}>
        <div className="field">
          <select value={childKey} onChange={(e) => setChildKey(e.target.value)} disabled={!abe || !!customChild}>
            <option value="">(no third segment)</option>
            {children.map((c) => (
              <option key={`${c.kind}:${c.name}`} value={`${c.kind}:${c.name}`}>
                {c.name} ({c.kind === 'BE' ? 'Business Entity' : 'sub-ABE'})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <input
            type="text"
            placeholder="...or type a custom third segment"
            value={customChild}
            onChange={(e) => setCustomChild(e.target.value)}
          />
        </div>
        <button type="button" onClick={add} disabled={!domain || !abe}>+ Add</button>
      </div>

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
