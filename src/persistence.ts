import { env } from "./env";

/**
 * Direct PostgREST client — bypasses `@supabase/supabase-js` because
 * that library's RPC URL builder was returning `PGRST125: Invalid
 * path specified in request URL` for every call on Bun runtime,
 * even though the underlying RPCs work when invoked through the
 * Supabase SQL editor. Plain fetch sidesteps the issue, gives us
 * one fewer dependency layer to debug, and is half a screen of code.
 */

const REST_BASE = `${env.supabaseUrl.replace(/\/$/, "")}/rest/v1`;

function commonHeaders(): Record<string, string> {
  return {
    apikey: env.supabaseServiceRoleKey,
    Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
    "Content-Type": "application/json",
    // Tells PostgREST to return the function's scalar return as a bare
    // JSON value (string/null) instead of wrapping it in an array.
    Accept: "application/json",
  };
}

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const url = `${REST_BASE}/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      // ignore — best-effort body capture
    }
    throw new Error(
      `PostgREST ${fn} HTTP ${res.status}: ${detail.slice(0, 500)}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * Load the binary Y.Doc state for a given doc name. Returns null if
 * the row doesn't exist yet — Hocuspocus treats null as "fresh doc".
 */
export async function fetchDocument(name: string): Promise<Uint8Array | null> {
  const b64 = await callRpc<string | null>("yjs_doc_get", { p_name: name });
  if (b64 == null) return null;
  if (typeof b64 !== "string") {
    throw new Error(`fetchDocument(${name}): expected string, got ${typeof b64}`);
  }
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/** Persist the full binary Y.Doc state for a given doc name. */
export async function storeDocument(name: string, state: Uint8Array): Promise<void> {
  const b64 = Buffer.from(state).toString("base64");
  await callRpc<null>("yjs_doc_upsert", { p_name: name, p_data_b64: b64 });
}
