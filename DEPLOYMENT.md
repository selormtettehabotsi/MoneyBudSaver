# 🚀 MoneyCouncil — Zero-Cost Deployment & Remote Access Guide

This guide walks you through deploying **MoneyCouncil** using free-tier cloud infrastructure, or self-hosting on your local PC / home server with secure remote phone access from anywhere in the world.

---

## 🏛️ Architecture Highlights

- **Single-Origin Deployment**: FastAPI statically serves the pre-compiled React 18 PWA frontend from `/frontend/dist`. No CORS friction, no split domains.
- **Enterprise Cookie Security**: Uses `HttpOnly`, `SameSite=Lax`, and `Secure` (auto-enforced on HTTPS and hosted mode) cookies with double-submit `X-CSRF-Token` headers for all mutations.
- **Database Flexibility**: Instant toggle between local zero-config **SQLite** (`sqlite:///./moneycouncil.db`) and cloud-scale **PostgreSQL** (Neon, Supabase) via the `DATABASE_URL` environment variable.
- **Keep-Alive & Cold-Start Resilience**: Lightweight `/health` endpoint (0 database queries) responds to `GET` and `HEAD` for uptime monitoring, with exponential backoff and warm-up banners in the frontend.
- **Ensemble Multi-AI Deliberation**: Pluggable provider adapters (Gemini, Groq, Cerebras, Mistral, OpenRouter, Ollama) with server-side PII scrubbing and automatic JSON repair.

---

## 🌐 Option 1: Free Cloud Deployment (Render + Neon Postgres)

Follow these steps to deploy a live web app accessible from your phone, tablet, and computer.

> [!NOTE]
> Free-tier hosts like Render spin down web services after 15 minutes of inactivity, and free database providers (Neon/Supabase) may suspend compute when idle. Setting up a 5-minute keep-alive ping prevents sleep during active usage.

### Step 1: Create a Free PostgreSQL Database on Neon
1. Go to [Neon.tech](https://neon.tech) and sign up for a free account.
2. Create a new project (e.g., `moneycouncil-db`).
3. Under **Connection Details**, copy your **Connection String** (e.g., `postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`).

> [!TIP]
> Supabase ([supabase.com](https://supabase.com)) also offers a generous free tier PostgreSQL database that works out of the box with the same connection string format.

---

### Step 2: Obtain Free Multi-AI Provider API Keys
MoneyCouncil integrates 5 distinct free-tier AI model families to ensure unbiased multi-model council consensus. *Note: Free tiers and model availability change over time—use the console links below to manage your keys.*

| Provider | Free Tier Console Link | Model Family | Default Verified Model ID | Rate Limit / Quota |
| :--- | :--- | :--- | :--- | :--- |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/) | Google | `gemini-3.8-flash` | Free tier (~15 RPM, 1500 RPD) |
| **Groq** | [console.groq.com](https://console.groq.com/) | OpenAI open model | `openai/gpt-oss-120b` | Free tier (~30 RPM, 14.4k RPD) |
| **Mistral AI** | [console.mistral.ai](https://console.mistral.ai/) | Mistral | `mistral-small-latest` | Free tier (~1 req/s, 1000 RPD) |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai/models) | Qwen | `qwen/qwen3.8-27b:free` *(Fallback: `inclusionai/ling-3.1-flash`)* | Free tier (~200 RPD on free models) |
| **NVIDIA NIM** | [build.nvidia.com](https://build.nvidia.com/) | Zhipu GLM & Moonshot Kimi | `z-ai/glm-5.3-flash` *(2nd: `moonshotai/kimi-k3`)* | Free tier (~40 RPM shared limit, requires SMS verification) |

*(Optional: Cerebras is also supported as an optional paid/trial provider `llama3.3-70b` at [cloud.cerebras.ai](https://cloud.cerebras.ai/)).*

*(You can configure any subset of keys — 1, 2, 3, or all 5. The Council runs normally with any subset of keys, showing unconfigured members as "not configured" rather than throwing an error!)*

---

### Step 3: Deploy to Render.com (1-Click Docker Web Service)
1. Push your MoneyCouncil repository to your GitHub account.
2. Log in to [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: `Free`
   - **Health Check Path**: `/health`
5. Generate strong 64-character hex secrets on your local machine using Python:
   ```bash
   python -c "import secrets; print(secrets.token_hex(32))"
   ```
6. In the **Environment Variables** section, add:
   ```ini
   ENVIRONMENT=production
   DEPLOYMENT_MODE=hosted
   SECRET_KEY=<your_generated_64_hex_secret>
   CRON_SECRET=<your_generated_64_hex_cron_secret>
   DATABASE_URL=postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   MISTRAL_API_KEY=your_mistral_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   NVIDIA_API_KEY=your_nvidia_api_key_here
   # Optional 2nd NIM model / Paid: CEREBRAS_API_KEY=your_cerebras_key
   ```
7. Click **Create Web Service**. Render will build the React PWA and deploy the FastAPI container.

---

### Step 4: Keep-Alive & Weekly Financial Review Automation

Free Render instances spin down after 15 minutes of inactivity. Use an external ping monitor to prevent sleeping and schedule automated weekly reviews.

#### 1. Keep-Alive Ping (Every 5 minutes)
- **Service**: [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org)
- **URL**: `https://your-app.onrender.com/health`
- **HTTP Method**: `GET` (or `HEAD`)
- **Interval**: Every 5 minutes
- **Expected Status**: `200 OK`
- **Zero DB Load**: `/health` accesses no database and is exempt from rate limiting.

> [!TIP]
> **Backup Option (Cloudflare Worker Cron Trigger)**: You can also deploy a free 3-line Cloudflare Worker on a cron schedule (`*/5 * * * *`) that executes `fetch("https://your-app.onrender.com/health")`.

#### 2. Automated Weekly Financial Review (Every Sunday)
- **Service**: [cron-job.org](https://cron-job.org)
- **URL**: `https://your-app.onrender.com/cron/weekly-review`
- **HTTP Method**: `POST`
- **Headers**:
  - `X-Cron-Secret: <your_CRON_SECRET>`
- **Schedule**: Weekly (e.g. Every Sunday at 08:00 UTC)

#### 3. Verifying Pings in Host Logs
To confirm pings are reaching your app:
1. Open Render or Fly.io dashboard → **Logs**.
2. Look for lines logged by `/health`:
   ```
   [2026-10-05T20:30:00.000000+00:00] HEALTH_CHECK method=GET ip=54.x.y.z ua=UptimeRobot/2.0
   ```

---

## 🏡 Option 2: Local PC / Home Server + Remote Phone Access

If you prefer 100% privacy where no database data leaves your physical computer, you can run MoneyCouncil locally with **SQLite** and **Ollama** and access it securely from your phone using **Cloudflare Tunnel** or **Tailscale**.

```mermaid
graph LR
    Phone["📱 Mobile Phone PWA"] -->|Encrypted HTTPS Tunnel| CFTunnel["Cloudflare Tunnel / Tailscale"]
    CFTunnel -->|Localhost:8000| MoneyCouncil["🖥️ Local PC (FastAPI + React PWA)"]
    MoneyCouncil --> SQLite[("💾 Local SQLite DB")]
    MoneyCouncil --> Ollama["🦙 Local Ollama (Offline AI)"]
```

### Method A: Cloudflare Zero Trust Tunnel (Free Public HTTPS URL)
1. Download `cloudflared` on your PC from [developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
2. Run your local MoneyCouncil server:
   ```bash
   cd backend
   .\venv\Scripts\uvicorn main:app --port 8000
   ```
3. In another terminal, start a free quick tunnel:
   ```bash
   cloudflared tunnel --url http://localhost:8000
   ```
4. Cloudflare will output a public HTTPS URL (e.g., `https://random-subdomain.trycloudflare.com`).
5. Open this link on your phone!

### Method B: Tailscale (Private Encrypted Mesh VPN)
1. Install [Tailscale](https://tailscale.com) on your computer and your phone.
2. Sign in with the same account on both devices.
3. Find your PC's Tailscale IP (e.g. `100.x.y.z`).
4. On your phone's browser, navigate to:
   ```
   http://100.x.y.z:8000
   ```
5. You now have encrypted, private access with zero open router ports.

---

## 📱 Installing the PWA on iPhone & Android

MoneyCouncil is an installable Progressive Web Application (PWA). Once you visit your deployed or tunneled URL:
- **On iPhone (Safari)**: Tap the **Share** button → Tap **"Add to Home Screen"**.
- **On Android (Chrome)**: Tap the **Three Dots Menu** → Tap **"Install App"** or **"Add to Home screen"**.

The app launches full-screen with native 100dvh safe-area support, touch gestures, and offline caching.

---

## 🛡️ Pre-Deployment & Schema Migration Safety

Before deploying code updates, re-deploying containers, or applying database schema changes:
1. **Download a Full JSON Backup**: Go to **Settings** → **Full Database Backup & Disaster Recovery (JSON)** → Click **Export Full Snapshot**.
2. Store the downloaded `.json` snapshot safely on your device or cloud drive.
3. If anything goes wrong or if rolling back to a previous container version, you can restore all categories, transactions, budgets, savings goals, debts, and deliberations in 1 click using **Restore Snapshot**.

> [!IMPORTANT]
> Schema migrations are automatically executed on startup via `init_db()`. Migrations are idempotent and non-destructive (e.g., adding `client_id`, `token_version`, and creating `council_jobs` without modifying existing rows). Downloading a backup prior to major upgrades is an industry-standard best practice.

---

## 🔒 Security Best Practices Checklist

- [x] **Change Production Secrets**: Never deploy with the default `SECRET_KEY` or `CRON_SECRET`.
- [x] **Pre-Deploy Backups**: Always download a JSON backup from **Settings** before deploying container updates.
- [x] **Secure Cookies**: Automatically enforced on HTTPS domains and `DEPLOYMENT_MODE=hosted`.
- [x] **CSRF Protection**: All mutation endpoints (`POST`, `PUT`, `DELETE`) require the `X-CSRF-Token` header.
- [x] **Server-Side PII Scrubbing**: All transaction descriptions and sensitive merchant details are anonymized on the server immediately before outbound provider dispatch.
- [x] **Full Backups**: Download portable database snapshots (`.json`) periodically from **Data & Backups** for disaster recovery.

---

## 🩺 Troubleshooting Checklist

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **App sleeps despite monitor** | Wrong URL pinged (e.g., `/` instead of `/health`) or HTTP redirects | Set monitor URL directly to `https://your-app.onrender.com/health` (avoid trailing slash mismatches). |
| **HEAD request returns 405** | Monitor uses `HEAD` instead of `GET` | MoneyCouncil `/health` explicitly supports both `GET` and `HEAD`. |
| **Free host hours exhausted** | Host free monthly allowance reached (e.g., 750 hours/month) | Render provides 750 free instance hours/month for 1 service. Ensure you don't run duplicate unused free web services on the same account. |
| **Neon database cold latency** | Neon free Postgres suspends compute after 5 minutes of zero queries | The frontend displays a temporary "Waking up database..." notice during the 1–3s compute resume. |
| **403 on `/cron/weekly-review`** | Missing or incorrect `X-Cron-Secret` header | Verify that the header `X-Cron-Secret` in cron-job.org matches the `CRON_SECRET` environment variable exactly. |
| **402 / 404 in Council Chamber** | Provider credit quota exhausted or model ID renamed | Check provider API key balance or change the model ID in **Settings & AI Models**. |
