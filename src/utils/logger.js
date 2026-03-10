import { query } from "./db.js";

/**
 * Log an error to the workflow_errors table.
 * Fails silently to avoid cascading errors.
 */
export async function logError(workflow, errorMsg, context = {}) {
  try {
    await query(
      `INSERT INTO workflow_errors (workflow, error_msg, context) VALUES ($1, $2, $3)`,
      [workflow, errorMsg, JSON.stringify(context)]
    );
  } catch {
    // Fallback: at least print to stderr
    console.error(`[ERROR LOG FAILED] ${workflow}: ${errorMsg}`);
  }
}

/**
 * Simple timestamped console logger.
 */
export function log(prefix, message) {
  const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
  console.log(`[${ts}] [${prefix}] ${message}`);
}
