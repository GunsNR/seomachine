/**
 * Structured logging with redaction at the boundary.
 *
 * Two things this exists to prevent.
 *
 * **Secrets in logs.** Gate 0 established that a credential never reaches
 * storage, display or export. A log line is storage. `console.error(err)` on a
 * provider failure routinely writes the rejected key, and once it is in a log
 * aggregator it is in a system with different retention and different access
 * control from the database.
 *
 * **Unsearchable logs.** A free-text line is fine until an incident, at which
 * point "which tenant, which request, how many times" is unanswerable. Every
 * line here carries a level, an event name and a structured payload.
 *
 * Deliberately not a logging framework. It is a formatter and a redactor over
 * `console`, because the platform already collects stdout and adding a
 * transport would be an operational dependency bought for nothing.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Keys whose values are never printed, whatever they contain. */
const SECRET_KEYS = new Set([
  'password', 'passwordhash', 'apikey', 'api_key', 'key', 'token', 'accesstoken',
  'access_token', 'refreshtoken', 'refresh_token', 'authorization', 'cookie',
  'secret', 'appPassword'.toLowerCase(), 'hashedkey', 'plaintext', 'credential',
  'stripesecretkey', 'auth_secret', 'authsecret',
]);

/** Patterns that look like a credential wherever they appear in a string. */
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sk|pk|rlst|xai|pplx|whsec)[-_][A-Za-z0-9_-]{8,}/g, '[redacted-key]'],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]'],
  [/\bey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[redacted-jwt]'],
  [/([?&](?:key|api[_-]?key|token|access_token|password|secret)=)[^&\s]+/gi, '$1[redacted]'],
  // Basic-auth credentials embedded in a URL.
  [/\/\/[^/\s:@]+:[^/\s@]+@/g, '//[redacted]@'],
];

export function redactString(value: string): string {
  let out = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * Redact a value of any shape.
 *
 * Recurses, because a credential is usually two levels down inside a provider
 * error rather than at the top level where a shallow check would find it.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';

  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }

  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : redactValue(v, depth + 1);
  }
  return out;
}

export interface LogFields {
  /** Correlates every line produced while handling one request. */
  requestId?: string;
  orgId?: string;
  projectId?: string;
  jobId?: string;
  durationMs?: number;
  [key: string]: unknown;
}

export interface LogLine {
  level: LogLevel;
  event: string;
  timestamp: string;
  [key: string]: unknown;
}

/** Build a line without emitting it. Exported so tests need no console spy. */
export function buildLine(level: LogLevel, event: string, fields: LogFields = {}): LogLine {
  return {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...(redactValue(fields) as Record<string, unknown>),
  };
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = buildLine(level, event, fields);
  const serialized = JSON.stringify(line);

  if (level === 'error') console.error(serialized);
  else if (level === 'warn') console.warn(serialized);
  else console.log(serialized);
}

export const log = {
  debug: (event: string, fields?: LogFields) => emit('debug', event, fields),
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

/**
 * A request correlation id.
 *
 * Prefers one the platform already set, so a trace spanning a load balancer and
 * the app shares an identifier rather than having two.
 */
export function requestId(req: Request): string {
  return (
    req.headers.get('x-request-id') ??
    req.headers.get('x-amzn-trace-id') ??
    req.headers.get('cf-ray') ??
    crypto.randomUUID()
  );
}
