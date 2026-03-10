import config from "../config/index.js";

/**
 * Split text into overlapping chunks of roughly `chunkSize` characters
 * with `chunkOverlap` characters of overlap between consecutive chunks.
 *
 * Strategy: split by sentences first, then accumulate until chunk size.
 * This avoids cutting mid-sentence, which is critical for embedding quality.
 *
 * @param {string} text
 * @returns {string[]} array of text chunks
 */
export function chunkText(text) {
  if (!text || text.trim().length === 0) return [];

  const { chunkSize, chunkOverlap } = config.rag;

  // Split into sentences (handles ., !, ? followed by space or newline)
  const sentences = text.match(/[^.!?\n]+[.!?\n]*/g) || [text];

  const chunks = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    // If adding this sentence exceeds chunk size and we have content, finalize chunk
    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap: take the tail of the current chunk
      if (chunkOverlap > 0) {
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = overlapText + " " + trimmed;
      } else {
        currentChunk = trimmed;
      }
    } else {
      currentChunk += (currentChunk ? " " : "") + trimmed;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
