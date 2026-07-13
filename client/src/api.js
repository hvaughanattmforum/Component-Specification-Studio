const BASE = '/api';

async function json(res) {
  const body = await res.json();
  if (!res.ok && !('valid' in body)) {
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return body;
}

export const api = {
  health: () => fetch(`${BASE}/health`).then(json),
  functionalBlocks: () => fetch(`${BASE}/functional-blocks`).then(json),
  apis: () => fetch(`${BASE}/apis`).then(json),
  nextId: () => fetch(`${BASE}/next-id`).then(json),
  components: () => fetch(`${BASE}/components`).then(json),
  component: (dirName) => fetch(`${BASE}/component/${encodeURIComponent(dirName)}`).then(json),
  // kind: 'etom' | 'sid' | 'functional-framework'. version omitted -> server's latest.
  frameworkCatalog: (kind, version) => fetch(`${BASE}/${kind}${version ? `?version=${encodeURIComponent(version)}` : ''}`).then(json),
  frameworkVersions: (kind) => fetch(`${BASE}/${kind}/versions`).then(json),
  apiResources: (swaggerUrl) => fetch(`${BASE}/api-resources?swagger=${encodeURIComponent(swaggerUrl)}`).then(json),
  validate: (component) => fetch(`${BASE}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ component }),
  }).then(json),
  save: (payload) => fetch(`${BASE}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then((res) => res.json().then((body) => ({ status: res.status, ...body }))),
};
