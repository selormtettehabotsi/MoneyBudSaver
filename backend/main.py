"""
MoneyCouncil FastAPI Main Application Entry Point.
Serves both REST API and single-origin React PWA frontend.
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.csp import SecurityHeadersMiddleware
from app.core.limiter import limiter
from app.db.init_db import init_db
from app.api.api_router import api_v1_router
from app.api.v1.health import router as health_router
from app.api.v1.cron import router as cron_router

from app.core.logging_config import setup_secure_logging

# Configure log safety and redaction across all loggers
setup_secure_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables on startup
    setup_secure_logging()
    init_db()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Privacy-First Multi-AI Ensemble Financial Advisor & Budget Tracker",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url=None,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# 1. Strict Security Headers Middleware (CSP, frame-ancestors 'none', X-Frame-Options, etc.)
app.add_middleware(SecurityHeadersMiddleware)

# 2. CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# 3. Mount API Routers
app.include_router(health_router)  # /health root level
app.include_router(api_v1_router)   # /api/v1/*
app.include_router(cron_router)     # /cron/*

# 4. Single-Origin Static Files & SPA Fallback Handler
# Look for frontend dist in both relative paths
frontend_dist_paths = [
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"),
    os.path.join(os.path.dirname(__file__), "frontend", "dist"),
]

frontend_dist = None
for p in frontend_dist_paths:
    if os.path.exists(p) and os.path.isdir(p):
        frontend_dist = os.path.abspath(p)
        break

if frontend_dist:
    # Mount static assets (js, css, images)
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str, request: Request):
        # Allow API, health, cron, and docs routes to bypass
        if full_path.startswith(("api/", "health", "cron/", "docs", "openapi.json")):
            return None
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
