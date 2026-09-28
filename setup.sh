#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DB_NAME="postapi"
DB_USER="postgres"
DB_PASS="postgres"
DB_PORT="5432"
API_PORT="${PORT:-4000}"

info() { echo -e "\033[1;34m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[setup]\033[0m $*"; }
fail() { echo -e "\033[1;31m[setup]\033[0m $*" >&2; exit 1; }

# --- 1. Prerequisites -------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "node not found (install Node.js >= 18)"
command -v npm  >/dev/null 2>&1 || fail "npm not found"
command -v docker >/dev/null 2>&1 || fail "docker not found"
docker compose version >/dev/null 2>&1 || fail "docker compose plugin not found"

info "node $(node -v), npm $(npm -v)"

# --- 2. Environment files ---------------------------------------------------
if [[ ! -f .env ]]; then
  warn ".env not found - creating with defaults"
  cat > .env <<EOF
POSTGRES_USER=${DB_USER}
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=${DB_NAME}
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:${DB_PORT}/${DB_NAME}
PORT=${API_PORT}
JWT_SECRET=dev-secret-change-me
UPLOAD_DIR=./uploads
NODE_ENV=development
CORS_ORIGIN=http://localhost:4173
VITE_API_URL=
VITE_PORT=4173
EOF
fi
mkdir -p server/uploads uploads

# --- 3. Install dependencies ------------------------------------------------
info "Installing server dependencies..."
(cd server && npm install)

info "Installing client dependencies..."
(cd client && npm install)

# --- 4. Start database ------------------------------------------------------
if docker compose ps --status running 2>/dev/null | grep -q "^db\|postapi-db"; then
  info "Database already running"
else
  info "Starting PostgreSQL..."
  docker compose up -d db
  info "Waiting for database to be ready..."
  for i in $(seq 1 30); do
    if docker exec postapi-db pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 2
    [[ $i -eq 30 ]] && fail "database did not become ready in time"
  done
fi

# --- 5. Seed database -------------------------------------------------------
info "Seeding database..."
(cd server && node src/seed.js) || \
  warn "Seeding failed - run 'cd server && npm run seed' manually to check"

# --- 6. Done ----------------------------------------------------------------
info "Setup complete!"
cat <<EOF

Next steps:
  1. Run the API:
       docker compose up --build server
     or locally:
       cd server && npm run dev

  2. Run the client:
       docker compose up --build client      # nginx, port 4173
     or locally:
       cd client && npm run dev

  API:      http://localhost:${API_PORT}
  Client:   http://localhost:4173
  Database: localhost:${DB_PORT} (${DB_NAME})
EOF
