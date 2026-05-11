function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

export const env = {
  port: Number.parseInt(optional("PORT", "1234"), 10),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  // Optional now — only required if the Supabase project still signs
  // tokens with HS256. Asymmetric (ES256 / RS256) tokens verify via
  // JWKS (no shared secret needed).
  supabaseJwtSecret: optional("SUPABASE_JWT_SECRET", "") || null,
  allowedDocPrefixes: optional("ALLOWED_DOC_PREFIXES", "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
  logLevel: optional("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error",
} as const;
