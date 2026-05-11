-- Yjs document persistence table.
-- Stores the binary state of each collaborative Y.Doc keyed by doc name.
--
-- Doc name convention (recommended): `project:{projectId}:{tool}:{entityId}`
--   Examples:
--     project:abc123:spell:25
--     project:abc123:dbc:Spell.dbc
--     project:abc123:map:tile_32_48
--
-- Access pattern: server uses the SERVICE ROLE key, which bypasses RLS.
-- RLS stays off for this table — auth is enforced at the WebSocket layer
-- via Supabase JWT verification + per-doc membership checks in the
-- Hocuspocus `onAuthenticate` hook.

CREATE TABLE IF NOT EXISTS public.yjs_documents (
  name        TEXT PRIMARY KEY,
  data        BYTEA NOT NULL,
  size_bytes  INTEGER GENERATED ALWAYS AS (octet_length(data)) STORED,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS yjs_documents_updated_at_idx
  ON public.yjs_documents (updated_at DESC);

-- Trigger keeps updated_at current on UPDATEs.
CREATE OR REPLACE FUNCTION public.yjs_documents_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS yjs_documents_touch_updated_at ON public.yjs_documents;
CREATE TRIGGER yjs_documents_touch_updated_at
  BEFORE UPDATE ON public.yjs_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.yjs_documents_touch_updated_at();

-- RLS deliberately disabled. Service role only.
ALTER TABLE public.yjs_documents DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.yjs_documents IS
  'Binary Yjs document state. Service-role access only. Auth enforced at WS layer in collab server.';

-- ---------------------------------------------------------------------------
-- RPC bridge for BYTEA <-> base64.
--
-- PostgREST handles BYTEA awkwardly over JSON (writes are accepted as base64,
-- reads come back as hex strings — inconsistent). These two RPCs make the
-- collab server's life simple: pass and receive base64 TEXT, the function
-- handles the encode/decode against the underlying BYTEA column.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.yjs_doc_get(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(data, 'base64')
  FROM public.yjs_documents
  WHERE name = p_name;
$$;

CREATE OR REPLACE FUNCTION public.yjs_doc_upsert(p_name TEXT, p_data_b64 TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.yjs_documents (name, data)
  VALUES (p_name, decode(p_data_b64, 'base64'))
  ON CONFLICT (name) DO UPDATE
    SET data = EXCLUDED.data;
END;
$$;

-- Service role bypasses RLS, but explicit grants make intent obvious and
-- guard against future RLS being flipped on.
REVOKE ALL ON FUNCTION public.yjs_doc_get(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.yjs_doc_upsert(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.yjs_doc_get(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.yjs_doc_upsert(TEXT, TEXT) TO service_role;
