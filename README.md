# E-Learning Platform

Full-stack e-learning platform built with NestJS, Next.js 16, PostgreSQL, Redis, and MinIO.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose

## Quick Start (Development)

**1. Start infrastructure:**
```bash
docker compose up -d
```

**2. Install dependencies:**
```bash
pnpm install
```

**3. Configure environment:**
```bash
cp apps/api/.env.example apps/api/.env
# Edit apps/api/.env if needed
```

**4. Run database migrations + seed:**
```bash
pnpm --filter api run prisma:migrate
pnpm --filter api run prisma:seed
```

**5. Start dev servers (two terminals):**
```bash
# Terminal 1 — API
pnpm --filter api run start:dev

# Terminal 2 — Web
pnpm --filter web run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Test Accounts (from seed)

| Role       | Email                        | Password   |
|------------|------------------------------|------------|
| Admin      | admin@elearning.local        | Admin@123  |
| Instructor | instructor@elearning.local   | Demo@123   |
| Student    | student@elearning.local      | Demo@123   |

## Running Tests

```bash
# API unit tests
pnpm --filter api run test

# API unit tests with coverage
pnpm --filter api run test:cov

# Frontend E2E tests (requires running servers)
pnpm --filter web run test:e2e
```

## Production Deploy

```bash
# Create .env.prod from template
cp .env.prod.example .env.prod
# Fill in production secrets

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## Architecture

See [plan/README.md](plan/README.md) for system design overview.

### Tech Stack

| Layer    | Technology |
|----------|-----------|
| Backend  | NestJS 11, Prisma 6, PostgreSQL 16 |
| Frontend | Next.js 16, React 19, TanStack Query |
| Auth     | JWT (access + refresh), Redis token storage |
| Storage  | MinIO (S3-compatible) |
| Payment  | SePay integration |
| Styling  | Tailwind CSS v4 |

### Key Routes

**API** (port 3001):
- `POST /auth/login` — login
- `GET /courses` — public catalog
- `POST /enrollments` — free enrollment
- `POST /orders` — create order
- `POST /payments/initiate` — start VNPay payment
- `POST /payments/ipn` — VNPay IPN callback
- `GET /admin/stats` — admin dashboard stats

**Web** (port 3000):
- `/` — homepage
- `/courses` — course catalog
- `/courses/[slug]` — course detail
- `/learn/[courseId]/[lessonId]` — learning page
- `/instructor/*` — instructor dashboard
- `/admin/*` — admin portal
