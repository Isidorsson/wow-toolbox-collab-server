function read(name: string): string | undefined {
  // Trim — Railway's UI captures trailing whitespace on paste, which
  // breaks downstream fetch() with "Invalid path specified in request URL".
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function required(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return read(name) ?? fallback;
}

export const env = {
  port: Number.parseInt(optional("PORT", "1234"), 10),
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  supabaseJwtSecret: read("SUPABASE_JWT_SECRET") ?? null,
  allowedDocPrefixes: optional("ALLOWED_DOC_PREFIXES", "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0),
  logLevel: optional("LOG_LEVEL", "info") as "debug" | "info" | "warn" | "error",
} as const;
