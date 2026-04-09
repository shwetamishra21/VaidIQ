/**
 * VaidIQ RAG Engine
 * Pure Node.js — no Python, no external embedding service needed.
 * Uses TF-IDF vectors + cosine similarity for retrieval.
 * For production upgrade: swap computeEmbedding() with @xenova/transformers.
 */

import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KNOWLEDGE_DIR = join(__dirname, "../knowledge");

// ─── Vector Store (in-memory) ──────────────────────────────────────────────

class VectorStore {
  constructor() {
    this.chunks = [];       // { id, text, tags, vector }
    this.vocabulary = {};   // word → index in vector
    this.idf = [];          // inverse document frequency per word
    this.built = false;
  }

  /** Load all JSON files from knowledge/ and build index */
  build() {
    const allDocs = [];
    const files = readdirSync(KNOWLEDGE_DIR).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const raw = readFileSync(join(KNOWLEDGE_DIR, file), "utf8");
      const docs = JSON.parse(raw);
      allDocs.push(...docs);
    }

    // 1. Build vocabulary from all documents
    const wordSets = allDocs.map(doc => this._tokenize(doc.text));
    const allWords = new Set(wordSets.flat());
    let idx = 0;
    for (const word of allWords) {
      this.vocabulary[word] = idx++;
    }
    const vocabSize = idx;

    // 2. Compute IDF (log of total docs / docs containing word)
    const N = allDocs.length;
    const df = new Array(vocabSize).fill(0);
    for (const wordSet of wordSets) {
      const uniq = new Set(wordSet);
      for (const word of uniq) {
        if (this.vocabulary[word] !== undefined) {
          df[this.vocabulary[word]]++;
        }
      }
    }
    this.idf = df.map(d => (d > 0 ? Math.log((N + 1) / (d + 1)) + 1 : 1));

    // 3. Compute TF-IDF vectors for every chunk
    for (const doc of allDocs) {
      const vector = this._tfidf(this._tokenize(doc.text), vocabSize);
      this.chunks.push({ id: doc.id, text: doc.text, tags: doc.tags || [], vector });
    }

    this.built = true;
    console.log(`✅ RAG index built: ${this.chunks.length} chunks from ${files.length} files`);
  }

  /**
   * Retrieve top-K most relevant chunks for a query.
   * @param {string} query
   * @param {number} k - number of results
   * @param {number} threshold - min similarity score (0-1)
   */
  retrieve(query, k = 4, threshold = 0.05) {
    if (!this.built) this.build();

    const qTokens = this._tokenize(query);
    const qVec = this._tfidf(qTokens, Object.keys(this.vocabulary).length);

    // Tag-based bonus: chunks whose tags appear in the query get a boost
    const queryLower = query.toLowerCase();

    const scored = this.chunks.map(chunk => {
      let score = this._cosine(qVec, chunk.vector);
      // Boost score if any tag matches query terms
      const tagBonus = chunk.tags.some(tag => queryLower.includes(tag.toLowerCase())) ? 0.2 : 0;
      score = Math.min(1, score + tagBonus);
      return { ...chunk, score };
    });

    return scored
      .filter(c => c.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(c => ({ id: c.id, text: c.text, score: c.score }));
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  _tokenize(text) {
    const stopwords = new Set([
      "a","an","the","is","are","was","were","be","been","being","have","has",
      "had","do","does","did","will","would","could","should","may","might",
      "to","of","in","for","on","with","at","by","from","as","into","or",
      "and","but","if","its","it","this","that","these","those","than","so",
      "also","not","no","can","all","each","more","very","just","about"
    ]);
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }

  _tfidf(tokens, vocabSize) {
    const tf = new Array(vocabSize).fill(0);
    for (const token of tokens) {
      const i = this.vocabulary[token];
      if (i !== undefined) tf[i]++;
    }
    const len = tokens.length || 1;
    const vec = tf.map((count, i) => (count / len) * (this.idf[i] || 1));
    return vec;
  }

  _cosine(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

// ─── Singleton ─────────────────────────────────────────────────────────────
const store = new VectorStore();

/**
 * Retrieve relevant context chunks for a query.
 * Returns formatted string ready to inject into system prompt.
 *
 * @param {string} query - user's message
 * @param {number} k - max chunks to return
 * @returns {string} formatted context block
 */
export function retrieveContext(query, k = 4) {
  if (!store.built) store.build();
  const results = store.retrieve(query, k);
  if (!results.length) return "";

  const lines = results.map((r, i) => `[${i + 1}] ${r.text}`);
  return lines.join("\n\n");
}

/**
 * Retrieve with source info (for citation feature).
 * @returns {Array<{id, text, score}>}
 */
export function retrieveWithSources(query, k = 4) {
  if (!store.built) store.build();
  return store.retrieve(query, k);
}

/**
 * Force rebuild the index (call if knowledge files change).
 */
export function rebuildIndex() {
  store.built = false;
  store.chunks = [];
  store.vocabulary = {};
  store.idf = [];
  store.build();
}

// Build on first import
store.build();
