# Secure Crypto Settlement Portal & Ledger System

A professional, high-performance web portal for cryptocurrency deposit settlement, ledger tracking, and instant automated checkout generation.

---

## 🚀 Key Features
- **Redesigned Wallet View**: Comprehensive, real-time balance tracker and multi-asset selector.
- **Active On-Chain Payments**: Dynamic on-chain address sessions and live QR code generators.
- **Proof-of-Transfer Verification**: Multi-step deposit tracking with cryptographic verification and file-upload proof audit logging.
- **Vercel Serverless Backends**: Secure API proxies and webhook listeners, keeping all credentials, keys, and secrets safe.

---

## 📁 Scalable Directory Architecture

This codebase is structured according to professional, enterprise-level design conventions:

```
/
├── frontend/                     # Interactive UI Viewports (mapped to /src)
│    ├── assets/                  # High-resolution media assets
│    ├── components/              # Modular UI elements (Deposit panels, Selector chips)
│    ├── pages/                   # Main viewports (Wallet, Deposit, Admin Managers)
│    ├── styles/                  # Tailwind core stylesheets
│    └── utils/                   # Shared local states, client configurations
│
├── backend/                      # Serverless Integrations & Orchestration
│    ├── api/                     # Serverless endpoints (create-payment, webhook)
│    ├── services/                # Settlement engines & rate calculation modules
│    ├── database/                # Schema blueprints and Firestore interfaces
│    ├── middleware/              # Auth checkers & Denial-of-Wallet rate limiters
│    └── webhooks/                # Instant Payment Notification (IPN) listeners
│
├── config/                       # Centralized configuration presets (supported blockchain networks)
├── docs/                         # Technical architecture papers (ARCHITECTURE.md)
│
├── src/                          # Raw client-side source code (Vite entrypoint)
├── public/                       # Static public assets
└── api/                          # Serverless entrypoints
```

> **Note**: To keep build toolchains (like Vite and Vercel) fully compatible and functional without introducing complex, error-prone rewrite overhead, the `frontend/` and `backend/api/` structures use **symbolic mapping links** to connect to their root counterparts (`src/` and `api/`). The active source code compiles, runs, and lints natively.

---

## 🔒 Security & Secrets Management

1. **Strict Key Encapsulation**: Third-party API credentials (such as payment gateway endpoints or database auth tokens) are kept strictly server-side.
2. **Environment Variable Integration**: Credentials are loaded via Node `process.env` in serverless functions, preventing any key leaks to client browsers.
3. **No Key UI Fields**: To comply with secure design philosophies, the UI never presents fields asking for administrative API keys. These are set safely via server configuration.

---

## 🛠️ Getting Started

### Local Development
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the local Vite development server:
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000 to preview.

### Build and Compilation
To bundle the frontend for production deployment:
```bash
npm run build
```
To run the static TypeScript type check:
```bash
npm run lint
```
