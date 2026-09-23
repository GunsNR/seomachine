#!/usr/bin/env bash
# Make headless Chromium trust this environment's TLS-inspecting proxy.
#
# Cloud containers route HTTPS through a proxy that re-terminates TLS with its own
# CA. curl, node and python already trust it through SSL_CERT_FILE; Chromium reads
# only its NSS store, so without this every page fails with ERR_CERT_AUTHORITY_INVALID.
# This adds that one CA to the NSS store. It does not turn certificate checking off.
# Safe to run repeatedly; a no-op where there is no proxy CA.
set -euo pipefail
CA="${1:-}"
for c in "$CA" /root/.ccr/agent-proxy-ca.crt "${SSL_CERT_FILE:-}"; do
  if [ -n "$c" ] && [ -f "$c" ]; then CA="$c"; break; fi
done
if [ -z "$CA" ] || [ ! -f "$CA" ]; then echo "No proxy CA found — nothing to do."; exit 0; fi
if ! command -v certutil >/dev/null 2>&1; then
  echo "Installing certutil (libnss3-tools)…"
  { apt-get install -y -q libnss3-tools || { apt-get update -q && apt-get install -y -q libnss3-tools; }; } >/dev/null 2>&1 \
    || { echo "Could not install libnss3-tools. Install it, then run this again."; exit 1; }
fi
DB="sql:$HOME/.pki/nssdb"
mkdir -p "$HOME/.pki/nssdb"
[ -f "$HOME/.pki/nssdb/cert9.db" ] || certutil -d "$DB" -N --empty-password
if certutil -d "$DB" -L 2>/dev/null | grep -qE '^(ccr-agent-proxy|design-ref-proxy-ca) '; then
  echo "Proxy CA already trusted by Chromium."; exit 0
fi
certutil -d "$DB" -A -t "C,," -n design-ref-proxy-ca -i "$CA"
echo "Proxy CA trusted by Chromium ($CA)."
