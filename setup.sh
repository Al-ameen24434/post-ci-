#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

DB_NAME="postapi"
DB_USER="postgres"
DB_PASS="postgres"
DB_PORT="5432"
API_PORT="${PORT:-4000}"
NODE_MAJOR_MIN=18

info() { echo -e "\033[1;34m[setup]\033[0m $*"; }
warn() { echo -e "\033[1;33m[setup]\033[0m $*"; }
fail() { echo -e "\033[1;31m[setup]\033[0m $*" >&2; exit 1; }

# --- 0. Root / package manager detection -------------------------------------
EUID_IS_ROOT=0
[[ $EUID -eq 0 ]] && EUID_IS_ROOT=1

if [[ $EUID_IS_ROOT -eq 0 ]]; then
  command -v sudo >/dev/null 2>&1 || fail "Not running as root and sudo is not available. Re-run as root or install sudo."
  SUDO="sudo"
else
  SUDO=""
fi

node_major() { node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1; }

# Detect what's already present BEFORE touching the package manager at all,
# so re-runs on a provisioned machine need no sudo/password.
NODE_OK=0
command -v node >/dev/null 2>&1 && [[ $(node_major) -ge $NODE_MAJOR_MIN ]] && NODE_OK=1
DOCKER_OK=0
command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && DOCKER_OK=1

# --- 1. Node.js + Docker (only if missing) -------------------------------------
if [[ $NODE_OK -eq 1 && $DOCKER_OK -eq 1 ]]; then
  info "Node.js $(node -v) and Docker already installed - skipping system installs"
fi

if [[ $NODE_OK -eq 0 || $DOCKER_OK -eq 0 ]]; then
  # All installation steps need a working sudo (or root)
  if [[ $EUID_IS_ROOT -eq 0 ]] && ! $SUDO -n true 2>/dev/null; then
    warn "sudo requires a password for this run."
    warn "If it prompts, type your password (make sure you have an interactive TTY: 'ssh user@host' without -T)."
  fi

  if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MGR="yum"
  elif command -v pacman >/dev/null 2>&1; then
    PKG_MGR="pacman"
  elif command -v zypper >/dev/null 2>&1; then
    PKG_MGR="zypper"
  else
    fail "Unsupported package manager. Please install Node.js >= ${NODE_MAJOR_MIN} and Docker manually."
  fi

  info "Package manager: ${PKG_MGR}"
  case "$PKG_MGR" in
    apt)
      $SUDO apt-get update -y
      $SUDO apt-get install -y curl ca-certificates gnupg git lsb-release
      ;;
    dnf|yum)
      $SUDO ${PKG_MGR} install -y curl ca-certificates gnupg git
      ;;
    pacman)
      $SUDO pacman -Sy --noconfirm base-devel curl git
      ;;
    zypper)
      $SUDO zypper install -y curl ca-certificates git
      ;;
  esac

  if [[ $NODE_OK -eq 0 ]]; then
    info "Installing Node.js 20.x..."
    case "$PKG_MGR" in
      apt)
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO apt-get install -y nodejs
        ;;
      dnf|yum)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO ${PKG_MGR} install -y nodejs
        ;;
      pacman)
        $SUDO pacman -Sy --noconfirm nodejs npm
        ;;
      zypper)
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO zypper install -y nodejs
        ;;
    esac
    command -v node >/dev/null 2>&1 || fail "Node.js installation failed"
    info "Installed Node.js $(node -v), npm $(npm -v)"
  fi

  if [[ $DOCKER_OK -eq 0 ]]; then
    info "Installing Docker Engine + compose plugin..."
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO systemctl enable --now docker
    if [[ $EUID_IS_ROOT -eq 0 && -n "${SUDO_USER:-}" ]]; then
      $SUDO usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    fi
  fi
fi

# In this session the current user may not yet have docker group access, so fall back to sudo if needed.
if docker info >/dev/null 2>&1; then
  DC="docker"
elif $SUDO docker info >/dev/null 2>&1; then
  DC="sudo docker"
  warn "Using 'sudo docker' for this session. After re-logging in, plain 'docker' will work (docker group)."
else
  fail "Docker is not usable. Is the docker service running? ($SUDO systemctl status docker)"
fi
$DC compose version >/dev/null 2>&1 || fail "docker compose plugin not found"

info "docker: $($DC --version) | compose: $($DC compose version 2>/dev/null)"

# node_modules left behind by containers/sudo runs is often root-owned,
# which breaks npm install. Remove it if the current user can't write to it.
clean_node_modules() {
  local dir="$1"
  if [[ -d "$dir" ]] && ! touch "$dir/.wtest" 2>/dev/null; then
    rm -f "$dir/.wtest" 2>/dev/null || true
    warn "$dir is owned by another user - removing for a clean install"
    $SUDO rm -rf "$dir"
  else
    rm -f "$dir/.wtest" 2>/dev/null || true
  fi
}

# --- 4. Environment files -----------------------------------------------------
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

# --- 5. Install app dependencies ----------------------------------------------
info "Installing server dependencies..."
clean_node_modules "$ROOT_DIR/server/node_modules"
(cd server && npm install)

info "Installing client dependencies..."
clean_node_modules "$ROOT_DIR/client/node_modules"
(cd client && npm install)

# --- 6. Start database ----------------------------------------------------------
if $DC compose ps --status running 2>/dev/null | grep -q "postapi-db"; then
  info "Database already running"
else
  info "Starting PostgreSQL..."
  $DC compose up -d db
  info "Waiting for database to be ready..."
  for i in $(seq 1 30); do
    if $DC exec postapi-db pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      break
    fi
    sleep 2
    [[ $i -eq 30 ]] && fail "database did not become ready in time"
  done
  info "Database ready"
fi

# --- 7. Seed database -----------------------------------------------------------
info "Seeding database..."
(cd server && node src/seed.js) || \
  warn "Seeding failed - run 'cd server && npm run seed' manually to check"

# --- 8. Done ---------------------------------------------------------------------
info "Setup complete!"
cat <<EOF

Next steps (SSH into this machine, then:):
  1. Run the API:
       $DC compose up --build server
     or locally:
       cd server && npm run dev

  2. Run the client:
       $DC compose up --build client      # nginx, port 4173
     or locally:
       cd client && npm run dev

  From your local machine, forward ports over SSH:
     ssh -L 4000:localhost:4000 -L 4173:localhost:4173 user@<instance-ip>

  API:      http://localhost:${API_PORT}
  Client:   http://localhost:4173
  Database: localhost:${DB_PORT} (${DB_NAME})
EOF
