// These services reuse existing tags' ASCII casing. Compare that identity only
// during save verification; remote conflict fingerprints remain byte-exact.
export function equivalentTags(actual, intended) {
  const folded = tags => Array.isArray(tags) && tags.every(tag => typeof tag === 'string')
    ? tags.map(tag => tag.replace(/[A-Z]/g, c => c.toLowerCase())).sort() : null;
  const a = folded(actual), b = folded(intended);
  return !!a && !!b && new Set(a).size === a.length && new Set(b).size === b.length
    && JSON.stringify(a) === JSON.stringify(b);
}
