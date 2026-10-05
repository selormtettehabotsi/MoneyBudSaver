"""
Rate limiter configuration using SlowAPI with reverse-proxy header support.
Extracts real client IP from CF-Connecting-IP, X-Forwarded-For, or client host.
"""
from fastapi import Request
from slowapi import Limiter


def get_client_ip(request: Request) -> str:
    """Extract client IP prioritizing trusted reverse proxy headers."""
    # Cloudflare Header
    cf_ip = request.headers.get("CF-Connecting-IP")
    if cf_ip:
        return cf_ip.strip()

    # Standard Forwarded For Header (take first hop)
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()

    # Direct client connection
    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


limiter = Limiter(key_func=get_client_ip, default_limits=["200/minute"])
