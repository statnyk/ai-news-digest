import { QdrantClient } from "@qdrant/js-client-rest";
import config from "../config/index.js";

let client;

export function getQdrant() {
  if (!client) {
    client = new QdrantClient({ url: config.qdrant.url });
  }
  return client;
}

/**
 * Ensure the collection exists with the correct vector config.
 * text-embedding-3-small produces 1536-dim vectors.
 */
export async function ensureCollection() {
  const qdrant = getQdrant();
  const collectionName = config.qdrant.collection;

  try {
    await qdrant.getCollection(collectionName);
    console.log(`  ℹ Collection "${collectionName}" already exists.`);
  } catch {
    console.log(`  ▸ Creating collection "${collectionName}"...`);
    await qdrant.createCollection(collectionName, {
      vectors: {
        size: 1536,
        distance: "Cosine",
      },
    });
    console.log(`    ✓ Collection created.`);
  }
}

/**
 * Upsert points (vectors + payloads) into the collection.
 * @param {{ id: string|number, vector: number[], payload: object }[]} points
 */
export async function upsertPoints(points) {
  const qdrant = getQdrant();
  await qdrant.upsert(config.qdrant.collection, {
    wait: true,
    points,
  });
}

/**
 * Search for similar vectors.
 * @param {number[]} vector — query vector
 * @param {number} limit — top-k results
 * @param {number} scoreThreshold — minimum similarity score
 */
export async function searchSimilar(vector, limit = 5, scoreThreshold = 0.0) {
  const qdrant = getQdrant();
  const results = await qdrant.search(config.qdrant.collection, {
    vector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
  });
  return results;
}
