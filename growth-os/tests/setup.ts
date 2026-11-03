import fs from "fs";
import path from "path";

// Load .env without a dependency, then point Prisma at the TEST database.
const envPath = path.resolve(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!;
  }
}
const test = process.env.TEST_DATABASE_URL;
if (!test) throw new Error("TEST_DATABASE_URL is required for tests");
if (process.env.DATABASE_URL && test === process.env.DATABASE_URL && !process.env.CI) throw new Error("Refusing to run tests against the development database");
process.env.DATABASE_URL = test;
process.env.DIRECT_URL = test;
process.env.LIVE_SENDING_ENABLED = "false";
process.env.LIVE_PUBLISHING_ENABLED = "false";
process.env.AI_LIVE_ENABLED = "false";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
