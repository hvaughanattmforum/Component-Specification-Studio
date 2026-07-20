import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// Editor for specifications/<dirName>/Diagrams/<ID>_<Name>_Supplement.md -
// the hand-curated tail of a component's specification (Jira references,
// further resources, administrative appendix/history/acknowledgements).
// Edited as raw markdown rather than parsed into fields: real files don't
// share one consistent section structure (numbering varies, some omit
// section 5 entirely), so a strict parser would misparse a chunk of them.
// Only meaningful once a component directory exists on disk, so this is
// hidden while creating a brand-new (not yet saved) component.
export default function SupplementStep({ dirName }) {
  const [data, setData] = useState(null); // { exists, path, content }
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { ok, error? }

  useEffect(() => {
    setData(null);
    setResult(null);
    if (!dirName) return;
    api.componentSupplement(dirName).then((d) => {
      if (d.exists) {
        setData({ ...d, justCreated: false });
        return;
      }
      // No Supplement.md yet for this component - seed it from the same
      // template a human would otherwise copy by hand for a brand-new
      // component, rather than starting from a blank file.
      api.saveComponentSupplement(dirName, SUPPLEMENT_TEMPLATE)
        .then((res) => setData({ exists: true, path: res.path, content: SUPPLEMENT_TEMPLATE, justCreated: true }))
        .catch((err) => {
          setData({ ...d, content: SUPPLEMENT_TEMPLATE });
          setResult({ ok: false, error: `Could not auto-create the Supplement file: ${err.message}` });
        });
    }).catch((err) => setResult({ ok: false, error: err.message }));
  }, [dirName]);

  if (!dirName) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Supplement</h3>
        <p className="hint">Available once this component has been saved at least once.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Supplement</h3>
        <div className="hint">Loading...</div>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await api.saveComponentSupplement(dirName, data.content);
      if (res.ok) {
        setResult({ ok: true, path: res.path });
        setData({ ...data, exists: true, path: res.path });
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
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Supplement <span className="hint">{data.path}{data.justCreated ? ' — file just created from the standard template' : ''}</span></h3>
      <p className="hint">
        Jira references, further resources, and the administrative appendix (document/release history,
        acknowledgements) - the part of the specification that's hand-maintained rather than generated
        from this component's YAML. Edited here as raw markdown since real Supplement files don't share
        one consistent section structure.
      </p>

      <div className="field">
        <textarea
          value={data.content}
          onChange={(e) => setData({ ...data, content: e.target.value })}
          style={{ minHeight: 420, fontFamily: 'ui-monospace, monospace', fontSize: '0.82rem' }}
        />
      </div>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save supplement'}</button>
        {result?.ok && <span className="hint" style={{ color: 'var(--ok)' }}>Saved.</span>}
        {result?.error && <span className="hint" style={{ color: 'var(--danger)' }}>{result.error}</span>}
      </div>
    </div>
  );
}

const SUPPLEMENT_TEMPLATE = `### 5.2. Jira References

#### 5.2.1. eTOM
- <https://projects.tmforum.org/jira/browse/XXX-000> short description of the issue

#### 5.2.3. Functional Framework
- <https://projects.tmforum.org/jira/browse/XXX-000> short description of the issue

#### 5.2.4. API
- TMFxxx - API Name: short description of the issue
  - <https://projects.tmforum.org/jira/browse/XXX-000>

### 5.3. Further resources

This component is involved in the following use cases described in <name and reference of guide>.

## 6. Administrative Appendix

### 6.1. Document History

#### 6.1.1. Version History

| Version Number | Date | Modified by | Description of changes |
|---|---|---|---|
| 1.0.0 | DD-Mon-YYYY | Author Name | Initial publication |

#### 6.1.2. Release History

| Release Status | Date Modified | Modified by | Description of changes |
|---|---|---|---|
| Pre-production | DD-Mon-YYYY | Author Name | Initial release |

### 6.2. Acknowledgements

This document was prepared by the members of the TM Forum ODA Components & Canvas team.

| Team Member | Company | Role |
|---|---|---|
| Author Name | Company | Editor |
`;
