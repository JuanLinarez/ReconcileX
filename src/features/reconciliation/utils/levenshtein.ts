/**
 * Levenshtein (edit) distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions)
 * needed to change one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const matrix: number[][] = Array.from({ length: lenA + 1 }, () =>
    Array.from({ length: lenB + 1 }, () => 0)
  );

  for (let i = 0; i <= lenA; i++) matrix[i][0] = i;
  for (let j = 0; j <= lenB; j++) matrix[0][j] = j;

  for (let i = 1; i <= lenA; i++) {
    for (let j = 1; j <= lenB; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[lenA][lenB];
}

/**
 * Normalized similarity score 0–1 based on Levenshtein distance.
 * 1 = identical, 0 = completely different.
 * Uses (1 - distance / maxLength) so that longer strings allow more edits for the same score.
 */
export function normalizedSimilarity(a: string, b: string): number {
  const trimmedA = a.trim();
  const trimmedB = b.trim();
  if (trimmedA === trimmedB) return 1;
  if (trimmedA.length === 0 || trimmedB.length === 0) return 0;
  const distance = levenshteinDistance(trimmedA, trimmedB);
  const maxLen = Math.max(trimmedA.length, trimmedB.length);
  return 1 - distance / maxLen;
}
