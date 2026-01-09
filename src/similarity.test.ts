/**
 * Unit tests for text similarity functions
 */

import { assertEquals, assertAlmostEquals, assertThrows, assert } from "@std/assert";
import { hashVector, cosine, textSimilarity } from "./similarity.ts";

// ─────────────────────────────────────────────────
// hashVector Tests
// ─────────────────────────────────────────────────

Deno.test("hashVector - returns correct dimension", () => {
  const vec = hashVector("hello world");
  assertEquals(vec.length, 512, "Default dimension should be 512");

  const vec256 = hashVector("hello world", 256);
  assertEquals(vec256.length, 256, "Custom dimension should be respected");
});

Deno.test("hashVector - empty text returns zero vector", () => {
  const vec = hashVector("");
  const sum = vec.reduce((a, b) => a + Math.abs(b), 0);
  assertEquals(sum, 0, "Empty text should produce zero vector");
});

Deno.test("hashVector - short tokens are filtered", () => {
  // Tokens < 3 chars should be ignored
  const vecShort = hashVector("a b c"); // All filtered
  const vecLong = hashVector("hello world test");

  const sumShort = vecShort.reduce((a, b) => a + Math.abs(b), 0);
  const sumLong = vecLong.reduce((a, b) => a + Math.abs(b), 0);

  assertEquals(sumShort, 0, "All short tokens should result in zero vector");
  assert(sumLong > 0, "Long tokens should produce non-zero vector");
});

Deno.test("hashVector - case insensitive", () => {
  const vecLower = hashVector("hello world");
  const vecUpper = hashVector("HELLO WORLD");
  const vecMixed = hashVector("HeLLo WoRLd");

  // All should produce identical vectors
  assertEquals(vecLower, vecUpper, "Should be case insensitive");
  assertEquals(vecLower, vecMixed, "Should be case insensitive for mixed case");
});

Deno.test("hashVector - deterministic", () => {
  const text = "this is a test sentence for hashing";
  const vec1 = hashVector(text);
  const vec2 = hashVector(text);

  assertEquals(vec1, vec2, "Same input should produce same output");
});

// ─────────────────────────────────────────────────
// cosine Tests
// ─────────────────────────────────────────────────

Deno.test("cosine - identical vectors have similarity 1", () => {
  const vec = new Float32Array([1, 2, 3, 4, 5]);
  const sim = cosine(vec, vec);
  assertAlmostEquals(sim, 1.0, 0.0001, "Identical vectors should have similarity 1");
});

Deno.test("cosine - orthogonal vectors have similarity 0", () => {
  const vecA = new Float32Array([1, 0, 0, 0]);
  const vecB = new Float32Array([0, 1, 0, 0]);
  const sim = cosine(vecA, vecB);
  assertAlmostEquals(sim, 0.0, 0.0001, "Orthogonal vectors should have similarity 0");
});

Deno.test("cosine - opposite vectors have similarity -1", () => {
  const vecA = new Float32Array([1, 2, 3]);
  const vecB = new Float32Array([-1, -2, -3]);
  const sim = cosine(vecA, vecB);
  assertAlmostEquals(sim, -1.0, 0.0001, "Opposite vectors should have similarity -1");
});

Deno.test("cosine - zero vector returns 0", () => {
  const vecA = new Float32Array([0, 0, 0]);
  const vecB = new Float32Array([1, 2, 3]);
  const sim = cosine(vecA, vecB);
  assertEquals(sim, 0, "Zero vector should return similarity 0");
});

Deno.test("cosine - throws on dimension mismatch", () => {
  const vecA = new Float32Array([1, 2, 3]);
  const vecB = new Float32Array([1, 2]);

  assertThrows(
    () => cosine(vecA, vecB),
    Error,
    "dimension mismatch",
    "Should throw on mismatched dimensions"
  );
});

Deno.test("cosine - normalized result in range [-1, 1]", () => {
  const vecA = new Float32Array([100, 200, -50, 75]);
  const vecB = new Float32Array([10, -20, 30, 40]);
  const sim = cosine(vecA, vecB);

  assert(sim >= -1 && sim <= 1, `Cosine similarity should be in [-1, 1], got ${sim}`);
});

// ─────────────────────────────────────────────────
// textSimilarity Tests
// ─────────────────────────────────────────────────

Deno.test("textSimilarity - identical texts have high similarity", () => {
  const text = "The quick brown fox jumps over the lazy dog";
  const sim = textSimilarity(text, text);
  assertAlmostEquals(sim, 1.0, 0.0001, "Identical texts should have similarity 1");
});

Deno.test("textSimilarity - similar texts have high similarity", () => {
  const textA = "The user wants to log in to the system using their email";
  const textB = "The user needs to log in to the system with their email address";
  const sim = textSimilarity(textA, textB);

  assert(sim > 0.7, `Similar texts should have high similarity, got ${sim}`);
});

Deno.test("textSimilarity - different texts have low similarity", () => {
  const textA = "The user wants to log in to the system";
  const textB = "The database schema includes tables for products and orders";
  const sim = textSimilarity(textA, textB);

  assert(sim < 0.5, `Different texts should have low similarity, got ${sim}`);
});

Deno.test("textSimilarity - empty texts have zero similarity", () => {
  const sim = textSimilarity("", "");
  assertEquals(sim, 0, "Empty texts should have 0 similarity");
});

Deno.test("textSimilarity - user story similarity detection", () => {
  // Real-world test: similar user stories should score high
  const storyA = `
    As a registered user
    I want to reset my password
    So that I can regain access to my account
    Acceptance Criteria:
    - Given I click forgot password, I receive an email
    - Given I enter a new password, my password is updated
  `;

  const storyB = `
    As a registered user
    I want to change my password
    So that I can maintain account security
    Acceptance Criteria:
    - Given I enter my current password, I can set a new one
    - Given invalid password, I see an error message
  `;

  const storyC = `
    As an administrator
    I want to view system logs
    So that I can debug production issues
    Acceptance Criteria:
    - Given I access the admin panel, I see recent logs
    - Given I filter by date, I see filtered results
  `;

  const simAB = textSimilarity(storyA, storyB);
  const simAC = textSimilarity(storyA, storyC);

  assert(simAB > simAC, `Similar stories (A-B) should be more similar than different stories (A-C). AB=${simAB}, AC=${simAC}`);
});
