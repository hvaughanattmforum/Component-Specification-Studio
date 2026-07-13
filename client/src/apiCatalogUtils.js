// Picks the catalog entry (id+version+swagger URL) matching an API row's id
// and, if given, its specification version - e.g. "4" matches catalog
// version "4.1.0". Falls back to the highest-version match.
export function matchCatalogEntry(apiCatalog, apiId, apiVersion) {
  const matches = apiCatalog.filter((a) => a.id === apiId);
  if (!matches.length) return null;
  const versionPrefix = (apiVersion || '').trim();
  if (versionPrefix) {
    const exact = matches.find((a) => a.version === versionPrefix || a.version.startsWith(`${versionPrefix}.`));
    if (exact) return exact;
  }
  return matches[matches.length - 1];
}
