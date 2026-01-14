/**
 * Hash-based text similarity for contrastive pair mining.
 *
 * Uses a locality-sensitive hashing approach:
 * 1. Tokenize text into words
 * 2. Hash each token with FNV-1a
 * 3. Accumulate into a fixed-dimension vector (signed hashing trick)
 * 4. Compute cosine similarity between vectors
 *
 * This is fast, works offline, and is sufficient for detecting
 * "near neighbors" in story pack outputs.
 */

// ─────────────────────────────────────────────────
// Tokenization
// ─────────────────────────────────────────────────

/**
 * Simple tokenizer that:
 * - Lowercases text
 * - Removes punctuation
 * - Splits on whitespace
 * - Filters tokens shorter than 3 chars
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Keep letters, numbers, and Cyrillic (for potential multilingual support)
    .replace(/[^a-z0-9а-яё\s-]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

// ─────────────────────────────────────────────────
// FNV-1a Hash (32-bit)
// ─────────────────────────────────────────────────

/**
 * FNV-1a is a fast, non-cryptographic hash function.
 * Returns an unsigned 32-bit integer.
 */
function fnv1a32(str: string): number {
  let h = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV prime
  }
  return h >>> 0; // Convert to unsigned
}

// ─────────────────────────────────────────────────
// Hash Vector
// ─────────────────────────────────────────────────

/**
 * Convert text to a hash-based feature vector.
 *
 * Uses the "signed hashing trick" to reduce collision bias:
 * - Each token hashes to an index in the vector
 * - The hash also determines the sign (+1 or -1)
 * - This approximates a sparse bag-of-words representation
 *
 * @param text - Input text to vectorize
 * @param dim - Dimension of the output vector (default: 512)
 * @returns Float32Array of dimension `dim`
 */
export function hashVector(text: string, dim = 512): Float32Array {
  const v = new Float32Array(dim);
  const tokens = tokenize(text);

  for (const token of tokens) {
    const h = fnv1a32(token);
    const idx = h % dim;
    // Use lowest bit to determine sign (signed hashing trick)
    const sign = (h & 1) === 0 ? 1 : -1;
    // Safe because idx is always < dim (modulo operation) and v was initialized with dim
    v[idx] = (v[idx] ?? 0) + sign;
  }

  return v;
}

// ─────────────────────────────────────────────────
// Cosine Similarity
// ─────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 *
 * cos(a, b) = (a · b) / (||a|| * ||b||)
 *
 * Returns 0 if either vector is zero (no overlap).
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    // Using bracket access with default to avoid undefined issues
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────────
// Convenience: Text-to-Text Similarity
// ─────────────────────────────────────────────────

/**
 * Compute similarity between two texts directly.
 */
export function textSimilarity(textA: string, textB: string, dim = 512): number {
  const vecA = hashVector(textA, dim);
  const vecB = hashVector(textB, dim);
  return cosine(vecA, vecB);
}
