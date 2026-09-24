# CivilSiteMitra

**Build Better | Manage Smarter**

Professional construction site management & financial tracking SaaS for civil engineers, contractors and site supervisors — built and sold by **TechMitra Technology**.

MERN stack: **MongoDB · Express · React (Vite) · Node.js**, with JWT auth, role-based access control, multi-tenant data isolation, PDF/Excel/CSV reporting and a Recharts-powered dashboard.

---

## Features

**Super Admin** — platform dashboard with charts (engineer status, financial overview + received/pending cards), engineer lifecycle (create / edit / view / activate / suspend / block / unblock / reset password / **delete with cascade**), global sites view, **Reports & Analytics page with Date/Engineer/Status/Site filters**, audit logs.

**Engineer / Contractor** — personal dashboard, construction sites with auto project value (`Area × Rate`), and a per-site dashboard with 10 tabs:

| Tab | Capability |
|---|---|
| Overview | Financial cards, 9-stage progress editor, lifecycle (complete / reopen / archive / delete) |
| Payments | Client payments (Cash/UPI/Bank/Cheque/Other), totals auto-update |
| Installments | 1–5 customizable stages, PAID / PARTIAL / PENDING / OVERDUE |
| Workers | Daily-wage & contract workers, wage payment history |
| Materials | 11 categories, `Qty × Rate = Total`, paid/pending |
| Vendors | Vendor CRUD + purchase/payment ledger (no double counting) |
| Expenses | 11 expense categories with payment status |
| Activities | Daily site log |
| Reports | One-page A4 PDF, Excel (.xlsx), CSV exports |
| Documents | Upload/download bills, invoices, agreements, photos (owner-only) |

Profile (details + photo upload), change password, and forced first-login password change for temp accounts are included.

---

## Repository layout

```
CivilSiteMitra/
├── backend/
│   ├── src/
│   │   ├── config/         # db.js, index.js (env), constants.js
│   │   ├── controllers/    # 14 controllers
│   │   ├── middleware/     # auth (JWT+role+status), errorHandler, fileUpload, siteAccess
│   │   ├── models/         # 14 Mongoose models (see below)
│   │   ├── routes/         # auth.js, admin.js, sites.js
│   │   ├── services/       # financialService (single source of truth), reportService
│   │   ├── exports/        # excelExport, csvExport
│   │   ├── reports/        # siteReport (PDFKit A4 report)
│   │   └── app.js
│   ├── tools/              # seed.js, smoke-test.js, check-modules.js
│   ├── server.js
│   └── .env.example
├── frontend/
│   └── src/
│       ├── components/     # UI.jsx (shared components), Logo
│       ├── context/        # AuthContext (axios + session state)
│       ├── layouts/        # AdminLayout, EngineerLayout
│       ├── pages/          # Login, Profile, Settings
│       │   ├── admin/      # AdminDashboard, EngineersList, CreateEngineer, EngineerDetail, AdminReports, AdminAnalytics, AuditLogs, AllSites
│       │   └── engineer/   # EngineerDashboard, SitesList, CreateSite, SiteDashboard, EngineerReports, GlobalRecords (6 modules)
│       │       └── siteTabs/  # 10 tabs + shared CRUD machinery
│       └── utils/
├── IMPLEMENTATION_PLAN.md
├── COMPLETED_WORK_REPORT.md
└── REPORT_REMAINING_WORK.md
```

### Database — 14 models

`User` · `AuditLog` · `Site` · `Installment` · `Payment` · `Worker` · `WorkerPayment` · `Material` · `Vendor` · `VendorPayment` · `Expense` · `Activity` · `Document` · `Progress`

Every engineer-owned record carries the owning user id and every site-scoped record carries `site` — enforced on the backend (`loadSite` / `findOwnedSite` guards return 404 for foreign ids). `Site.progress` is the fast read-model; the `Progress` collection holds the same values as a dedicated per-site document (seeded on site create, upserted on every progress update, cascaded on delete).

---

## Quick start

### Prerequisites
- Node.js 18+
- MongoDB (local service, or a MongoDB Atlas URI)

### 1. Backend

```powershell
cd backend
copy .env.example .env      # then edit MONGO_URI / JWT_SECRET / SUPER_ADMIN_* as needed
npm install
npm run seed                # creates/updates the Super Admin account
npm run dev                 # nodemon on http://localhost:5000
```

### 2. Frontend

```powershell
cd frontend
npm install
npm run dev                 # Vite on http://localhost:5173 (proxies /api to :5000)
```

### Local demo credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `admin@civilsitemitra.com` | `Admin@123456` |

Values come from `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` in `backend/.env`. **Change them before any real deployment.** Engineers do not self-register — the Super Admin creates their accounts and issues temporary passwords (first login forces a password change).

---

## Environment variables (`backend/.env`)

| Variable | Purpose | Default |
|---|---|---|
| `PORT` | API port | `5000` |
| `NODE_ENV` | environment | `development` |
| `MONGO_URI` | MongoDB connection | `mongodb://localhost:27017/civilsite-mitra` |
| `JWT_SECRET` | token signing | *(must change in production)* |
| `JWT_EXPIRE` | access token lifetime | `7d` |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | seed admin login | `admin@civilsitemitra.com` / `Admin@123456` |
| `CLIENT_URL` / `SERVER_URL` | CORS origins | `http://localhost:5173` / `http://localhost:5000` |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | general API budget per IP | `900000` / `2000` |
| `RATE_LIMIT_AUTH_MAX` | failed credential attempts per window | `20` |
| `UPLOAD_PATH` / `MAX_FILE_SIZE` / `ALLOWED_FILE_TYPES` | document uploads | `./uploads` / 10 MB / images+pdf+office |

Never commit `.env`.

---

## Scripts

**Backend** (`backend/`): `npm run dev` (nodemon) · `npm start` (node) · `npm run seed` (upsert Super Admin) · `npm test` (E2E smoke suite — **requires MongoDB + API on :5000**)

**Frontend** (`frontend/`): `npm run dev` (Vite) · `npm run build` (→ `dist/`) · `npm run preview`

### Testing

```powershell
# terminal 1
cd backend; npm run dev
# terminal 2
cd backend; npm test        # tools/smoke-test.js — 104 checks: auth, RBAC,
                            # engineer isolation, site CRUD, financial modules,
                            # lifecycle, reports, PDF/Excel/CSV, profile photo, audit logs
```

`node tools/check-modules.js` loads every backend module to catch syntax/require errors quickly.

---

## API overview

Base URL: `http://localhost:5000/api`

- **Auth** — `POST /auth/login` · `POST /auth/logout` · `POST /auth/change-password` · `GET /auth/me` · `PUT /auth/profile` (multipart photo) · forgot/reset password
- **Admin** (Super Admin only) — `GET /admin/dashboard` · `GET /admin/reports` (Date/Engineer/Status/Site filters) · engineers CRUD · `PATCH /admin/engineers/:id/status` · `POST .../reset-password` · `DELETE .../:id` · `GET /admin/sites` · `GET /admin/audit-logs`
- **Sites** — CRUD + `GET /sites/:id/summary` + `PATCH /:id/archive` + `PATCH /:id/complete` + `PUT|PATCH /:id/progress`
- **Site modules** — `payments`, `installments`, `workers`, `worker-payments`, `materials`, `vendors`, `vendor-payments`, `expenses`, `activities`, `documents` (nested under `/sites/:siteId/…`) · **Engineer globals** — `GET /engineer/:module` (workers|materials|vendors|expenses|activities|documents, engineer-scoped cross-site lists)
- **Reports** — `GET /sites/:id/reports` · `GET /sites/:id/report/pdf` · `GET /sites/:id/export/excel|csv`

All responses use `{ success, data, message }`. Auth via HTTP-only cookie **or** `Authorization: Bearer` header.

---

## Financial model (no double counting)

- **Project value** = `totalArea × ratePerArea` — computed on the server only.
- **Committed investment** = material obligations + standalone vendor payments + worker amounts + other expenses.
- **Actual paid investment** = cash already out the door.
- Vendor payments linked to a material **settle that obligation** — they are never added as a second cost.
- `Estimated profit = project value − committed investment`; `profit margin = profit / value × 100`.
- All screens, PDFs and exports read from `backend/src/services/financialService.js` — calculations are never re-implemented in the frontend.

---

## Deployment

1. **Database** — MongoDB Atlas; add your host's IP under *Network Access*; create a DB user with read/write on the database.
2. **Backend** — Render / Railway / any Node host: set `NODE_ENV=production`, a strong `JWT_SECRET`, real `MONGO_URI`, `CLIENT_URL`/`SERVER_URL` to your frontend domain, run `npm run seed` once; build `npm install`, start `npm start`. Attach a persistent disk for `UPLOAD_PATH` (or switch to S3 — see limitations).
3. **Frontend** — Vercel / Netlify: `npm run build`, output `frontend/dist`. Vite proxies only apply in dev; in production serve the API from the same origin as the frontend or allow it via `CLIENT_URL` CORS.
4. Smoke test production: `npm test` pointed at the live API.

---

## Known limitations

- Rate-limit counters are in-memory — use Redis if you run multiple instances.
- Uploaded files live on local disk; multi-instance deployments need shared storage (S3 etc.).
- No mail provider wired — forgot-password tokens are generated but emails are not sent; password resets are done by the Super Admin.
- `npm test` is an API smoke suite, not a unit-test suite (Jest is installed but has no test files).
- Helmet CSP is relaxed for dev — review headers before production launch.
- Worker attendance, in-app notifications and a global settings collection are planned enhancements (the spec's suggested collections) — not implemented; engineer data-entry modules live inside each site by design.

See **REPORT_REMAINING_WORK.md** for the full audit and **COMPLETED_WORK_REPORT.md** for the verified feature inventory.

---

© TechMitra Technology — CivilSiteMitra.
