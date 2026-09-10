"""Domain normalization helpers used for filtering and deduplication."""

from typing import Optional
from urllib.parse import urlparse

# Multi-label public suffixes we may realistically encounter on US SMB sites.
MULTI_LABEL_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "co.za",
    "com.mx", "com.br", "co.in", "us.com",
}


def normalize_host(value: str) -> str:
    """Return the bare lowercase hostname from a URL or host string."""
    if not value:
        return ""
    candidate = value.strip().lower()
    if "//" not in candidate:
        candidate = "http://" + candidate
    host = urlparse(candidate).hostname or ""
    if host.startswith("www."):
        host = host[4:]
    return host.strip(".")


def root_domain(value: str) -> str:
    """
    Reduce a URL or hostname to its registrable root domain.

    example: https://www.blog.acme-roofing.com/contact -> acme-roofing.com
    """
    host = normalize_host(value)
    if not host or host.replace(".", "").isdigit():
        return host
    parts = host.split(".")
    if len(parts) <= 2:
        return host
    last_two = ".".join(parts[-2:])
    if last_two in MULTI_LABEL_SUFFIXES and len(parts) >= 3:
        return ".".join(parts[-3:])
    return last_two


def same_root(a: str, b: str) -> bool:
    """True when both values resolve to the same registrable domain."""
    root_a, root_b = root_domain(a), root_domain(b)
    return bool(root_a) and root_a == root_b


def is_blocked(domain: str, directories: set, franchises: set) -> bool:
    """
    True when the domain is a directory/social platform or a blocked franchise.

    Matching is on the root domain, so www./regional subdomains are covered.
    """
    root = root_domain(domain)
    if not root:
        return True
    if root in directories or root in franchises:
        return True
    # Also block exact-host entries such as "denver.franchise.com".
    host = normalize_host(domain)
    return host in directories or host in franchises


def business_name_from_domain(domain: str) -> Optional[str]:
    """Best-effort readable name from a domain, used only as a Places query seed."""
    root = root_domain(domain)
    if not root:
        return None
    label = root.split(".")[0]
    words = [w for w in label.replace("_", "-").split("-") if w]
    return " ".join(words) if words else None
