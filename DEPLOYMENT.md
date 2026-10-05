# 🚀 MoneyCouncil — Zero-Cost Deployment & Remote Access Guide

This guide walks you through deploying **MoneyCouncil** at **$0.00 / month forever** using free-tier cloud infrastructure, or self-hosting on your local PC / home server with secure remote phone access from anywhere in the world.

---

## 🏛️ Architecture Highlights

- **Single-Origin Deployment**: FastAPI statically serves the pre-compiled React 18 PWA frontend from `/frontend/dist`. No CORS friction, no split domains.
- **Enterprise Cookie Security**: Uses `HttpOnly`, `SameSite=Lax`, and `Secure` (auto-enforced on HTTPS and hosted mode) cookies with double-submit `X-CSRF-Token` headers for all mutations.
- **Database Flexibility**: Instant toggle between local zero-config **SQLite** (`sqlite:///./moneycouncil.db`) and cloud-scale **PostgreSQL** (Neon, Supabase) via the `DATABASE_URL` environment variable.
- **Cold-Start Resilience**: Built-in exponential backoff in the frontend client handles free cloud spin-downs seamlessly with a warm-up banner.
- **Ensemble Multi-AI Deliberation**: Pluggable provider adapters (Gemini, Groq, Cerebras, Mistral, OpenRouter, Ollama) with client-side PII scrubbing and automatic JSON repair.

---

## 🌐 Option 1: Free Cloud Deployment (Render + Neon Postgres)

Follow these steps to deploy a live, 24/7 web app accessible from your phone, tablet, and computer.

### Step 1: Create a Free PostgreSQL Database on Neon
1. Go to [Neon.tech](https://neon.tech) and sign up for a free account.
2. Create a new project (e.g., `moneycouncil-db`).
3. Under **Connection Details**, copy your **Connection String** (e.g., `postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require`).

> [!TIP]
> Supabase ([supabase.com](https://supabase.com)) also offers a generous free tier PostgreSQL database that works out of the box with the same connection string format.

---

### Step 2: Obtain Free Multi-AI Provider API Keys
MoneyCouncil uses distinct free-tier AI providers to ensure unbiased multi-model council consensus:

| Provider | Free Tier Link | Default Recommended Model |
| :--- | :--- | :--- |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com/) | `gemini-2.5-flash` |
| **Groq Llama** | [console.groq.com](https://console.groq.com/) | `llama-3.3-70b-versatile` |
| **Cerebras Llama** | [cloud.cerebras.ai](https://cloud.cerebras.ai/) | `llama3.3-70b` |
| **Mistral AI** | [console.mistral.ai](https://console.mistral.ai/) | `mistral-small-latest` |
| **OpenRouter** | [openrouter.ai](https://openrouter.ai/) | `deepseek/deepseek-chat` |

*(You can configure 1, 2, or all 5 keys. The Council dynamically activates all available providers!)*

---

### Step 3: Deploy to Render.com (1-Click Docker Web Service)
1. Push your MoneyCouncil repository to your GitHub account.
2. Log in to [Render.com](https://render.com) and click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Set the following settings:
   - **Environment**: `Docker`
   - **Dockerfile Path**: `./Dockerfile`
   - **Instance Type**: `Free`
5. In the **Environment Variables** section, add:
   ```ini
   ENVIRONMENT=production
   DEPLOYMENT_MODE=hosted
   SECRET_KEY=generate_a_random_32_character_string_here_123456
   INTERNAL_CRON_SECRET=generate_a_secret_for_weekly_reviews_123456
   DATABASE_URL=postgresql://username:password@ep-xyz.us-east-2.aws.neon.tech/neondb?sslmode=require
   GEMINI_API_KEY=your_gemini_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   CEREBRAS_API_KEY=your_cerebras_api_key_here
   MISTRAL_API_KEY=your_mistral_api_key_here
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   ```
6. Click **Create Web Service**. Render will build the React PWA and deploy the FastAPI container.

---

### Step 4: Keep-Alive & Weekly Financial Review Automation
Render's free tier spins down after 15 minutes of inactivity. You can use free scheduled webhooks to keep it responsive and trigger automatic weekly financial audits:

1. Sign up for a free account on [UptimeRobot](https://uptimerobot.com) or [Cron-Job.org](https://cron-job.org).
2. **Ping 1 (Keep-Alive)**:
   - **URL**: `https://your-app.onrender.com/health`
   - **Interval**: Every 5 or 10 minutes.
3. **Ping 2 (Automated Weekly Financial Review)**:
   - **URL**: `https://your-app.onrender.com/internal/weekly-review`
   - **HTTP Method**: `POST`
   - **HTTP Header**: `X-Cron-Secret: <your_INTERNAL_CRON_SECRET>`
   - **Schedule**: Every Sunday at 08:00 AM UTC.

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

MoneyCouncil is a Progressive Web Application (PWA). Once you visit your deployed or tunneled URL:
- **On iPhone (Safari)**: Tap the **Share** button → Tap **"Add to Home Screen"**.
- **On Android (Chrome)**: Tap the **Three Dots Menu** → Tap **"Install App"** or **"Add to Home screen"**.

The app launches full-screen without browser address bars, with offline caching and native app behavior!

---

## 🔒 Security Best Practices Checklist

- [x] **Change Production Secrets**: Never deploy with the default `SECRET_KEY` or `INTERNAL_CRON_SECRET`.
- [x] **Secure Cookies**: Automatically enforced on HTTPS domains and `DEPLOYMENT_MODE=hosted`.
- [x] **CSRF Protection**: All mutation endpoints (`POST`, `PUT`, `DELETE`) require the `X-CSRF-Token` header.
- [x] **PII Anonymization**: All transaction names and sensitive merchant details are anonymized client-side before submission to external AI providers.
- [x] **Full Backups**: Download full database snapshots (`.json`) periodically from **Settings & Data Management** for disaster recovery.
