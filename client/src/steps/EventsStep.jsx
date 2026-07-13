import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { matchCatalogEntry } from '../apiCatalogUtils.js';

// Published events are notifications for resources the component itself
// exposes, so the event group name has to match one of the component's own
// exposed APIs - e.g. TMF620's swagger titles itself "Product Catalog
// Management", published as event name "ProductCatalogManagement". That
// name comes straight from the API's swagger (info.title), not a guess.
function useExposedApiEventNames(exposedAPIs, apiCatalog) {
  const [names, setNames] = useState({}); // { [apiId]: eventName }
  const [loading, setLoading] = useState({}); // { [apiId]: true }
  const fetched = useRef(new Set());

  const ids = [...new Set(exposedAPIs.map((a) => (a.id || '').trim()).filter(Boolean))];
  const key = ids.join(',');

  useEffect(() => {
    ids.forEach((id) => {
      if (fetched.current.has(id)) return;
      const api_ = exposedAPIs.find((a) => (a.id || '').trim() === id);
      const match = matchCatalogEntry(apiCatalog, id, api_?.version);
      if (!match) return;
      fetched.current.add(id);
      setLoading((prev) => ({ ...prev, [id]: true }));
      api.apiResources(match.swagger)
        .then((result) => {
          if (result.eventName) setNames((prev) => ({ ...prev, [id]: result.eventName }));
        })
        .catch(() => {})
        .finally(() => setLoading((prev) => ({ ...prev, [id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, apiCatalog]);

  const options = ids
    .filter((id) => names[id])
    .map((id) => ({ id, name: names[id] }));
  const anyLoading = ids.some((id) => loading[id]);

  return { options, anyLoading };
}

function EventList({ title, kind, items, onChange, nameOptions, namePlaceholder, loadingNames }) {
  const update = (i, field, value) => {
    const next = items.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  };
  const add = () => onChange([...items, {
    name: nameOptions ? (nameOptions[0]?.name || '') : '', hub: '', callback: '', implementation: '', port: '', specification: '', apiType: 'openapi', resourcesText: '',
  }]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));

  const addDisabled = !!nameOptions && nameOptions.length === 0;

  return (
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {addDisabled && !loadingNames && (
        <div className="hint" style={{ marginBottom: 10 }}>Add an exposed API first - published events can only be named after one of the component's own exposed APIs.</div>
      )}
      {addDisabled && loadingNames && (
        <div className="hint" style={{ marginBottom: 10 }}>Loading API names from swagger...</div>
      )}
      <div className="card-list">
        {items.map((item, i) => (
          <div className="card" key={i}>
            <button type="button" className="card-remove ghost" onClick={() => remove(i)}>Remove</button>
            <div className="row">
              <div className="field">
                <label>API name</label>
                {nameOptions ? (
                  <select value={item.name} onChange={(e) => update(i, 'name', e.target.value)}>
                    {!nameOptions.some((o) => o.name === item.name) && (
                      <option value={item.name}>{item.name || '(select an exposed API)'}</option>
                    )}
                    {nameOptions.map((o) => (
                      <option key={o.id} value={o.name}>{o.name} ({o.id})</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" value={item.name} onChange={(e) => update(i, 'name', e.target.value)} placeholder={namePlaceholder} />
                )}
              </div>
              <div className="field">
                <label>API type</label>
                <input type="text" value={item.apiType} onChange={(e) => update(i, 'apiType', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Resource event names <span className="hint">optional, one per line</span></label>
              <textarea value={item.resourcesText} onChange={(e) => update(i, 'resourcesText', e.target.value)} />
            </div>
          </div>
        ))}
        <button type="button" className="ghost" onClick={add} disabled={addDisabled}>+ Add {kind} event</button>
      </div>
    </div>
  );
}

export default function EventsStep({ state, setState, apiCatalog }) {
  const { options: publishedNameOptions, anyLoading } = useExposedApiEventNames(state.exposedAPIs, apiCatalog);

  return (
    <>
      <EventList
        title="Published events"
        kind="published"
        items={state.publishedEvents}
        onChange={(v) => setState({ ...state, publishedEvents: v })}
        nameOptions={publishedNameOptions}
        loadingNames={anyLoading}
      />
      <EventList
        title="Subscribed events"
        kind="subscribed"
        items={state.subscribedEvents}
        onChange={(v) => setState({ ...state, subscribedEvents: v })}
        namePlaceholder="ServiceCatalogManagement"
      />
    </>
  );
}
