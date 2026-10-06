import { users } from "@wordinator/db";
import type { Database } from "@wordinator/db";
import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { logError } from "./logger";

const COOKIE_NAME = "wordinator_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210_000;
const encoder = new TextEncoder();

export type AuthUser = {
  id: string;
  displayName: string;
  mustChangePassword: boolean;
};

type SessionPayload = { userId: string; expiresAt: number };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function derivePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer;
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltText, hashText] = encoded.split("$");
  const iterations = Number(iterationsText);
  if (algorithm !== "pbkdf2_sha256" || !Number.isInteger(iterations) || !saltText || !hashText) return false;
  try {
    const actual = await derivePassword(password, base64UrlToBytes(saltText), iterations);
    const expected = base64UrlToBytes(hashText);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1) difference |= actual[index]! ^ expected[index]!;
    return difference === 0;
  } catch {
    return false;
  }
}

function encodeSession(payload: SessionPayload): string {
  return bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
}

function decodeSession(value: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<SessionPayload>;
    if (typeof candidate.userId !== "string" || typeof candidate.expiresAt !== "number") return null;
    return { userId: candidate.userId, expiresAt: candidate.expiresAt };
  } catch {
    return null;
  }
}

export async function setSession(context: Context, userId: string, secret: string): Promise<void> {
  const expiresAt = Date.now() + SESSION_SECONDS * 1000;
  await setSignedCookie(context, COOKIE_NAME, encodeSession({ userId, expiresAt }), secret, {
    path: "/",
    httpOnly: true,
    sameSite: "Strict",
    secure: new URL(context.req.url).protocol === "https:",
    maxAge: SESSION_SECONDS,
  });
}

export function clearSession(context: Context): void {
  deleteCookie(context, COOKIE_NAME, { path: "/", secure: new URL(context.req.url).protocol === "https:" });
}

export async function readSession(context: Context, database: Database, secret: string): Promise<AuthUser | null> {
  const signed = await getSignedCookie(context, secret, COOKIE_NAME);
  if (!signed) return null;
  const payload = decodeSession(signed);
  if (!payload || payload.expiresAt <= Date.now()) return null;
  const [user] = await database
    .select({ id: users.id, displayName: users.displayName, mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, payload.userId))
    .limit(1);
  if (!user) return null;
  await setSession(context, user.id, secret);
  return user;
}

export function newInvitationToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(value: string): Promise<string> {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}
