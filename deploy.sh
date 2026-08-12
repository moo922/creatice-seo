#!/usr/bin/env bash
#
# deploy.sh — self-hosted deployment for the Search & AI Visibility platform.
#
# Usage:
#   ./deploy.sh doctor          Check prerequisites (node, db, redis, deps)
#   ./deploy.sh install         npm install
#   ./deploy.sh build           Build all workspaces
#   ./deploy.sh migrate         Pre-deploy backup + run migrations (+ seed admin if ADMIN_* set)
#   ./deploy.sh start           Start API + worker in the background and wait for readiness
#   ./deploy.sh stop            Stop API + worker
#   ./deploy.sh restart         Stop then start
#   ./deploy.sh status          Show running processes and health
#   ./deploy.sh backup [label]  pg_dump backup (data/backups/<label>-<ts>.sql.gz)
#   ./deploy.sh chromium        Install local Chromium for PDF reports (Playwright)
#   ./deploy.sh full            doctor -> install -> build -> migrate -> start
#
# Environment: a root `.env` file is sourced if present (see DEPLOYMENT.md for
# the full variable reference). Defaults match the @creative-seo/config schema.
#
# NOTE: this script runs the applications natively with npm. Docker deployment
# is not wired yet (the Dockerfiles referenced by infra/docker-compose.yml have
# not been created).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/.env"
LOG_DIR="$ROOT/data/logs"
RUN_DIR="$ROOT/data/run"
BACKUP_DIR="$ROOT/data/backups"
REPORTS_DIR="${REPORTS_DIR:-$ROOT/data/reports}"
HEALTH_URL=""
API_PID_FILE="$RUN_DIR/api.pid"
WORKER_PID_FILE="$RUN_DIR/worker.pid"

log()  { printf '\033[1;32m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; }

usage() {
  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
  exit "${1:-0}"
}

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    log "Loaded $ENV_FILE"
  else
    warn "No $ENV_FILE found — using built-in dev defaults (not for production)."
  fi

  # Defaults (match packages/config/src/index.ts).
  : "${NODE_ENV:=production}"
  : "${HOST:=0.0.0.0}"
  : "${PORT:=3000}"
  : "${WORKER_PORT:=3100}"
  : "${DATABASE_URL:=postgres://creative_seo:creative_seo_dev@127.0.0.1:5432/creative_seo}"
  : "${REDIS_URL:=redis://127.0.0.1:6379}"
  : "${API_PUBLIC_URL:=http://localhost:${PORT}}"
  : "${REPORTS_DIR:=$ROOT/data/reports}"
  : "${BACKUP_KEEP:=30}"
  export NODE_ENV HOST PORT WORKER_PORT DATABASE_URL REDIS_URL API_PUBLIC_URL REPORTS_DIR BACKUP_KEEP

  HEALTH_URL="${API_PUBLIC_URL}/api/health/ready"
}

ensure_dirs() {
  mkdir -p "$LOG_DIR" "$RUN_DIR" "$BACKUP_DIR" "$REPORTS_DIR"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "missing required command: $1"; exit 1; }
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_doctor() {
  load_env
  log "Prerequisite check"
  require_cmd node
  require_cmd npm
  require_cmd bash

  local node_major
  node_major="$(node -v | sed 's/^v//' | cut -d. -f1)"
  if (( node_major < 20 )); then
    err "Node >= 20 required (found $(node -v))"
    exit 1
  fi
  log "Node $(node -v) / npm $(npm -v) OK"

  if [[ ! -d "$ROOT/node_modules" ]]; then
    warn "node_modules missing — run './deploy.sh install' first (skipping db/redis checks)."
    return 0
  fi

  if node -e 'const {Client}=require("pg");const c=new Client({connectionString:process.env.DATABASE_URL});c.connect().then(()=>{console.log("db reachable");return c.end()}).catch((e)=>{console.error("db UNREACHABLE:",e.message);process.exit(1)})'; then
    log "PostgreSQL reachable"
  else
    return 1
  fi

  if node -e 'const Redis=require("ioredis");const r=new Redis(process.env.REDIS_URL,{maxRetriesPerRequest:1,lazyConnect:true});r.connect().then(()=>r.ping()).then((p)=>{console.log("redis reachable ("+p+")");r.disconnect()}).catch((e)=>{console.error("redis UNREACHABLE:",e.message);process.exit(1)})'; then
    log "Redis reachable"
  else
    return 1
  fi

  command -v pg_dump >/dev/null 2>&1 && log "pg_dump OK (backups enabled)" || warn "pg_dump not found — backups unavailable"
  command -v chromium >/dev/null 2>&1 || node -e 'require("playwright")' >/dev/null 2>&1 && log "Playwright available" || warn "Playwright/Chromium missing — PDFs will save as HTML only (run './deploy.sh chromium')"

  log "Doctor OK"
}

cmd_install() {
  load_env
  log "Installing workspace dependencies"
  npm install
}

cmd_build() {
  log "Building all workspaces"
  npm run build
  log "Type-checking"
  npm run typecheck
  log "Linting"
  npm run lint
}

cmd_migrate() {
  load_env
  if command -v pg_dump >/dev/null 2>&1; then
    log "Pre-deploy backup"
    bash scripts/backup-db.sh pre-deploy || warn "pre-deploy backup failed (continuing)"
  fi
  log "Running migrations"
  npm run db:migrate
  if [[ -n "${ADMIN_EMAIL:-}" && -n "${ADMIN_PASSWORD:-}" ]]; then
    log "Seeding admin ($ADMIN_EMAIL)"
    ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_FULL_NAME="${ADMIN_FULL_NAME:-Admin}" npm run db:seed
  else
    warn "ADMIN_EMAIL / ADMIN_PASSWORD not set — skipping admin seed."
  fi
}

cmd_start() {
  load_env
  ensure_dirs

  if [[ ! -d "$ROOT/dist" && ! -d "$ROOT/apps/api/dist" ]]; then
    err "No build output found — run './deploy.sh build' first."
    exit 1
  fi

  start_one "API"      "$API_PID_FILE"    "npm run start --workspace=@creative-seo/api"    "$LOG_DIR/api.log"
  start_one "Worker"   "$WORKER_PID_FILE" "npm run start --workspace=@creative-seo/worker" "$LOG_DIR/worker.log"

  wait_health
  cmd_status
}

start_one() {
  local name="$1" pid_file="$2" cmd="$3" log_file="$4"
  if [[ -f "$pid_file" ]] && kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    log "$name already running (pid $(cat "$pid_file"))"
    return
  fi
  log "Starting $name -> $log_file"
  # shellcheck disable=SC2086
  nohup env $cmd >"$log_file" 2>&1 &
  echo $! > "$pid_file"
}

wait_health() {
  local attempts="${HEALTH_TIMEOUT_ATTEMPTS:-60}"
  local i=0
  log "Waiting for API readiness ($HEALTH_URL)"
  until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
    i=$((i + 1))
    if (( i >= attempts )); then
      err "API did not become ready within ${attempts}s — tail of $LOG_DIR/api.log:"
      tail -15 "$LOG_DIR/api.log" >&2 || true
      exit 1
    fi
    sleep 1
  done
  log "API is ready"
}

cmd_stop() {
  local pid
  for name_pid in "API:$API_PID_FILE" "Worker:$WORKER_PID_FILE"; do
    local name="${name_pid%%:*}" pid_file="${name_pid##*:}"
    if [[ -f "$pid_file" ]]; then
      pid="$(cat "$pid_file")"
      if kill -0 "$pid" 2>/dev/null; then
        log "Stopping $name (pid $pid)"
        kill "$pid" 2>/dev/null || true
        # Give it a moment, then force.
        for _ in $(seq 1 10); do kill -0 "$pid" 2>/dev/null || break; sleep 0.5; done
        kill -0 "$pid" 2>/dev/null && { warn "Force-stopping $name"; kill -9 "$pid" 2>/dev/null || true; }
      fi
      rm -f "$pid_file"
    fi
  done
  # The recorded PID is the npm wrapper; the actual `node dist/main.js` child can
  # survive it, so sweep by entrypoint path (covers relative and absolute argv).
  pkill -f 'dist/main.js' 2>/dev/null && log "Cleaned up orphaned app processes" || true
  log "Stopped"
}

cmd_restart() {
  cmd_stop
  cmd_start
}

cmd_status() {
  load_env
  local api_alive worker_alive
  api_alive="no"; worker_alive="no"
  [[ -f "$API_PID_FILE" ]] && kill -0 "$(cat "$API_PID_FILE")" 2>/dev/null && api_alive="yes"
  [[ -f "$WORKER_PID_FILE" ]] && kill -0 "$(cat "$WORKER_PID_FILE")" 2>/dev/null && worker_alive="yes"
  printf '%-8s %-12s %-12s\n' "SERVICE" "PID" "STATUS"
  printf '%-8s %-12s %-12s\n' "API"    "$(cat "$API_PID_FILE" 2>/dev/null || echo '-')"    "$api_alive"
  printf '%-8s %-12s %-12s\n' "Worker" "$(cat "$WORKER_PID_FILE" 2>/dev/null || echo '-')" "$worker_alive"
  if curl -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    log "Health: READY ($HEALTH_URL)"
  else
    warn "Health: NOT READY"
  fi
}

cmd_backup() {
  load_env
  bash scripts/backup-db.sh "${1:-manual}"
}

cmd_chromium() {
  load_env
  log "Installing local Chromium for PDF reports (Playwright)"
  npx playwright install chromium
}

cmd_full() {
  cmd_doctor
  cmd_install
  cmd_build
  cmd_migrate
  cmd_start
}

# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

main() {
  local cmd="${1:-usage}"
  shift || true
  case "$cmd" in
    doctor) cmd_doctor ;;
    install) cmd_install ;;
    build) cmd_build ;;
    migrate) cmd_migrate ;;
    start) cmd_start ;;
    stop) cmd_stop ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    backup) cmd_backup "${1:-manual}" ;;
    chromium) cmd_chromium ;;
    full) cmd_full ;;
    help|-h|--help) usage 0 ;;
    *) usage 1 ;;
  esac
}

main "$@"
