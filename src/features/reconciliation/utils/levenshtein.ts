/**
 * Levenshtein distance — single-row DP (O(min(n,m)) memory) with early termination.
 */
export function levenshteinDistance(a: string, b: string, maxDistance?: number): number {
  if (a === b) return 0;
  let s1 = a, s2 = b;
  // Ensure s1 is the shorter string for O(min(n,m)) memory
  if (s1.length > s2.length) { const tmp = s1; s1 = s2; s2 = tmp; }
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0) return len2;
  if (len2 === 0) return len1;

  // Early termination: if length difference alone exceeds max, skip
  if (maxDistance !== undefined && (len2 - len1) > maxDistance) return len2 - len1;

  const row = new Array<number>(len1 + 1);
  for (let i = 0; i <= len1; i++) row[i] = i;

  for (let j = 1; j <= len2; j++) {
    let prev = row[0];
    row[0] = j;
    let rowMin = row[0];
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      const val = Math.min(
        row[i] + 1,        // deletion
        row[i - 1] + 1,    // insertion
        prev + cost         // substitution
      );
      prev = row[i];
      row[i] = val;
      if (val < rowMin) rowMin = val;
    }
    // Early termination: if minimum value in row exceeds maxDistance, impossible to be within threshold
    if (maxDistance !== undefined && rowMin > maxDistance) return rowMin;
  }
  return row[len1];
}

/**
 * Normalized similarity 0–1 with early termination based on threshold.
 */
export function normalizedSimilarity(a: string, b: string, threshold?: number): number {
  const ta = a.trim();
  const tb = b.trim();
  if (ta === tb) return 1;
  if (ta.length === 0 || tb.length === 0) return 0;

  const maxLen = Math.max(ta.length, tb.length);

  // Length pre-filter: if length difference alone makes similarity below threshold, skip
  if (threshold !== undefined) {
    const lenDiff = Math.abs(ta.length - tb.length);
    const bestPossible = 1 - lenDiff / maxLen;
    if (bestPossible < threshold) return bestPossible;
  }

  const maxDist = threshold !== undefined ? Math.floor(maxLen * (1 - threshold)) : undefined;
  const distance = levenshteinDistance(ta, tb, maxDist);
  return 1 - distance / maxLen;
}
