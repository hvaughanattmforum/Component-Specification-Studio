// Reverse of buildComponent: turns a raw parsed component YAML object into
// wizard state, prefilling the form for editing. Each API/event entry keeps
// a `raw` copy of itself so buildComponent can merge form edits back over
// fields the UI doesn't expose, instead of dropping them.

function resourcesFromSpecEntry(specEntry) {
  const resources = specEntry?.resources;
  if (!Array.isArray(resources)) return [];
  return resources.map((r) => {
    const [name, verbs] = Object.entries(r)[0] || ['', []];
    return { name, verbs: Array.isArray(verbs) ? verbs.join(', ') : '' };
  });
}

function parseApiEntry(entry) {
  const firstSpec = Array.isArray(entry.specification) ? entry.specification[0] : null;
  return {
    id: entry.id || '',
    apiSDO: entry.apiSDO || '',
    required: !!entry.required,
    name: entry.name || '',
    version: firstSpec?.version !== undefined ? String(firstSpec.version) : '',
    resources: resourcesFromSpecEntry(firstSpec),
    raw: entry,
  };
}

function parseEventEntry(entry, kind) {
  return {
    name: entry.name || '',
    apiId: '',
    hub: kind === 'published' ? (entry.hub || '') : '',
    callback: kind === 'subscribed' ? (entry['call-back'] || '') : '',
    implementation: entry.implementation || '',
    port: entry.port || '',
    specification: entry.specification || '',
    apiType: entry.apiType || '',
    resources: Array.isArray(entry.resources) ? entry.resources : [],
    raw: entry,
  };
}

export function stateFromComponent(component) {
  const meta = component?.spec?.componentMetadata || {};
  const core = component?.spec?.coreFunction || {};

  return {
    id: meta.id || '',
    name: meta.name || '',
    description: meta.description || '',
    version: meta.version || '',
    status: meta.status || 'roadmap',
    publicationDate: meta.publicationDate || '',
    functionalBlock: meta.functionalBlock || '',
    owners: (meta.owners || []).map((o) => ({ name: o.name || '', email: o.email || '', url: o.url || '' })),
    maintainers: (meta.maintainers || []).map((m) => ({ name: m.name || '', email: m.email || '', url: m.url || '' })),
    eTOMs: meta.eTOMs || [],
    functionalFrameworkFunctions: meta.functionalFrameworkFunctions || [],
    SIDs: meta.SIDs || [],
    exposedAPIs: (core.exposedAPIs || []).map(parseApiEntry),
    dependentAPIs: (core.dependentAPIs || []).map(parseApiEntry),
    publishedEvents: (core.publishedEvents || []).map((e) => parseEventEntry(e, 'published')),
    subscribedEvents: (core.subscribedEvents || []).map((e) => parseEventEntry(e, 'subscribed')),
  };
}
