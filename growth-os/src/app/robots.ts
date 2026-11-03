import type { MetadataRoute } from "next";
// The app itself is private. Only published client sites under /s/ are crawlable.
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/s/"], disallow: ["/app", "/portal", "/preview", "/api", "/login"] }] };
}
