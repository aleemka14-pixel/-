# Project Architecture & Security Guidelines

Welcome to the professional, production-level blueprint for this application. This document describes the modular folder structure, execution flow, data segregation model, and core security principles required to scale to thousands of active users.

---

## 1. Directory Structure Blueprint

Our layout bridges a clean organizational directory with seamless local and cloud-based deployment toolchains (like Vite and Vercel):

```
/
├── frontend/                     # FRONTEND INTERFACE ENGINE (Symbolic Maps to /src)
│    ├── assets/                 --> Linked to /public (Images, static content, fonts)
│    ├── components/             --> Linked to /src/components (Modular UI components)
│    ├── pages/                  --> Linked to /src/pages (Route-level viewport components)
│    ├── styles/                 --> Linked to /src/styles (Tailwind core CSS styles)
│    └── utils/                  --> Linked to /src/lib (Clients, state layers, helpers)
│
├── backend/                      # BACKEND BUSINESS LOGIC
│    ├── api/                    --> Linked to /api (Vercel Serverless Function entry points)
│    ├── services/                # Standalone service logic (NOWPayments, Stripe proxy modules)
│    ├── database/                # Database configurations & blueprints (firebase-blueprint.json)
│    ├── middleware/              # Security filters, CORS, rate-limiting, Auth guards
│    └── webhooks/                # IPN (Instant Payment Notification) postback listeners
│
├── config/                       # Centralized configuration presets (Networks, Rates, CORS lists)
├── docs/                         # Technical architecture papers, onboarding guides
│
├── src/                          # Real source container for Vite development server
├── public/                       # Global assets folder served directly by web engines
├── api/                          # Root Serverless API for Vercel deployment compliance
│
├── .env.example                  # Safe template for public environment variables (no secrets)
├── firestore.rules               # Hardened ABAC secure access policy for Firestore
├── vercel.json                   # Vercel CDN rewriting and serverless router rules
└── tsconfig.json                 # Core TypeScript compiler configuration rules
```

---

## 2. Sensitive Information & Secrets Management

To prepare this platform for enterprise security standards, all sensitive strings must be managed strictly outside the source repository:

### Where to Store Secrets
1. **Local Development**: All secrets must reside exclusively in `.env` (which is listed in `.gitignore` and never committed).
2. **Cloud Serverless (Vercel)**: Configured securely in the Vercel Dashboard under **Project Settings > Environment Variables**.
3. **AI Studio Dev Container**: Configured directly inside the **Secrets / Settings** panel of the AI Studio UI (which mounts them safely into the environment at runtime).

### Access Patterns (Server-Side vs. Client-Side)
- **Private Keys**: Variables like `GEMINI_API_KEY`, `NOWPAYMENTS_API_KEY`, or database administrative secrets are **strictly server-side**. They do NOT have the `VITE_` prefix and are accessed strictly in the backend via Node's `process.env`.
- **Public Variables**: Configuration settings that can safely be exposed to the browser (such as Firebase client IDs) are prefixed with `VITE_` (e.g., `VITE_FIREBASE_PROJECT_ID`) and accessed via `import.meta.env.VITE_*`.

---

## 3. Secure Backend API Proxy Connection

To prevent token extraction and API abuse:
- The browser must **never** connect to third-party endpoints (like NOWPayments) directly.
- All outbound requests are proxied securely through Serverless API functions located in `backend/api/` (resolving from `/api/*` in production).
- Middlewares in `backend/middleware/` verify user sessions via Firebase token validation before passing payloads to services.
