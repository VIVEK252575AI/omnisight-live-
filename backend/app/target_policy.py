"""Admission policy for scan targets.

In production (``ENV=production``) any valid external ``https://`` target is
permitted once it passes SSRF checks (no loopback, link-local, or private
network addresses). In development / staging mode the same SSRF checks apply
but the target does not need to be globally routable.
"""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlsplit


class TargetSafetyError(ValueError):
    """The configured target cannot be safely admitted under the local policy."""


# Private / reserved networks that must never be reachable from a scan worker.
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local / AWS metadata
    ipaddress.ip_network("100.64.0.0/10"),   # shared address space (RFC 6598)
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _is_ssrf_unsafe(address: str) -> bool:
    """Return True when *address* resolves to a private/reserved range."""
    try:
        ip = ipaddress.ip_address(address)
    except ValueError:
        return True  # unparseable → reject
    if ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
        return True
    for network in _PRIVATE_NETWORKS:
        if ip in network:
            return True
    return False


def resolve_target_addresses(host: str) -> set[str]:
    """Resolve all addresses so one unsafe answer cannot be hidden by DNS order."""
    try:
        answers = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        raise TargetSafetyError("The target host did not resolve; check the URL and try again") from None
    addresses: set[str] = set()
    for answer in answers:
        try:
            addresses.add(str(ipaddress.ip_address(answer[4][0])))
        except (ValueError, IndexError, TypeError):
            raise TargetSafetyError("The target host returned an invalid network address") from None
    if not addresses:
        raise TargetSafetyError("The target host did not resolve; check the URL and try again")
    return addresses


def admit_target(base_url: str, environment_kind: str) -> str:
    """Check public HTTPS target constraints and return its exact allowed host.

    In production (``environment_kind='production'``) any globally-routable
    HTTPS target is accepted.  Development and staging are also accepted.
    Internal SSRF addresses are always blocked regardless of environment.

    This admission check does not make an HTTP request. Runtime browser
    execution must repeat policy checks at connection and redirect time inside
    a restricted worker; DNS checks at approval time do not prevent DNS
    rebinding on their own.
    """
    if environment_kind not in {"development", "staging", "production"}:
        raise TargetSafetyError("Only development, staging, or production targets can be authorized")
    parsed = urlsplit(base_url)
    try:
        port = parsed.port
    except ValueError:
        raise TargetSafetyError("The target URL contains an invalid port") from None
    if parsed.scheme.lower() != "https":
        raise TargetSafetyError("Only HTTPS targets can be authorized")
    if port not in {None, 443}:
        raise TargetSafetyError("Only the standard HTTPS port 443 is supported")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise TargetSafetyError("The target URL must not contain credentials, a query, or a fragment")
    raw_host = (parsed.hostname or "").rstrip(".").lower()
    if not raw_host or raw_host.endswith((".localhost", ".local", ".internal", ".test", ".example", ".invalid")):
        raise TargetSafetyError("Local, reserved, and test-only hostnames cannot be authorized")
    # Always block bare loopback / metadata IP literals
    for blocked in ("127.0.0.1", "::1", "0.0.0.0", "169.254.169.254"):
        if raw_host == blocked:
            raise TargetSafetyError("IP-literal SSRF targets cannot be authorized")
    try:
        address = ipaddress.ip_address(raw_host)
    except ValueError:
        address = None
    if address is not None:
        if _is_ssrf_unsafe(str(address)):
            raise TargetSafetyError("IP-literal targets that resolve to private or reserved addresses cannot be authorized")
        # Globally routable IP literals are allowed in production
    try:
        host = raw_host.encode("idna").decode("ascii")
    except UnicodeError:
        raise TargetSafetyError("The target hostname is invalid") from None
    if address is None and ("." not in host or len(host) > 253):
        raise TargetSafetyError("The target must use a fully qualified hostname")

    # DNS resolution + SSRF check for hostname targets
    if address is None:
        addresses = resolve_target_addresses(host)
        if any(_is_ssrf_unsafe(value) for value in addresses):
            raise TargetSafetyError("The target host resolves to a private or reserved network address")
    return host
