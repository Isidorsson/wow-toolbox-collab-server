import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (client) return client;
  client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/**
 * Load the binary Y.Doc state for a given doc name.
 * Returns `null` when the doc does not exist yet — Hocuspocus treats that as
 * "empty doc, initialize fresh".
 *
 * Round-trips through the `yjs_doc_get` RPC which returns base64-encoded TEXT
 * because PostgREST's BYTEA-over-JSON is inconsistent (writes accept base64,
 * reads come back as `\\x` hex).
 */
export async function fetchDocument(name: string): Promise<Uint8Array | null> {
  const supabase = getClient();
  let data: unknown;
  try {
    const result = await supabase.rpc("yjs_doc_get", { p_name: name });
    if (result.error) {
      throw new Error(
        `PostgREST error: ${result.error.message} (code=${result.error.code ?? "?"} hint=${result.error.hint ?? "?"})`,
      );
    }
    data = result.data;
  } catch (err) {
    // Wrap with constructor name so opaque fetch errors are diagnosable.
    const cause = err instanceof Error ? err : new Error(String(err));
    throw new Error(
      `fetchDocument(${name}) failed [${cause.constructor.name}]: ${cause.message}`,
      { cause },
    );
  }
  if (data == null) return null;
  if (typeof data !== "string") {
    throw new Error(`fetchDocument(${name}) returned non-string payload`);
  }
  return base64ToBytes(data);
}

/**
 * Persist the full binary Y.Doc state for a given doc name.
 * Called by Hocuspocus on debounced changes and on doc unload.
 */
export async function storeDocument(name: string, state: Uint8Array): Promise<void> {
  const supabase = getClient();
  const b64 = bytesToBase64(state);
  try {
    const result = await supabase.rpc("yjs_doc_upsert", {
      p_name: name,
      p_data_b64: b64,
    });
    if (result.error) {
      throw new Error(
        `PostgREST error: ${result.error.message} (code=${result.error.code ?? "?"} hint=${result.error.hint ?? "?"})`,
      );
    }
  } catch (err) {
    const cause = err instanceof Error ? err : new Error(String(err));
    throw new Error(
      `storeDocument(${name}) failed [${cause.constructor.name}]: ${cause.message}`,
      { cause },
    );
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Bun/Node both have Buffer; use it for performance over a manual loop.
  return Buffer.from(bytes).toString("base64");
}

function base64ToBytes(b64: string): Uint8Array {
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}
