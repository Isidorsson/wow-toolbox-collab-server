import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

const TABLE = "yjs_documents";

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
 */
export async function fetchDocument(name: string): Promise<Uint8Array | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select("data")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throw new Error(`fetchDocument(${name}) failed: ${error.message}`);
  }
  if (!data) return null;

  // Postgres BYTEA arrives over PostgREST as a hex-encoded string like "\\x6162...".
  // supabase-js does NOT auto-decode it. Convert here.
  const raw = data.data as unknown;
  if (typeof raw !== "string") {
    throw new Error(`fetchDocument(${name}) returned non-string data column`);
  }
  return hexToBytes(raw);
}

/**
 * Persist the full binary Y.Doc state for a given doc name.
 * Called by Hocuspocus on debounced changes and on doc unload.
 */
export async function storeDocument(name: string, state: Uint8Array): Promise<void> {
  const supabase = getClient();
  // PostgREST accepts BYTEA writes as `\x...` hex strings.
  const hex = "\\x" + bytesToHex(state);
  const { error } = await supabase
    .from(TABLE)
    .upsert({ name, data: hex }, { onConflict: "name" });

  if (error) {
    throw new Error(`storeDocument(${name}) failed: ${error.message}`);
  }
}

function hexToBytes(s: string): Uint8Array {
  const hex = s.startsWith("\\x") ? s.slice(2) : s;
  const len = hex.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] ?? 0;
    s += byte.toString(16).padStart(2, "0");
  }
  return s;
}
