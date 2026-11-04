import { execSync } from "child_process";
import fs from "fs";
import path from "path";

export default function setup() {
  const envPath = path.resolve(__dirname, "../.env");
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (fs.existsSync(envPath)) for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]!] === undefined) env[m[1]!] = m[2]!;
  }
  const url = env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  execSync("npx prisma migrate deploy", { env: { ...env, DATABASE_URL: url, DIRECT_URL: url } as unknown as NodeJS.ProcessEnv, stdio: "pipe" });
}
