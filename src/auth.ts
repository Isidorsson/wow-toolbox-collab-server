import {
  jwtVerify,
  createRemoteJWKSet,
  decodeProtectedHeader,
  type JWTVerifyResult,
} from "jose";
import { env } from "./env";

export interface AuthedUser {
  id: string;
  email: string | null;
  role: string;
}

/**
 * Supabase projects can sign tokens with either:
 *   - HS256 (legacy "JWT Secret" — symmetric shared secret), or
 *   - ES256 / RS256 (modern asymmetric keys exposed via JWKS).
 *
 * Newer projects default to asymmetric. Even projects still labelled
 * "Current = HS256" sometimes sign tokens with the standby asymmetric
 * key during rotation, so we have to support both.
 *
 * Strategy: peek at the unverified token header to read `alg`, then
 * dispatch to the right verifier. `jwtVerify` re-checks `alg` against
 * the algorithms list we pass in, so reading the header first does
 * not weaken security — a forged header that doesn't match the key
 * type will fail at signature check.
 */

const hs256Secret = env.supabaseJwtSecret
  ? new TextEncoder().encode(env.supabaseJwtSecret)
  : null;

const jwksUrl = new URL(
  "/auth/v1/.well-known/jwks.json",
  env.supabaseUrl,
);
// `createRemoteJWKSet` caches keys in-process with a 10-minute TTL and
// transparently refreshes on `kid` miss. Safe to call once at module load.
const jwks = createRemoteJWKSet(jwksUrl);

export async function verifySupabaseToken(token: string): Promise<AuthedUser> {
  const header = decodeProtectedHeader(token);
  const alg = header.alg;

  let result: JWTVerifyResult;
  try {
    if (alg === "HS256") {
      if (!hs256Secret) {
        throw new Error(
          "Token signed HS256 but SUPABASE_JWT_SECRET is not configured",
        );
      }
      result = await jwtVerify(token, hs256Secret, { algorithms: ["HS256"] });
    } else if (alg === "ES256" || alg === "RS256") {
      result = await jwtVerify(token, jwks, {
        algorithms: ["ES256", "RS256"],
      });
    } else {
      throw new Error(`Unsupported JWT algorithm: ${alg ?? "unknown"}`);
    }
  } catch (err) {
    // Surface alg + kid so log lines are actionable instead of just
    // "signature verification failed". Token body is NOT logged.
    const kid = typeof header.kid === "string" ? header.kid : "none";
    throw new Error(
      `JWT verification failed (alg=${alg ?? "unknown"}, kid=${kid}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const payload = result.payload;
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) {
    throw new Error("Token missing `sub` claim");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  const role =
    typeof payload.role === "string" ? payload.role : "authenticated";

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
