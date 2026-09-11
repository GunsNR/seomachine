"""Domain normalization helpers used for filtering and deduplication."""

from typing import Optional
from urllib.parse import urlparse

# Multi-label public suffixes we may realistically encounter on US SMB sites.
MULTI_LABEL_SUFFIXES = {
    "co.uk", "org.uk", "ac.uk", "com.au", "co.nz", "co.za",
    "com.mx", "com.br", "co.in", "us.com",
    # Generic second-level suffixes: "com.ar" is a suffix, not a domain.
    "com.ar", "com.co", "com.pe", "com.sg", "com.tr", "com.tw",
    "co.jp", "co.kr", "co.il", "net.au", "org.au", "gov.uk",
}

# Site builders and hosts that hand every tenant its own subdomain. Two shops
# on the same platform are different businesses, so the tenant label is part
# of the key: roofer-one.weebly.com must not collapse to weebly.com.
HOSTED_PLATFORM_SUFFIXES = {
    "weebly.com", "wixsite.com", "editorx.io", "squarespace.com",
    "business.site", "godaddysites.com", "myshopify.com", "blogspot.com",
    "wordpress.com", "webflow.io", "netlify.app", "vercel.app",
    "github.io", "square.site", "companywebsite.net", "z-site.net",
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
    if last_two in HOSTED_PLATFORM_SUFFIXES:
        # Keep the tenant label: roofer-one.weebly.com, not weebly.com.
        return ".".join(parts[-3:])
    last_three = ".".join(parts[-3:])
    if last_three in HOSTED_PLATFORM_SUFFIXES and len(parts) >= 4:
        return ".".join(parts[-4:])
    if last_two in MULTI_LABEL_SUFFIXES:
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
