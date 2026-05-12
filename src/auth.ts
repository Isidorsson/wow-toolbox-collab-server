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
 * Supabase signs tokens with HS256 (legacy shared secret) or ES256/RS256
 * (asymmetric, via JWKS). Even projects labelled "Current = HS256" emit
 * asymmetric tokens during key rotation, so support both.
 */

const hs256Secret = env.supabaseJwtSecret
  ? new TextEncoder().encode(env.supabaseJwtSecret)
  : null;

const jwks = createRemoteJWKSet(
  new URL("/auth/v1/.well-known/jwks.json", env.supabaseUrl),
);

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
    const kid = header.kid ?? "none";
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
