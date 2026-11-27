/**
 * Who is calling? The app signs in with Supabase Auth (email or Google) and sends the access
 * token as a Bearer header. We verify it here against Supabase's public keys. AppLink is never
 * involved in login (AppLink skill: "Nothing on the login or page-load path calls Applink").
 */
import type { Request } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { adminIds, env } from "./env";

export type AuthUser = { id: string; email: string | null; isAdmin: boolean };

const jwks = env.SUPABASE_URL
  ? createRemoteJWKSet(
      new URL("/auth/v1/.well-known/jwks.json", env.SUPABASE_URL),
    )
  : null;
const devSecret = env.DEV_JWT_SECRET
  ? new TextEncoder().encode(env.DEV_JWT_SECRET)
  : null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verify(token: string): Promise<JWTPayload | null> {
  let reason = "no verifier configured";
  if (jwks) {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: new URL("/auth/v1", env.SUPABASE_URL).toString(),
        audience: "authenticated",
      });
      return payload;
    } catch (err) {
      // Log why, never the token itself.
      reason = err instanceof Error ? `${err.name}: ${err.message}` : "unknown";
    }
  }
  if (devSecret) {
    try {
      const { payload } = await jwtVerify(token, devSecret, {
        audience: "authenticated",
      });
      return payload;
    } catch {
      // fall through to the warning
    }
  }
  console.warn(`[auth] rejected a bearer token (${reason})`);
  return null;
}

export async function authenticate(req: Request): Promise<AuthUser | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  const payload = await verify(header.slice(7));
  if (!payload?.sub || !UUID_RE.test(payload.sub)) return null;
  return {
    id: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    isAdmin: adminIds.has(payload.sub),
  };
}
