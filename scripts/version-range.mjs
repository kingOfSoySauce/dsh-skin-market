/**
 * DSH compatibility range grammar.
 *
 * The registry build accepts the literal `unverified` marker for entries whose
 * host range is still unknown. Everything else must be a semver range in the
 * small grammar the market understands: comparator terms joined by spaces and
 * `||` alternatives.
 *
 * This lives in its own module so the registry build and the community
 * entry-update guard cannot drift apart: a range accepted by a PR must also be
 * accepted by `npm run registry:check`.
 */
const VERSION_TERM = /^(>=|<=|>|<|=|\^|~)?\s*\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

/** True for `unverified` or for a range made of supported comparator terms. */
export function isVersionRange(value) {
  if (value === 'unverified') return true
  return value.split('||').every(alternative => alternative.trim().split(/\s+/).filter(Boolean).every(term => VERSION_TERM.test(term)))
}
