# MoneyCouncil System Architecture

Related: [[index]] | [[Project_Overview]] | [[API_Reference]]

MoneyCouncil is engineered as a privacy-first, local-capable Progressive Web Application backed by a high-performance FastAPI service.

---

## 🏛️ High-Level System Architecture

```mermaid
graph TD
    subgraph Client ["Client Layer (React 18 + Vite PWA)"]
        UI["Modern UI & Design System"]
        Router["React Router (SPA Routing)"]
        State["Context Layer (Auth, Currency, PIN, Sync, Theme)"]
        IDB[("IndexedDB (moneycouncil_offline_db)")]
        Crypto["Device Crypto (PBKDF2 / AES-GCM)"]
    end

    subgraph Gateway ["Server Gateway (FastAPI Single-Origin)"]
        AuthMiddleware["Cookie Auth & Double-Submit CSRF"]
        PIIScrub["Server PII Scrubber"]
        DecimalMath["Exact Decimal Financial Engine"]
        DB[("Database (SQLite / PostgreSQL)")]
    end

    subgraph AI ["AI Council Ensemble"]
        Gemini["Google Gemini 2.5 Flash"]
        Groq["Groq GPT-OSS"]
        OpenRouter["OpenRouter Free Tier"]
        NVIDIA["NVIDIA NIM"]
        Ollama["Local Ollama"]
    end

    UI --> Router
    Router --> State
    State --> IDB
    State --> Crypto
    State -->|Fetch + CSRF Header| AuthMiddleware
    AuthMiddleware --> DecimalMath
    DecimalMath --> DB
    AuthMiddleware --> PIIScrub
    PIIScrub --> Gemini
    PIIScrub --> Groq
    PIIScrub --> OpenRouter
    PIIScrub --> NVIDIA
    PIIScrub --> Ollama
```

---

## 🔒 Security & Privacy Guarantees

1. **Zero Third-Party Client Analytics:** No Google Analytics, no tracking pixels, 100% bundled SVG Lucide icons.
2. **Double-Submit CSRF Defense:** Cookie `mc_csrf` paired with `X-CSRF-Token` request headers on state mutations (`POST`, `PUT`, `DELETE`).
3. **Server PII Anonymization:** Financial figures sent to AI models strip all names, phone numbers, email addresses, and bank account numbers.
4. **Client-Side PIN PBKDF2:** PIN hashes are never sent over the wire; verification and auto-lock occur purely inside the browser session.
5. **Offline Resiliency:** IndexedDB queues transactions created while disconnected and auto-synchronizes with `client_id` idempotency when network recovers.
