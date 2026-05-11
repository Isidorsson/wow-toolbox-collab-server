import { jwtVerify } from "jose";
import { env } from "./env";

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
}

const secret = new TextEncoder().encode(env.supabaseJwtSecret);

/**
 * Verify a Supabase access token (HS256) and return the user identity.
 * Throws if the token is invalid, expired, or signed by another key.
 *
 * NOTE: This verifies offline using the JWT secret — no round-trip to Supabase.
 * If you migrate to asymmetric (ES256) keys, swap to `createRemoteJWKSet`
 * pointing at `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`.
 */
export async function verifySupabaseToken(token: string): Promise<AuthedUser> {
  const { payload } = await jwtVerify(token, secret, {
    algorithms: ["HS256"],
  });

  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) {
    throw new Error("Token missing `sub` claim");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  const role = typeof payload.role === "string" ? payload.role : "authenticated";

  return { id: userId, email, role };
}

/**
 * Optional safety net: enforce that the requested doc name starts with one of
 * the configured prefixes. Returns true if no prefixes configured (any allowed).
 */
export function isDocNameAllowed(docName: string): boolean {
  if (env.allowedDocPrefixes.length === 0) return true;
  return env.allowedDocPrefixes.some((prefix) => docName.startsWith(prefix));
}
