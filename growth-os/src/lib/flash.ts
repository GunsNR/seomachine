import { createHmac } from "crypto";
import { safeEqual } from "./crypto";

/**
 * Flash messages travel in the URL, so they are signed: a crafted link like
 * /app?error=Your+account+is+locked shows nothing, because only messages this
 * server produced carry a valid signature.
 */
function sig(msg: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHmac("sha256", `${secret}/flash/v1`).update(msg).digest("base64url").slice(0, 22);
}

export function signFlash(msg: string): string {
  return `${Buffer.from(msg.slice(0, 600), "utf8").toString("base64url")}.${sig(msg.slice(0, 600))}`;
}

export function readFlash(param: string | undefined): string | undefined {
  if (!param) return undefined;
  const [b64, s] = param.split(".");
  if (!b64 || !s) return undefined;
  let msg: string;
  try { msg = Buffer.from(b64, "base64url").toString("utf8"); } catch { return undefined; }
  return safeEqual(s, sig(msg)) ? msg : undefined;
}
