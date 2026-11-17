# post-ci- — Social Network API + SPA

A Facebook-style full-stack application: an **Express + PostgreSQL REST API** and a **React (Vite) single-page client**, containerized with Docker, deployed on **Kubernetes (EKS + AWS ALB Ingress)**, and governed by a **CI/CD pipeline with layered DevSecOps security gates**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GitHub Actions CI (push/PR to main)                                     │
│  server-test │ client-build │ trivy │ docker-scan │ snyk │ sonar         │
└──────────────┬───────────────────────────────────────────────────────────┘
               │  images pushed to Docker Hub (sha + latest tags)
               ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  Kubernetes (namespace: post-api)                                        │
│                                                                          │
│   AWS ALB Ingress ──┬── / , /uploads ──► frontend Service :80  (nginx)   │
│   (internet-facing) └── /api         ──► backend  Service :4000 (node)   │
│                                                                          │
│   backend Deployment ──────────────────► postgres Deployment :5432       │
│   (uploads PVC)                          (postgres PVC)                  │
└──────────────────────────────────────────────────────────────────────────┘
```

Locally, the same stack runs with **Docker Compose** behind a single nginx endpoint (`http://localhost:8080`), with PostgreSQL kept on an internal network with **no published host port**.

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Local development](#local-development)
- [Configuration](#configuration)
- [API reference](#api-reference)
- [DevOps](#devops)
  - [CI pipeline](#ci-pipeline)
  - [Container strategy](#container-strategy)
  - [Docker Compose (local)](#docker-compose-local)
  - [Kubernetes deployment](#kubernetes-deployment)
  - [Image distribution](#image-distribution)
- [DevSecOps](#devsecops)
  - [Security gates at a glance](#security-gates-at-a-glance)
  - [Dependency vulnerability management](#dependency-vulnerability-management)
  - [Trivy — filesystem scanning](#trivy--filesystem-scanning)
  - [Trivy — container image scanning](#trivy--container-image-scanning)
  - [Snyk — deps, images and IaC](#snyk--deps-images-and-iac)
  - [SonarCloud — static analysis](#sonarcloud--static-analysis)
  - [Secrets management](#secrets-management)
  - [Container & Kubernetes hardening](#container--kubernetes-hardening)
  - [Application-level security](#application-level-security)
  - [Security policy & known trade-offs](#security-policy--known-trade-offs)
- [Testing](#testing)
- [Operational notes](#operational-notes)

---

## Features

- **Auth** — register/login with bcrypt-hashed passwords, JWT bearer tokens, `GET /api/auth/me`
- **Posts & feed** — create/delete posts, friend-scoped feed, likes (toggle), comments
- **Friends** — request / accept / decline / remove, pending requests list, friend list, relationship status
- **Profiles** — view any user, name/bio search, edit own profile, avatar & cover image upload (multer, 5 MB, image types only)
- **Health** — `GET /api/health` used by liveness/readiness probes

## Tech stack

| Layer      | Technology |
|------------|------------|
| API        | Node.js 26, Express 4, `pg` (raw SQL, no ORM), JWT (`jsonwebtoken`), bcryptjs, multer 2 |
| Database   | PostgreSQL (16/18 images; schema auto-created at startup via `initDb()`) |
| Client     | React 18, React Router 7, Vite 6, plain CSS |
| Containers | Docker / Docker Compose; multi-stage builds; distroless-style hardening (non-root, read-only FS) |
| Orchestration | Kubernetes manifests (Deployment/Service/PVC/Ingress), AWS Load Balancer Controller |
| CI/CD      | GitHub Actions |
| Security   | npm audit, Trivy (vulns/secrets/misconfig + image), Snyk (deps/Docker/IaC), SonarCloud |

## Repository layout

```
.
├── .github/workflows/ci.yml     # CI/CD + DevSecOps pipeline (6 jobs)
├── client/                      # React SPA + nginx production image
│   ├── Dockerfile               #   multi-stage: vite build → nginx:stable-alpine
│   ├── nginx.conf               #   SPA fallback, /api + /uploads proxy
│   └── src/
├── server/                      # Express API + node production image
│   ├── Dockerfile               #   npm ci → strip npm → run as non-root
│   └── src/
│       ├── app.js               #   express app wiring
│       ├── db.js                #   pg pool + idempotent schema init (migrations)
│       ├── auth.js              #   JWT sign/verify middleware
│       ├── routes/              #   auth, users, posts, friends
│       └── tests/api.test.js    #   end-to-end API tests (node:test)
├── kubernetes-manifest/         # namespace, secret, workloads, ingress (ALB)
├── docker-compose.yml           # local single-endpoint stack
├── setup.sh                     # one-shot local bootstrap (deps, db, seed)
├── sonar-project.properties     # SonarCloud project definition
└── README.md
```

## Local development

### Option A — one-shot setup

```bash
./setup.sh
docker compose up --build -d
```

`setup.sh` installs Node.js ≥ 18 and Docker (if missing), creates `.env`, installs dependencies, starts PostgreSQL via Compose, waits for readiness, and seeds demo data.

Everything is exposed on **one port** through the client's nginx:

| URL | Purpose |
|-----|---------|
| `http://localhost:8080` | SPA |
| `http://localhost:8080/api/health` | API health check |
| `http://localhost:8080/uploads/<file>` | Uploaded images |

The API and database stay on the internal Compose network (database has **no host port**). From another machine, forward a single port: `ssh -L 8080:localhost:8080 user@host`.

### Option B — manual (hot reload)

```bash
# 1. database
docker compose up -d db

# 2. API (http://localhost:4000)
cd server && npm install && npm run dev

# 3. client (http://localhost:5173, proxies /api → :4000)
cd client && npm install && npm run dev
```

### Seed demo data

```bash
docker compose run --rm server node src/seed.js
```

## Configuration

### Server (`server/src/config.js`, root `.env` or `server/.env`)

| Variable | Default | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/postapi` | Postgres connection string |
| `JWT_SECRET` | `dev-secret-change-me` | **Must** be overridden in production (warns if not) |
| `PORT` | `4000` | API port |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origin |
| `UPLOAD_DIR` | repo-root `uploads/` | Avatar/cover storage path (`.env.example` uses `./uploads` → `server/uploads`) |
| `NODE_ENV` | `development` | `production` enables secret checks |

### Client (build-time)

| Variable | Default | Notes |
|----------|---------|-------|
| `VITE_API_URL` | `""` (relative) | Empty ⇒ browser calls same-origin `/api` (nginx-proxied) |
| `VITE_PORT` | `5173` | Dev server port |

Copy `server/.env.example` → `server/.env` for local runs.

## API reference

All routes are prefixed `/api`. Auth endpoints excepted, all require `Authorization: Bearer <token>`.

### Auth
| Method | Path | Body | Returns |
|--------|------|------|---------|
| POST | `/auth/register` | `{name, email, password}` | `201 {token, user}` · `409` duplicate · `400` invalid |
| POST | `/auth/login` | `{email, password}` | `200 {token, user}` · `401` bad credentials |
| GET | `/auth/me` | — | `{user}` |

### Posts
| Method | Path | Notes |
|--------|------|-------|
| GET | `/posts/feed` | Posts from self + accepted friends |
| GET | `/posts/user/:id` | A user's posts |
| POST | `/posts` | `{content}` → `201 {post}` |
| DELETE | `/posts/:id` | Owner only (`403` otherwise) |
| POST/DELETE | `/posts/:id/like` | Toggle → `{liked}` |
| GET/POST | `/posts/:id/comments` | List / add comments |
| DELETE | `/posts/comments/:id` | Comment author or post owner |

### Friends
| Method | Path | Notes |
|--------|------|-------|
| POST | `/friends/request/:id` | Send request → `{status:"pending"}` |
| POST | `/friends/accept/:id` · `/decline/:id` · `/remove/:id` | Manage relationship |
| GET | `/friends/requests` | Incoming pending requests |
| GET | `/friends/list/:id` | Accepted friends |
| GET | `/friends/status/:id` | `none` / `pending` / `accepted` |

### Users
| Method | Path | Notes |
|--------|------|-------|
| GET | `/users/:id` | Public profile |
| GET | `/users?q=` | Search by name (or list 50) |
| PATCH | `/users/me` | `{name?, bio?}` |
| POST | `/users/upload` | multipart `image` + `kind=avatar\|cover` → `{url}` |

---

## DevOps

### CI pipeline

Defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

**Triggers:** `push` to `main`, `pull_request` to `main`, manual `workflow_dispatch`.
**Concurrency:** one run per ref, older runs auto-cancelled.
**Runtime:** Node 26, npm cache keyed on each lockfile.

| Job | Purpose | Fails when |
|-----|---------|------------|
| **Server tests** | Spins a `postgres:18-alpine` service container (health-checked), runs `npm test` (4 end-to-end API tests against a real DB), then `npm audit --audit-level=high` | Tests fail · any High/Critical dependency CVE |
| **Client build** | `npm ci` + `vite build`, then `npm audit --omit=dev --audit-level=high` | Build breaks · High/Critical CVE in **runtime** deps |
| **Trivy (fs)** | `trivy fs .` with `vuln,secret,misconfig` scanners at `HIGH,CRITICAL`, `ignore-unfixed` | Any fixable High/Critical CVE, leaked secret, or IaC misconfiguration |
| **Docker build + image scan** | Builds both images once, scans each with Trivy image scan, scans with Snyk (if token set), pushes to Docker Hub (non-PR, credentials set) | Image contains fixable High/Critical CVE · build fails |
| **Snyk (deps / IaC)** | `snyk test --all-projects` + `snyk iac test kubernetes-manifest/` | Any issue at/above High (IaC reports all severities) — **skipped entirely if `SNYK_TOKEN` unset** |
| **SonarCloud** | Full-history checkout + `sonarqube-scan-action` | Quality gate / scanner errors — **skipped if `SONAR_TOKEN` unset** |

Pipeline design principles:

- **Build once, scan many** — images are built in a single job and reused for Trivy, Snyk, and push, so what is scanned is exactly what is shipped.
- **Fail fast, fail loud** — every gate uses `exit-code: 1`; security jobs are not `continue-on-error`.
- **Graceful degradation only for optional credentials** — Snyk/Sonar/Docker Hub steps check for their secrets and warn-and-skip when absent; they never silently pass with an *invalid* secret (a bad token fails the job loudly, as designed).
- **Minimal token permissions** — workflow runs with `permissions: contents: read`.

### Container strategy

**Server image** (`server/Dockerfile`):

1. `apk upgrade --no-cache` — picks up base-image (Alpine) security patches at build time.
2. `npm ci --omit=dev` — reproducible install locked to `package-lock.json`.
3. **npm removed from the final image** (`rm -rf /usr/local/lib/node_modules/npm …`) — npm is build-time only; deleting it also removes the vulnerable `undici`/`brace-expansion` copies bundled inside the base image's npm.
4. `USER node` + `CMD ["node", "src/index.js"]` — no package manager at runtime, non-root, no shell wrapper.

**Client image** (`client/Dockerfile`):

1. **Stage 1** — `node:26-alpine`, `npm ci`, `vite build`.
2. **Stage 2** — `nginx:stable-alpine` with `apk upgrade --no-cache`, only `dist/` + `nginx.conf` copied in, `USER nginx`.

Both images are scanned by Trivy *and* Snyk before any push.

### Docker Compose (local)

- **Single public endpoint** — only the client (nginx) publishes `${APP_PORT:-8080}`; it serves the SPA and reverse-proxies `/api` and `/uploads` to the internal `server` service.
- **Database is internal** — `db` has no `ports:` mapping, reachable only on the Compose network.
- **Dependency ordering** — `server` waits for `db` health (`pg_isready`).
- **Bind-mount friendly** — `./server:/app` + named volume for `node_modules` for live development.

### Kubernetes deployment

Manifests in [`kubernetes-manifest/`](kubernetes-manifest/), namespace `post-api`:

| File | Contents |
|------|----------|
| `namespace.yaml` | `post-api` namespace |
| `secret.yaml` | DB credentials, `DATABASE_URL`, `JWT_SECRET` (stringData — generate real values before production) |
| `backend.yaml` | Deployment + Service + 1 Gi uploads PVC |
| `database.yaml` | `postgres:16-alpine` Deployment + Service + 1 Gi data PVC |
| `frontend.yaml` | nginx Deployment + Service |
| `ingress.yaml` | AWS ALB Ingress (`alb.ingress.kubernetes.io/*`), internet-facing, `/api` + `/uploads` → backend, `/` → frontend |

```bash
kubectl apply -f kubernetes-manifest/namespace.yaml
kubectl apply -f kubernetes-manifest/secret.yaml     # edit real values first
kubectl apply -f kubernetes-manifest/
kubectl get ingress -n post-api     # → ALB DNS name
```

Requirements: an EKS (or other) cluster with the **AWS Load Balancer Controller** and an `alb` ingress class.

> **Note:** manifests reference `postapi/server:latest` / `postapi/client:latest`. CI pushes to `<DOCKERHUB_USERNAME>/post-api-server|client`. Retag on deploy (`docker tag … postapi/server:latest`) or update the image fields to your registry coordinates.

### Image distribution

On non-PR runs, when `DOCKERHUB_USERNAME` (variable) **and** `DOCKERHUB_TOKEN` (secret) are set, images are pushed as:

```
<user>/post-api-server:<git-sha>  +  :latest
<user>/post-api-client:<git-sha>  +  :latest
```

PRs build and scan but never push.

---

## DevSecOps

Security is layered across the SDLC: every push is scanned by **four independent tools** (npm audit, Trivy, Snyk, SonarCloud) plus hardened builds and hardened runtime manifests.

### Security gates at a glance

| Layer | Tool | Scope | Threshold | Where it runs |
|-------|------|-------|-----------|---------------|
| Dependencies (server) | `npm audit` | runtime + transitive | High+ | server-test job |
| Dependencies (client) | `npm audit --omit=dev` | runtime only | High+ | client-build job |
| Source code, secrets, IaC | Trivy `fs` | whole repo (`vuln,secret,misconfig`) | High+ (fixable only) | trivy job |
| Container OS + libraries | Trivy image | both built images | High+ (fixable only) | docker-scan job |
| Dependencies + Docker + IaC | Snyk | lockfiles, both images, `kubernetes-manifest/` | High+ (IaC: all severities) | snyk + docker-scan jobs |
| Static analysis / quality gate | SonarCloud | `server/src`, `client/src` | project quality gate | sonar job |
| Runtime (cluster) | Kubernetes securityContext | all workloads | enforced by admission | k8s manifests |

### Dependency vulnerability management

- **Lockfiles are committed** and installs use `npm ci` in CI — no floating versions.
- **Server gate:** `npm audit --audit-level=high` — everything, since all server deps ship to production. Currently **0 vulnerabilities** (express/body-parser/proxy-addr/qs/multer all patched; multer upgraded to 2.x).
- **Client gate:** `npm audit --omit=dev --audit-level=high` — runtime deps only (`react`, `react-dom`, `react-router-dom` 7.x). Build tooling (`vite` → `picomatch`) has an advisory with **no upstream fix yet** (`picomatch <= 4.0.7` is vulnerable; latest release is affected), so dev tooling is covered by the Trivy lockfile scan instead, which runs with `ignore-unfixed: true` for the same reason.
- **Policy:** High/Critical findings block the pipeline; Moderate findings are tracked but do not block.

### Trivy — filesystem scanning

The `trivy` job scans the checked-out repository with three scanners:

| Scanner | Catches |
|---------|---------|
| `vuln` | CVEs in `server/package-lock.json` + `client/package-lock.json` |
| `secret` | Hardcoded credentials/tokens/keys anywhere in the tree |
| `misconfig` | Dockerfile and Kubernetes misconfigurations (Dockerfile best practices + KSV benchmark) |

Settings: `severity: HIGH,CRITICAL`, `exit-code: 1`, `ignore-unfixed: true` (no fix available upstream ⇒ not actionable).

The Kubernetes policy checks include **KSV-0014** (read-only root filesystem) and **KSV-0118** (no default security context) — both currently pass with zero misconfigurations.

### Trivy — container image scanning

Both images are scanned **after build, before push**:

- **Alpine OS packages** — CVEs in the base image (e.g. `libxslt` in `nginx:stable-alpine`) are prevented by `apk upgrade --no-cache` in both Dockerfiles.
- **Language packages** — every `node_modules/*.package.json` in the server image and npm's own bundled libraries (removed from the image) are enumerated; the scan reports **0 vulnerabilities**.

### Snyk — deps, images and IaC

Three Snyk integrations, all gated on `SNYK_TOKEN`:

1. **`snyk test --all-projects --severity-threshold=high`** — open-source dependency audit across server + client.
2. **`snyk docker test`** on both built images — OS + library CVEs with exploitability context.
3. **`snyk iac test kubernetes-manifest/`** — Infrastructure-as-Code rules against the cluster manifests. The manifests are tuned to satisfy its rule set, including:
   - `SNYK-CC-K8S-4/5` — CPU/memory **limits** on every container
   - `SNYK-CC-K8S-6` — `capabilities.drop: [ALL]`
   - `SNYK-CC-K8S-10` — `runAsNonRoot: true`
   - `SNYK-CC-K8S-11` — `runAsUser >= 10000` (all workloads run as UID 10000)
   - `SNYK-CC-K8S-42` — explicit `imagePullPolicy: Always`

### SonarCloud — static analysis

- Project: `post-ci` (org `al-ameen24434`), defined in `sonar-project.properties`.
- Scans `server/src` and `client/src`; tests are excluded from coverage of source metrics.
- `fetch-depth: 0` for accurate blame/new-code detection.

### Secrets management

| Secret / variable | Where | Used by |
|-------------------|-------|---------|
| `SNYK_TOKEN` | GitHub Actions secret | Snyk jobs (skip with warning if unset) |
| `SONAR_TOKEN`, `SONAR_HOST_URL` | GitHub Actions secrets | SonarCloud job |
| `DOCKERHUB_TOKEN` (secret), `DOCKERHUB_USERNAME` (variable) | GitHub Actions | Image push (skip with warning if unset) |
| `post-api-secret` | Kubernetes Secret (namespace `post-api`) | DB credentials + `JWT_SECRET` at runtime |

Guardrails:

- `.gitignore` excludes `.env`, `.env.*` (whitelisting only `*.env.example` templates) and `uploads/*`.
- `.dockerignore` excludes `.env` and `node_modules` from build contexts — secrets never enter an image layer.
- The workflow grants only `contents: read`.
- Application code never logs secrets; errors are returned as generic messages with details only in server-side logs.

### Container & Kubernetes hardening

Every workload runs with the same defense-in-depth posture (satisfying both Trivy's KSV benchmark and Snyk IaC rules):

| Control | backend | database | frontend |
|---------|:-------:|:--------:|:--------:|
| `runAsNonRoot: true` | ✅ | ✅ | ✅ |
| `runAsUser/runAsGroup: 10000` (≥10k, avoids host UID clashes) | ✅ | ✅ | ✅ |
| `fsGroup: 10000` + `fsGroupChangePolicy: OnRootMismatch` | ✅ | ✅ | ✅ |
| `readOnlyRootFilesystem: true` | ✅ | ✅ | ✅ |
| `capabilities.drop: [ALL]` | ✅ | ✅ | ✅ |
| Extra capability | — | — | `NET_BIND_SERVICE` (bind :80 as non-root) |
| `allowPrivilegeEscalation: false` | ✅ | ✅ | ✅ |
| `seccompProfile: RuntimeDefault` | ✅ | ✅ | ✅ |
| `imagePullPolicy: Always` | ✅ | ✅ | ✅ |
| CPU / memory requests + limits | ✅ | ✅ | ✅ |
| Writable paths via `emptyDir` (`/tmp`, `/run`, `/var/cache/nginx`) | ✅ | ✅ | ✅ |
| Persistent storage | uploads PVC | data PVC | — |

Postgres-specific notes:

- Runs as UID 10000 (non-root); the official image's `nss_wrapper` handles the missing `/etc/passwd` entry.
- `PGDATA` points at a **subdirectory** of the volume so the mount root can be group-writable (`fsGroup`) while the data directory itself stays `0700`, which PostgreSQL requires.
- `fsGroupChangePolicy: OnRootMismatch` prevents kubelet from re-applying group permissions to `PGDATA` on every restart (PostgreSQL rejects group-accessible data directories).

### Application-level security

- **Passwords** — bcrypt (cost 10), never stored or logged in plaintext.
- **Sessions** — signed JWTs (`Authorization: Bearer`), verified per-request by middleware.
- **SQL injection** — every query is parameterized (`$1…$n`); the only interpolated identifiers are whitelisted column names.
- **Input validation** — name length, email format, password length, post/comment length caps.
- **Uploads** — multer 2 with 5 MB limit and an image MIME allow-list (`jpeg/png/gif/webp`), stored outside the web root behind `/uploads`.
- **CORS** — explicit origin (dev) / same-origin via nginx proxy (prod).
- **Error handling** — central Express error middleware; stack traces stay server-side.
- **Resource abuse** — pagination (`LIMIT`) on feeds/lists; likes/comments uniquely constrained in the schema.

### Security policy & known trade-offs

- **Blocking threshold is High+** everywhere; Moderate findings are visible in reports but do not break the build.
- **`ignore-unfixed: true`** on Trivy mirrors reality: CVEs with no released fix cannot be acted on and would otherwise make the pipeline permanently red (see `picomatch`).
- **Client npm audit covers runtime deps only** — the vulnerable package (`picomatch`) is build-time tooling that never ships to users; Trivy still audits the full lockfile.
- **Snyk/Sonar skip only when their secret is absent.** An *invalid* token fails the job — silent skips would hide broken credentials.
- **Kubernetes Secret is plain `stringData`** for simplicity — for production, seal it (Sealed Secrets/SOPS) or mount from a secrets manager.

---

## Testing

```bash
# server (requires a reachable PostgreSQL, e.g. docker compose up -d db)
cd server
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postapi npm test
```

Four end-to-end tests run under `node:test` against a real HTTP server and real database:

1. `register + login + me` — happy path, duplicate registration (409), bad password (401)
2. `posts: create, feed, like, comment, delete` — friendship-gated feed, like toggle, ownership rules
3. `friends: request, accept, list, status` — full relationship lifecycle
4. `profile: get, search, update`

The test suite awaits `initDb()` before serving traffic, so schema creation is deterministic in CI.

## Operational notes

- **Health endpoints:** `GET /api/health` → `{ok:true}` (used by k8s liveness/readiness probes and Compose checks).
- **Schema management:** `server/src/db.js` runs idempotent `CREATE TABLE IF NOT EXISTS …` on startup — no migration tool; add statements there.
- **Uploads:** stored under `UPLOAD_DIR` (PVC in k8s, bind mount locally) and served at `/uploads/*`.
- **Database access:** `docker compose exec db psql -U postgres -d postapi`.
- **Troubleshooting a red pipeline:** open the failing job — each gate prints a table of findings (Trivy/Snyk/npm audit) or a test assertion (server-test). The most common historical failures and their fixes:
  - `relation "users" does not exist` → tests must await `initDb()` before hitting the API.
  - `/.env.example: not found` during `docker build` → every `COPY` path must exist in the build context.
  - `401 SNYK-0005` → `SNYK_TOKEN` is set but invalid; rotate the token (the job fails loudly by design).
  - Trivy image CVEs in `usr/local/lib/node_modules/npm` → keep the "strip npm from the image" step in the server Dockerfile.
