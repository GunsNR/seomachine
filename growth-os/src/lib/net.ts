import dns from "dns";
import http from "http";
import https from "https";
import net from "net";

/**
 * SSRF-guarded GET for the crawler and URL imports.
 *
 * The address check runs inside the socket's own `lookup`, so the IP that is
 * validated is the IP that is connected to — a DNS answer cannot change
 * between check and connect (no rebinding window). Every redirect hop is
 * re-validated. Only http/https on ports 80/443; bounded size and time.
 */

export function isBlockedAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::" || v === "::1") return true;
    if (v.startsWith("::ffff:")) return isBlockedAddress(v.slice(7));
    return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff") || v.startsWith("64:ff9b");
  }
  return true;
}

export class FetchBlockedError extends Error {}

function guardedLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err, "", 4);
    const list = addrs as dns.LookupAddress[];
    const bad = list.find((x) => isBlockedAddress(x.address));
    if (!list.length || bad) return cb(new FetchBlockedError(`Blocked: ${hostname} resolves to a private or reserved address.`) as NodeJS.ErrnoException, "", 4);
    if (options.all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}

export type FetchResult = { url: string; status: number; contentType: string; body: string; redirects: string[] };

export async function safeGet(rawUrl: string, opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}): Promise<FetchResult> {
  const maxBytes = opts.maxBytes ?? 1_500_000;
  const redirects: string[] = [];
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= (opts.maxRedirects ?? 3); hop++) {
    if (!["http:", "https:"].includes(url.protocol)) throw new FetchBlockedError("Only http and https URLs can be crawled.");
    if (url.port && !["80", "443"].includes(url.port)) throw new FetchBlockedError("Only standard web ports can be crawled.");
    if (url.username || url.password) throw new FetchBlockedError("URLs with credentials are not allowed.");
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, "")) && isBlockedAddress(url.hostname.replace(/^\[|\]$/g, ""))) throw new FetchBlockedError("Blocked: private or reserved address.");
    const res = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const lib = url.protocol === "https:" ? https : http;
      const req = lib.request(url, { method: "GET", lookup: guardedLookup, timeout: opts.timeoutMs ?? 8000, headers: { "user-agent": "RankLogicGrowthOS-Audit/0.1", accept: "text/html,application/xml;q=0.9,*/*;q=0.5" } }, (r) => {
        const chunks: Buffer[] = [];
        let size = 0;
        r.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) { req.destroy(new Error("Response too large")); return; }
          chunks.push(c);
        });
        r.on("end", () => resolve({ status: r.statusCode ?? 0, headers: r.headers, body: Buffer.concat(chunks).toString("utf8") }));
        r.on("error", reject);
      });
      req.on("timeout", () => req.destroy(new Error("Timed out")));
      req.on("error", reject);
      req.end();
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      redirects.push(url.toString());
      url = new URL(res.headers.location, url);
      continue;
    }
    return { url: url.toString(), status: res.status, contentType: String(res.headers["content-type"] ?? ""), body: res.body, redirects };
  }
  throw new FetchBlockedError("Too many redirects.");
}
