import { env } from "./env";

// Strip trailing slashes and any pasted `/rest/v1` suffix — Railway env
// values often have one or both, and would produce `/rest/v1/rest/v1/...`.
const REST_BASE = `${env.supabaseUrl
  .replace(/\/+$/, "")
  .replace(/\/rest\/v\d+$/, "")}/rest/v1`;

const HEADERS = {
  apikey: env.supabaseServiceRoleKey,
  Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
} as const;

async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${REST_BASE}/rpc/${fn}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `PostgREST ${fn} HTTP ${res.status}: ${detail.slice(0, 500)}`,
    );
  }
  return (await res.json()) as T;
}

export async function fetchDocument(name: string): Promise<Uint8Array | null> {
  const b64 = await callRpc<string | null>("yjs_doc_get", { p_name: name });
  if (b64 == null) return null;
  const buf = Buffer.from(b64, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

export async function storeDocument(name: string, state: Uint8Array): Promise<void> {
  const b64 = Buffer.from(state.buffer, state.byteOffset, state.byteLength).toString("base64");
  await callRpc<void>("yjs_doc_upsert", { p_name: name, p_data_b64: b64 });
}
