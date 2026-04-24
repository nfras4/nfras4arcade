/**
 * validate-hint.ts
 * Pure-function rubric validator for Impostor word-game hints.
 * No imports from the rest of the codebase. Zero side effects.
 */

export type RubricFailure = {
  rule: 'word-leak' | 'word-count' | 'near-duplicate' | 'empty-placeholder';
  detail: string;
};

export interface ValidateHintResult {
  pass: boolean;
  failures: RubricFailure[];
}

export interface ValidatorConfig {
  maxWordCount?: number;  // default 8
  dupThreshold?: number;  // default 0.8
}

// ---------------------------------------------------------------------------
// Levenshtein distance (standard DP, O(m*n))
// ---------------------------------------------------------------------------
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // Build a (m+1) x (n+1) matrix
  const dp: number[][] = [];
  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
    for (let j = 1; j <= n; j++) {
      if (i === 0) {
        dp[i][j] = j;
      } else {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + cost // substitution
        );
      }
    }
  }
  return dp[m][n];
}

/**
 * Normalized Levenshtein similarity: 1 - (distance / max(a.len, b.len)).
 * Returns 1.0 for identical strings, 0.0 for maximally different.
 * Exported for testing convenience.
 */
export function normalizedLevenshtein(a: string, b: string): number {
  if (a === b) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

// ---------------------------------------------------------------------------
// Suffix stripping (intentionally naive, handles common English suffixes)
// ---------------------------------------------------------------------------
const SUFFIXES = [
  'nesses', 'ments', 'tions', 'ables', 'ibles', 'ness', 'ment',
  'tion', 'able', 'ible', 'ings', 'ers', 'ing', 'ous', 'ful',
  'less', 'est', 'ies', 'ied', 'ier', 'ily', 'ly', 'es', 'ed',
  'er', 's',
];

function stripSuffix(word: string): string {
  const lower = word.toLowerCase();
  for (const suffix of SUFFIXES) {
    if (lower.endsWith(suffix) && lower.length - suffix.length >= 3) {
      return lower.slice(0, lower.length - suffix.length);
    }
  }
  return lower;
}

/**
 * Returns all stem variants of a word (the word itself + suffix-stripped form).
 * Deduplicates automatically.
 */
function stems(word: string): Set<string> {
  const lower = word.toLowerCase();
  const stripped = stripSuffix(lower);
  return new Set([lower, stripped]);
}

// Stop words excluded from multi-word compound checks
const STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'in', 'on', 'at', 'to', 'for', 'is', 'it']);

// Known placeholder markers
const PLACEHOLDER_PATTERNS = /^(todo|tbd|placeholder|\.\.\.|[?]{2,})$/i;

// Tokenize: split on whitespace and punctuation, drop empty tokens
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\p{P}]+/u)
    .filter(t => t.length > 0);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Validate a single hint against the rubric.
 *
 * siblings contract: pass the full entry.hints array (including the hint
 * being validated). The validator filters the current hint internally by
 * reference identity AND normalized string equality before running the
 * near-duplicate check.
 */
export function validateHint(
  hint: string,
  word: string,
  siblings: string[],
  config?: ValidatorConfig
): ValidateHintResult {
  const maxWordCount = config?.maxWordCount ?? 8;
  const dupThreshold = config?.dupThreshold ?? 0.8;
  const failures: RubricFailure[] = [];

  // 1. Empty / placeholder check
  const trimmed = hint.trim();
  if (trimmed === '' || PLACEHOLDER_PATTERNS.test(trimmed)) {
    failures.push({
      rule: 'empty-placeholder',
      detail: trimmed === '' ? 'hint is empty' : `hint matches placeholder pattern: "${trimmed}"`,
    });
    // No point running further checks on empty/placeholder hints
    return { pass: false, failures };
  }

  // 2. Word-leak check
  // Build the full set of stems to check against
  const wordParts = word.split(/\s+/).filter(w => !STOP_WORDS.has(w.toLowerCase()));
  const wordStemSet = new Set<string>();
  for (const part of wordParts) {
    for (const s of stems(part)) {
      wordStemSet.add(s);
    }
  }

  // Also stem each token in the hint and compare
  const hintTokens = tokenize(hint);
  for (const token of hintTokens) {
    for (const s of stems(token)) {
      if (wordStemSet.has(s) && s.length >= 3) {
        failures.push({
          rule: 'word-leak',
          detail: `hint token "${token}" (stem "${s}") matches word "${word}"`,
        });
        break; // one failure per token is enough
      }
    }
    // Only report first matching token to keep failures concise
    if (failures.some(f => f.rule === 'word-leak')) break;
  }

  // 3. Word-count check
  const wordCount = hint.trim().split(/\s+/).length;
  if (wordCount > maxWordCount) {
    failures.push({
      rule: 'word-count',
      detail: `hint has ${wordCount} words, max is ${maxWordCount}`,
    });
  }

  // 4. Near-duplicate check
  const normalizedHint = hint.toLowerCase().trim().replace(/\s+/g, ' ');
  // Filter siblings: exclude the hint itself by reference identity AND normalized string equality
  const otherSiblings = siblings.filter(
    s => s !== hint && s.toLowerCase().trim().replace(/\s+/g, ' ') !== normalizedHint
  );
  for (const sibling of otherSiblings) {
    const normalizedSibling = sibling.toLowerCase().trim().replace(/\s+/g, ' ');
    const similarity = normalizedLevenshtein(normalizedHint, normalizedSibling);
    if (similarity >= dupThreshold) {
      failures.push({
        rule: 'near-duplicate',
        detail: `similarity ${similarity.toFixed(2)} >= ${dupThreshold} with sibling: "${sibling}"`,
      });
      break; // report first duplicate found
    }
  }

  return { pass: failures.length === 0, failures };
}
