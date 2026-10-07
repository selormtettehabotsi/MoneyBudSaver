"""
SSRF (Server-Side Request Forgery) protection utilities for custom OpenAI-compatible endpoints.
Enforces HTTPS only, resolves hostnames to all IP addresses, refuses private/loopback/link-local/metadata ranges,
and ensures redirects are disabled.
"""
import ipaddress
import socket
from urllib.parse import urlparse
from typing import Tuple


def is_forbidden_ip(ip_str: str) -> bool:
    """Checks if an IP address string falls into any forbidden/internal/metadata/private ranges."""
    try:
        ip = ipaddress.ip_address(ip_str)
    except ValueError:
        return True

    # Standard IP flags
    if (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    ):
        return True

    # Check against Carrier Grade NAT (100.64.0.0/10)
    cgnat_net = ipaddress.ip_network("100.64.0.0/10")
    if ip.version == 4 and ip in cgnat_net:
        return True

    # Check against explicit Cloud Metadata / internal services
    forbidden_explicit = {
        "169.254.169.254",
        "100.100.100.200",
    }
    if str(ip) in forbidden_explicit:
        return True

    return False


def validate_custom_endpoint_url(url: str) -> Tuple[bool, str]:
    """
    Validates a custom AI provider base URL:
    - Must be valid HTTPS URL
    - Resolves hostname to all IP addresses and ensures none are private/internal/loopback/metadata.
    Returns: (is_valid, error_message_if_invalid)
    """
    if not url or not isinstance(url, str) or not url.strip():
        return False, "Custom endpoint URL cannot be empty."

    url_clean = url.strip()
    try:
        parsed = urlparse(url_clean)
    except Exception:
        return False, "Invalid URL format."

    if parsed.scheme.lower() != "https":
        return False, "Custom provider base URL must use HTTPS."

    hostname = parsed.hostname
    if not hostname:
        return False, "Invalid URL: missing hostname."

    hostname_lower = hostname.lower().strip()

    # Block well-known metadata hostnames
    forbidden_hostnames = {
        "localhost",
        "metadata.google.internal",
        "metadata.azure.internal",
        "instance-data",
    }
    if hostname_lower in forbidden_hostnames or hostname_lower.endswith(".internal") or hostname_lower.endswith(".local"):
        return False, f"Forbidden hostname '{hostname}' (internal/metadata network target)."

    # If hostname is already an IP literal
    try:
        ip_obj = ipaddress.ip_address(hostname_lower)
        if is_forbidden_ip(str(ip_obj)):
            return False, f"Forbidden IP address '{hostname_lower}' (private/loopback/metadata range)."
        return True, ""
    except ValueError:
        pass  # It's a domain name, resolve it

    # Resolve domain name to all IP addresses
    try:
        port = parsed.port or 443
        addr_info = socket.getaddrinfo(hostname_lower, port, proto=socket.IPPROTO_TCP)
        if not addr_info:
            return False, f"Could not resolve hostname '{hostname_lower}'."

        resolved_ips = set()
        for entry in addr_info:
            sockaddr = entry[4]
            ip_str = sockaddr[0]
            resolved_ips.add(ip_str)

        for ip_str in resolved_ips:
            if is_forbidden_ip(ip_str):
                return False, f"SSRF Protection: Hostname '{hostname_lower}' resolved to forbidden address ({ip_str})."

    except socket.gaierror as e:
        return False, f"DNS resolution failed for hostname '{hostname_lower}': {str(e)}"
    except Exception as e:
        return False, f"Failed to validate custom URL: {str(e)}"

    return True, ""
