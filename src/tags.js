// These services reuse existing tags' ASCII casing. Reject ambiguous identities
// before sending and compare them on save; remote conflict fingerprints stay exact.
const folded = tags => Array.isArray(tags) && tags.every(tag => typeof tag === 'string')
  ? tags.map(tag => tag.replace(/[A-Z]/g, c => c.toLowerCase())).sort() : null;
export function distinctTagIdentities(tags) {
  const identities = folded(tags);
  return !!identities && new Set(identities).size === identities.length;
}
export function equivalentTags(actual, intended) {
  const a = folded(actual), b = folded(intended);
  return !!a && !!b && new Set(a).size === a.length && new Set(b).size === b.length
    && JSON.stringify(a) === JSON.stringify(b);
}
