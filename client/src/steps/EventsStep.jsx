import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { matchCatalogEntry } from '../apiCatalogUtils.js';

// Published events are notifications for resources the component itself
// exposes, so the event group name has to match one of the component's own
// exposed APIs - e.g. TMF620's swagger titles itself "Product Catalog
// Management", published as event name "ProductCatalogManagement". That
// name, and the list of events available to publish, both come straight
// from the API's own swagger (info.title and its /listener/* paths) rather
// than being typed in or guessed.
function useExposedApiEvents(exposedAPIs, apiCatalog) {
  const [byId, setById] = useState({}); // { [apiId]: { name, events } }
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
          if (result.eventName) {
            setById((prev) => ({ ...prev, [id]: { name: result.eventName, events: result.events || [] } }));
          }
        })
        .catch(() => {})
        .finally(() => setLoading((prev) => ({ ...prev, [id]: false })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, apiCatalog]);

  const options = ids
    .filter((id) => byId[id])
    .map((id) => ({ id, name: byId[id].name }));
  const eventsByName = Object.fromEntries(options.map((o) => [o.name, byId[o.id].events]));
  const anyLoading = ids.some((id) => loading[id]);

  return { options, eventsByName, anyLoading };
}

function EventCheckboxes({ events, selected, onToggle }) {
  if (!events.length && !selected.length) {
    return <div className="hint">This API's swagger has no /listener event paths.</div>;
  }
  // Anything already selected but not in the fetched list (e.g. a legacy or
  // hand-typed name from before this API had a swagger match) is still shown
  // and stays checked, so editing an existing component never silently drops
  // or hides data - it's just not one of the API's currently-known events.
  const displayList = [...events, ...selected.filter((r) => !events.includes(r))];
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
      {displayList.map((ev) => (
        <label key={ev} className="checkbox-row" style={{ fontSize: '0.85rem' }}>
          <input type="checkbox" checked={selected.includes(ev)} onChange={() => onToggle(ev)} />
          {ev}
        </label>
      ))}
    </div>
  );
}

function ManualResourceRows({ resources, onChange }) {
  const set = (i, value) => {
    const next = resources.slice();
    next[i] = value;
    onChange(next);
  };
  const add = () => onChange([...resources, '']);
  const remove = (i) => onChange(resources.filter((_, idx) => idx !== i));

  return (
    <div>
      {resources.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: 4 }}>
          <input type="text" value={r} onChange={(e) => set(i, e.target.value)} placeholder="eventName" />
          <button type="button" className="ghost" onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={add}>+ Add event name manually</button>
    </div>
  );
}

function toggleIn(list, value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function EventsStep({ state, setState, apiCatalog }) {
  const { options: publishedNameOptions, eventsByName, anyLoading } = useExposedApiEvents(state.exposedAPIs, apiCatalog);

  const updatePublished = (i, field, value) => {
    const next = state.publishedEvents.slice();
    next[i] = { ...next[i], [field]: value };
    setState({ ...state, publishedEvents: next });
  };
  const addPublished = () => setState({
    ...state,
    publishedEvents: [...state.publishedEvents, {
      name: publishedNameOptions[0]?.name || '', apiType: 'openapi', resources: [],
    }],
  });
  const removePublished = (i) => setState({ ...state, publishedEvents: state.publishedEvents.filter((_, idx) => idx !== i) });

  const updateSubscribed = (i, field, value) => {
    const next = state.subscribedEvents.slice();
    next[i] = { ...next[i], [field]: value };
    setState({ ...state, subscribedEvents: next });
  };
  const addSubscribed = () => setState({
    ...state,
    subscribedEvents: [...state.subscribedEvents, {
      name: '', apiId: '', apiType: 'openapi', resources: [],
    }],
  });
  const removeSubscribed = (i) => setState({ ...state, subscribedEvents: state.subscribedEvents.filter((_, idx) => idx !== i) });

  const addDisabled = publishedNameOptions.length === 0;

  return (
    <>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Published events</h3>
        {addDisabled && !anyLoading && (
          <div className="hint" style={{ marginBottom: 10 }}>Add an exposed API first - published events can only be named after one of the component's own exposed APIs.</div>
        )}
        {addDisabled && anyLoading && (
          <div className="hint" style={{ marginBottom: 10 }}>Loading API names from swagger...</div>
        )}
        <div className="card-list">
          {state.publishedEvents.map((item, i) => {
            const events = eventsByName[item.name] || [];
            return (
              <div className="card" key={i}>
                <button type="button" className="card-remove ghost" onClick={() => removePublished(i)}>Remove</button>
                <div className="row">
                  <div className="field">
                    <label>API name</label>
                    <select value={item.name} onChange={(e) => updatePublished(i, 'name', e.target.value)}>
                      {!publishedNameOptions.some((o) => o.name === item.name) && (
                        <option value={item.name}>{item.name || '(select an exposed API)'}</option>
                      )}
                      {publishedNameOptions.map((o) => (
                        <option key={o.id} value={o.name}>{o.name} ({o.id})</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>API type</label>
                    <input type="text" value={item.apiType} onChange={(e) => updatePublished(i, 'apiType', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Available events <span className="hint">from the API's real swagger spec</span></label>
                  {anyLoading && !events.length ? (
                    <div className="hint">Loading events from swagger...</div>
                  ) : events.length ? (
                    <EventCheckboxes
                      events={events}
                      selected={item.resources}
                      onToggle={(ev) => updatePublished(i, 'resources', toggleIn(item.resources, ev))}
                    />
                  ) : (
                    <ManualResourceRows resources={item.resources} onChange={(v) => updatePublished(i, 'resources', v)} />
                  )}
                </div>
              </div>
            );
          })}
          <button type="button" className="ghost" onClick={addPublished} disabled={addDisabled}>+ Add published event</button>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Subscribed events</h3>
        <div className="card-list">
          {state.subscribedEvents.map((item, i) => (
            <SubscribedEventCard
              key={i}
              item={item}
              apiCatalog={apiCatalog}
              onChange={(field, value) => updateSubscribed(i, field, value)}
              onToggleResource={(ev) => updateSubscribed(i, 'resources', toggleIn(item.resources, ev))}
              onRemove={() => removeSubscribed(i)}
            />
          ))}
          <button type="button" className="ghost" onClick={addSubscribed}>+ Add subscribed event</button>
        </div>
      </div>
      <datalist id="event-api-catalog-options">
        {apiCatalog.map((a) => <option key={a.key} value={a.id}>{a.name} (v{a.version})</option>)}
      </datalist>
    </>
  );
}

// Subscribed events reference some other component's exposed API - there's
// no fixed list to pick from like published events have, so the user looks
// one up in the API catalog by id, and we fetch its swagger the same way
// (event name from info.title, available events from /listener/* paths).
function SubscribedEventCard({ item, apiCatalog, onChange, onToggleResource, onRemove }) {
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const match = matchCatalogEntry(apiCatalog, (item.apiId || '').trim());

  const lookup = async () => {
    if (!match) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.apiResources(match.swagger);
      setEvents(result.events || []);
      if (result.eventName && !item.name) onChange('name', result.eventName);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <button type="button" className="card-remove ghost" onClick={onRemove}>Remove</button>
      <div className="row">
        <div className="field">
          <label>API ID <span className="hint">look up in APIIndex</span></label>
          <input
            type="text"
            list="event-api-catalog-options"
            value={item.apiId}
            onChange={(e) => { onChange('apiId', e.target.value); setEvents(null); }}
            placeholder="TMF633"
          />
        </div>
        <div className="field">
          <label>API name</label>
          <input type="text" value={item.name} onChange={(e) => onChange('name', e.target.value)} placeholder="ServiceCatalogManagement" />
        </div>
        <div className="field">
          <label>API type</label>
          <input type="text" value={item.apiType} onChange={(e) => onChange('apiType', e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label>Available events <span className="hint">from the API's real swagger spec</span></label>
        {!match && <div className="hint">No catalog entry found for {item.apiId || '(no id entered)'} - add event names manually below.</div>}
        {match && !events && (
          <button type="button" onClick={lookup} disabled={loading}>
            {loading ? 'Loading spec...' : `Load events from ${match.id} v${match.version} spec`}
          </button>
        )}
        {error && <div className="status-banner error" style={{ marginTop: 8 }}>{error}</div>}
        {events && (
          <EventCheckboxes events={events} selected={item.resources} onToggle={onToggleResource} />
        )}
        {!match && (
          <ManualResourceRows resources={item.resources} onChange={(v) => onChange('resources', v)} />
        )}
      </div>
    </div>
  );
}
