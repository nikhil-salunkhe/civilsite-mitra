# CivilSiteMitra - Implementation Plan

## Project Overview
Professional Construction Site Management SaaS built with MERN Stack.

## Implementation Status

**All planned phases are implemented and verified.** Full detail: [REPORT_REMAINING_WORK.md](./REPORT_REMAINING_WORK.md).

| Phase | Status | Evidence |
|---|---|---|
| 1 — Project setup & architecture | ✅ Implemented | 44 JS files in `backend/src`, 25 page components in `frontend/src/pages` |
| 2 — Database models | ✅ Implemented | 16 Mongoose models in `backend/src/models` (14 spec models + `MaterialUsage`, `WorkerAttendance`) |
| 3 — Backend APIs | ✅ Implemented & E2E-verified | 128 / 128 end-to-end checks passing |
| 4 — Frontend pages | ✅ Implemented | all routes wired in `App.jsx`; production build exit 0 (925 modules) |
| Verification | ✅ Complete | backend syntax 0 failures · build exit 0 · E2E 128 passed / 0 failed · frontend/API contract audit 93 paths / 0 missing · API + web + proxy HTTP 200 |

Last verified: 25 September 2026 — from `backend/`, with MongoDB + the API on :5000, run
`node tools/smoke-test.js` (business rules, 128 checks) and
`node tools/contract-audit.js` (proves every GET payload contains the exact keys the React pages read).
From `frontend/`, run `npm run check:auth` (17 checks) to guard the sign-out path: it fails
loudly if `logout()` is ever moved back behind an awaited request, if a hard `window.location`
redirect is reintroduced, or if the React Router v7 opt-ins are dropped.

## PHASE 1: Project Setup & Architecture

### Folder Structure
```
civilsite-mitra/
├── backend/
│   ├── src/
│   │   ├── config/         # DB, env, constants
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/     # Auth, validation, error handling
│   │   ├── models/         # Mongoose schemas
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic, financial calculations
│   │   ├── utils/          # Helpers, PDF/Excel generators
│   │   ├── validators/     # Input validation schemas
│   │   └── app.js          # Express app
│   ├── server.js           # Entry point
│   ├── .env.example        # Environment template
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── assets/         # Images, fonts
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # Auth, theme context
│   │   ├── hooks/          # Custom hooks
│   │   ├── layouts/        # Admin, Engineer layouts
│   │   ├── pages/          # Route pages
│   │   ├── routes/         # Route definitions
│   │   ├── services/       # API services
│   │   ├── utils/          # Helpers
│   │   ├── validators/     # Form validation
│   │   └── App.jsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── README.md
└── .gitignore
```

## PHASE 2: Database Models

### Collections:
1. **User** - Authentication & account management
2. **AuditLog** - Admin activity tracking
3. **Site** - Construction site info
4. **Installment** - Payment installments
5. **Payment** - Client payments
6. **Worker** - Laborer records
7. **WorkerPayment** - Worker payment history
8. **Material** - Construction materials
9. **Vendor** - Vendor records
10. **VendorPayment** - Vendor payment history
11. **Expense** - Other site expenses
12. **Activity** - Daily site activities
13. **Document** - Site documents
14. **Progress** - Site progress tracking

## PHASE 3: Backend APIs

### Auth Routes:
- POST /api/auth/login
- POST /api/auth/logout
- POST /api/auth/change-password
- GET /api/auth/me

### Admin Routes:
- GET /api/admin/dashboard
- GET /api/admin/engineers
- POST /api/admin/engineers
- GET /api/admin/engineers/:id
- PUT /api/admin/engineers/:id
- PATCH /api/admin/engineers/:id/status
- POST /api/admin/engineers/:id/reset-password
- GET /api/admin/audit-logs
- GET /api/admin/sites

### Site Routes:
- GET /api/sites
- POST /api/sites
- GET /api/sites/:id
- PUT /api/sites/:id
- DELETE /api/sites/:id
- GET /api/sites/:id/summary

### Financial Routes:
- Payments: CRUD for site payments
- Installments: CRUD for installments
- Workers: CRUD for workers
- WorkerPayments: Track worker payments
- Materials: CRUD for materials
- Vendors: CRUD for vendors
- VendorPayments: Track vendor payments
- Expenses: CRUD for expenses

### Reports:
- GET /api/sites/:id/report
- GET /api/sites/:id/report/pdf
- GET /api/sites/:id/export/excel
- GET /api/sites/:id/export/csv

## PHASE 4: Frontend Pages

### Authentication:
- Login page
- Change password page

### Super Admin:
- Admin Dashboard
- Engineers list
- Create/Edit Engineer
- Engineer details
- Audit logs
- All sites view

### Engineer:
- Engineer Dashboard
- Sites list
- Create/Edit Site
- Site dashboard (with tabs)
- Payments management
- Installments management
- Workers management
- Materials management
- Vendors management
- Expenses management
- Activities management
- Progress tracking
- Reports
- Document upload
- Profile settings

## TECHNOLOGY STACK

### Backend:
- Node.js + Express
- MongoDB + Mongoose
- JWT + bcrypt
- multer (file uploads)
- pdfkit (PDF generation)
- exceljs (Excel export)
- helmet, cors, express-rate-limit
- joi (validation)

### Frontend:
- React + Vite
- React Router v6
- Axios
- Tailwind CSS
- Recharts (charts)
- date-fns (date handling)
- react-modal / custom modals
- react-toastify

## SECURITY MEASURES
1. JWT with HTTP-only cookies option
2. bcrypt password hashing
3. Role-based middleware
4. Account status validation
5. Multi-tenant data isolation
6. Input validation
7. Rate limiting
8. Helmet headers
9. File upload validation
