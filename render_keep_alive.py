#!/usr/bin/env python3
"""
Render Web Service Keep-Alive & Wake-Up Automation Tool.
---------------------------------------------------------
Standalone, zero-dependency script designed specifically to keep Render.com
free-tier services awake 24/7 or reliably wake them up from cold sleep.

Features:
- Zero external dependencies (uses Python standard library: urllib, http.server, threading)
- Works from local PC, cloud server, GitHub Actions, or deployed as a secondary Render service
- Automatically handles cold starts (60s timeout with retry backoff while Render wakes)
- Configurable intervals (default 540s / 9 mins, safely below Render's 15-min idle spin-down)
- Dual mode: Continuous daemon loop, one-shot ping (--once), or embedded HTTP server (--server)

Usage:
  python render_keep_alive.py                          # Run continuous auto-pinger daemon
  python render_keep_alive.py --once                   # Ping once and exit (for cron / task scheduler)
  python render_keep_alive.py --url https://my-app.onrender.com
  python render_keep_alive.py --interval 480           # Ping every 8 minutes
  python render_keep_alive.py --server --port 8080     # Run with web server (for hosting on Render)
"""

import sys
import os
import time
import argparse
import signal
import urllib.request
import urllib.error
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
import threading

DEFAULT_RENDER_URL = "https://moneycouncil-7zcr.onrender.com"
DEFAULT_INTERVAL_SECONDS = 540  # 9 minutes (Render sleeps at 15 minutes)
USER_AGENT = "Render-KeepAlive-Agent/2.0 (+https://github.com/selormtettehabotsi/MoneyBudSaver)"

# ANSI color codes for terminal output
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

# Disable ANSI colors if not in a TTY or on Windows without VT100
if not sys.stdout.isatty() or (sys.platform == "win32" and "WT_SESSION" not in os.environ and "TERM" not in os.environ):
    GREEN = YELLOW = RED = CYAN = BOLD = RESET = ""


def resolve_target_url(custom_url: str = None) -> str:
    """Resolves and formats the complete target /health endpoint URL."""
    raw = (
        custom_url
        or os.getenv("RENDER_APP_URL")
        or os.getenv("KEEP_ALIVE_URL")
        or os.getenv("RENDER_EXTERNAL_URL")
        or DEFAULT_RENDER_URL
    )
    raw = raw.strip().rstrip("/")
    if not (raw.startswith("http://") or raw.startswith("https://")):
        raw = f"https://{raw}"
    if not raw.endswith("/health"):
        raw = f"{raw}/health"
    return raw


def ping_endpoint(url: str, timeout: int = 60, max_retries: int = 3) -> bool:
    """
    Sends an HTTP GET request to the target health URL with retry and cold-start support.
    Returns True if response code is 200, False otherwise.
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, text/plain, */*",
        },
        method="GET",
    )

    for attempt in range(1, max_retries + 1):
        start_time = time.time()
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                duration_ms = int((time.time() - start_time) * 1000)
                status_code = response.getcode()
                if status_code == 200:
                    print(
                        f"[{now_str}] {GREEN}SUCCESS (HTTP 200){RESET} - "
                        f"Pinged {CYAN}{url}{RESET} in {duration_ms}ms. Server is awake."
                    )
                    return True
                else:
                    print(
                        f"[{now_str}] {YELLOW}WARNING (HTTP {status_code}){RESET} - "
                        f"Unexpected response code from {url} in {duration_ms}ms."
                    )
                    return False
        except urllib.error.HTTPError as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            # Even if health returns non-200, the inbound request still triggered Render's edge router
            print(
                f"[{now_str}] {YELLOW}HTTP {exc.code}{RESET} from {url} in {duration_ms}ms - "
                f"Edge router received traffic (server warming/woken)."
            )
            return exc.code == 200
        except (urllib.error.URLError, TimeoutError) as exc:
            duration_ms = int((time.time() - start_time) * 1000)
            reason = getattr(exc, "reason", str(exc))
            if attempt < max_retries:
                retry_wait = 5 * attempt
                print(
                    f"[{now_str}] {YELLOW}COLD START DETECTED (Attempt {attempt}/{max_retries}){RESET}: "
                    f"Server waking from sleep ({reason}). Retrying in {retry_wait}s..."
                )
                time.sleep(retry_wait)
            else:
                print(
                    f"[{now_str}] {RED}ERROR{RESET}: Failed to ping {url} after {max_retries} attempts: {reason}"
                )
                return False
        except Exception as exc:
            print(f"[{now_str}] {RED}UNEXPECTED ERROR{RESET}: {exc}")
            return False

    return False


class HealthHandler(BaseHTTPRequestHandler):
    """Minimal HTTP server handler when running as a hosted web service on Render."""

    target_url: str = DEFAULT_RENDER_URL
    last_ping_status: str = "initialized"
    last_ping_time: str = "never"

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        body = (
            f'{{"status":"ok","service":"render-keep-alive",'
            f'"target":"{self.target_url}",'
            f'"last_ping_status":"{self.last_ping_status}",'
            f'"last_ping_time":"{self.last_ping_time}"}}\n'
        )
        self.wfile.write(body.encode("utf-8"))

    def log_message(self, format, *args):
        # Suppress noisy HTTP server request logs
        return


def start_daemon_loop(target_url: str, interval: int, stop_event: threading.Event):
    """Main continuous keep-alive ping loop."""
    print(f"{BOLD}{CYAN}=== Render Keep-Alive Automation Started ==={RESET}")
    print(f"Target URL:        {CYAN}{target_url}{RESET}")
    print(f"Ping Interval:     {interval} seconds ({interval // 60} minutes)")
    print(f"Render Sleep Limit: 900 seconds (15 minutes)\n")

    # Initial immediate ping
    success = ping_endpoint(target_url)
    HealthHandler.last_ping_status = "success" if success else "failed"
    HealthHandler.last_ping_time = datetime.now(timezone.utc).isoformat()

    while not stop_event.is_set():
        if stop_event.wait(interval):
            break
        success = ping_endpoint(target_url)
        HealthHandler.last_ping_status = "success" if success else "failed"
        HealthHandler.last_ping_time = datetime.now(timezone.utc).isoformat()

    print(f"\n{YELLOW}Keep-alive worker stopped.{RESET}")


def main():
    parser = argparse.ArgumentParser(
        description="Render Free Tier Keep-Alive & Wake-Up Automation Service"
    )
    parser.add_argument(
        "--url",
        type=str,
        default=None,
        help=f"Target URL to ping (defaults to RENDER_APP_URL or {DEFAULT_RENDER_URL})",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=int(os.getenv("KEEP_ALIVE_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS)),
        help=f"Seconds between keep-alive pings (default: {DEFAULT_INTERVAL_SECONDS}s)",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Execute a single keep-alive ping and exit immediately (exit code 0 on success)",
    )
    parser.add_argument(
        "--server",
        action="store_true",
        help="Start embedded HTTP server on PORT for deploying as a standalone Render web service",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("PORT", 8080)),
        help="Port for the embedded HTTP server (default: $PORT or 8080)",
    )

    args = parser.parse_args()
    target_url = resolve_target_url(args.url)
    HealthHandler.target_url = target_url

    # One-shot mode
    if args.once:
        print(f"Executing one-shot keep-alive ping to: {target_url}")
        success = ping_endpoint(target_url, timeout=60, max_retries=3)
        sys.exit(0 if success else 1)

    # Server mode (if explicitly passed or if PORT environment variable is present)
    should_run_server = args.server or ("PORT" in os.environ and not args.once)

    stop_event = threading.Event()

    def handle_exit(signum, frame):
        print("\nShutdown signal received. Exiting gracefully...")
        stop_event.set()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_exit)
    signal.signal(signal.SIGTERM, handle_exit)

    if should_run_server:
        # Start daemon loop in background thread
        daemon_thread = threading.Thread(
            target=start_daemon_loop,
            args=(target_url, args.interval, stop_event),
            daemon=True,
        )
        daemon_thread.start()

        # Run HTTP server on main thread to satisfy Render web service health checks
        server_address = ("0.0.0.0", args.port)
        httpd = HTTPServer(server_address, HealthHandler)
        print(f"{GREEN}Embedded health check server listening on http://0.0.0.0:{args.port}{RESET}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            stop_event.set()
            httpd.server_close()
    else:
        # Continuous daemon loop on main thread
        start_daemon_loop(target_url, args.interval, stop_event)


if __name__ == "__main__":
    main()
