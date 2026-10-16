#!/usr/bin/env bash
# Deploy this repo to the netcup VPS as a new release.
#
#   ./deploy.sh            test locally, ship HEAD, switch, health-check
#   ./deploy.sh rollback   point current at the previous release
#   ./deploy.sh status     show releases and the PM2 process
#   flags: --dry-run (print remote commands, change nothing), --skip-tests
#
# Only committed, pushed code ships (git archive HEAD). On the VPS:
#   /srv/asikvestel/<app>/releases/<UTC timestamp>-<sha>/   newest 5 kept
#   /srv/asikvestel/<app>/shared/                           .env (+ data), symlinked into releases
#   /srv/asikvestel/<app>/current -> releases/<...>         what PM2 runs
# A deploy that doesn't come up healthy is rolled back and deleted.

set -euo pipefail

# --- this app ---------------------------------------------------------------
APP="bot"
PM2_NAME="asikvestel-bot"
RUN_DIR="."                    # folder in the repo that PM2 runs from and npm ci runs in
ENTRY="src/index.js"           # relative to RUN_DIR
HEALTH=""                      # URL that must answer < 500 after the reload, or empty
SHARED=".env"                  # names symlinked from shared/ into the release root
OLD_DIR="/var/www/asikvestel-bot"
# Storage paths that must be absolute in shared/.env. The code falls back to
# paths relative to itself, which in a release folder would be an empty
# per-release dir that gets deleted with the release.
NEED_ENV="DB_PATH VAULT_STORAGE_DIR"
SMOKE=""                  # run locally from the repo root after a successful deploy (no tokens, read-only); empty = skip
# ----------------------------------------------------------------------------

VPS="root@62.83.32.164"
APP_BASE="/srv/asikvestel/$APP"
KEEP=5
REPO="$(cd "$(dirname "$0")" && pwd)"

die() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

CMD="deploy"
DRY_RUN=0
SKIP_TESTS=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY_RUN=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    deploy|rollback|status) CMD="$a" ;;
    *) sed -n '2,13p' "$0"; exit 1 ;;
  esac
done

remote() {
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] ssh $VPS <<'EOF'"; cat; echo "EOF"
  else
    ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS" bash -s
  fi
}

check_repo() {
  git -C "$REPO" diff --quiet && git -C "$REPO" diff --cached --quiet \
    || die "uncommitted changes; commit them first"
  git -C "$REPO" fetch -q origin
  local head upstream
  head="$(git -C "$REPO" rev-parse HEAD)"
  upstream="$(git -C "$REPO" rev-parse '@{u}' 2>/dev/null)" || die "this branch has no upstream"
  [ "$head" = "$upstream" ] || die "HEAD is not what's on GitHub; push (or pull) first so the deploy matches the repo"
}

cmd_deploy() {
  check_repo
  local sha release
  sha="$(git -C "$REPO" rev-parse --short HEAD)"
  release="$APP_BASE/releases/$(date -u +%Y%m%d-%H%M%S)-$sha"

  if [ "$SKIP_TESTS" -eq 0 ]; then
    log "Running tests locally"
    npm --prefix "$REPO/$RUN_DIR" test
  fi

  log "Checking $APP_BASE/shared on the VPS"
  remote <<EOF
set -euo pipefail
for name in $SHARED; do
  [ -e "$APP_BASE/shared/\$name" ] || { echo "missing $APP_BASE/shared/\$name"; exit 1; }
done
for key in $NEED_ENV; do
  val="\$(sed -n "s/^\$key=//p" "$APP_BASE/shared/.env" | tail -n 1 | tr -d "\"'")"
  case "\$val" in
    /*) [ -e "\$val" ] || [ -e "\$(dirname "\$val")" ] || { echo "\$key=\$val does not exist on the VPS"; exit 1; } ;;
    *) echo "\$key must be set to an absolute path in $APP_BASE/shared/.env"; exit 1 ;;
  esac
done
EOF

  log "Shipping $sha to $release"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "[dry-run] git archive HEAD | ssh $VPS tar -x -C $release"
  else
    ssh -o BatchMode=yes "$VPS" "mkdir -p '$release'"
    git -C "$REPO" archive --format=tar HEAD | ssh -o BatchMode=yes "$VPS" "tar -x -C '$release'"
  fi

  log "Installing, switching and checking on the VPS"
  remote <<EOF
set -euo pipefail
cd "$release"
for name in $SHARED; do
  rm -rf "./\$name"
  ln -s "$APP_BASE/shared/\$name" "./\$name"
done
(cd "$RUN_DIR" && npm ci --omit=dev --no-audit --no-fund)

prev="\$(readlink "$APP_BASE/current" 2>/dev/null || true)"
ln -sfn "$release" "$APP_BASE/current.tmp" && mv -T "$APP_BASE/current.tmp" "$APP_BASE/current"

run_cwd="\$(realpath -ms "$APP_BASE/current/$RUN_DIR")"   # symlink path, not resolved
pm_json() { pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const p=JSON.parse(s).find(x=>x.name===process.argv[1]);console.log(p?p.pm2_env[process.argv[2]]:"")})' "$PM2_NAME" "\$1"; }
start_fresh() { pm2 start "\$run_cwd/$ENTRY" --name "$PM2_NAME" --cwd "\$run_cwd"; }

if ! pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
  start_fresh
elif [ "\$(pm_json pm_cwd)" = "\$run_cwd" ]; then
  pm2 reload "$PM2_NAME" --update-env
else
  # First deploy after the old /var/www layout (or PM2 stored a resolved path):
  # re-create the process so it runs from current/. Causes a brief restart.
  echo "PM2 app $PM2_NAME runs from \$(pm_json pm_cwd); re-creating it from \$run_cwd"
  pm2 delete "$PM2_NAME"
  start_fresh
fi

rollback() {
  echo "Health check failed; rolling back"
  if [ -n "\$prev" ]; then
    ln -sfn "\$prev" "$APP_BASE/current.tmp" && mv -T "$APP_BASE/current.tmp" "$APP_BASE/current"
    pm2 reload "$PM2_NAME" --update-env
    rm -rf "$release"
    echo "Back on \$prev; removed the failed release"
  else
    echo "No earlier release to go back to. The old setup can be restarted with:"
    echo "  pm2 delete $PM2_NAME; pm2 start $OLD_DIR/$RUN_DIR/$ENTRY --name $PM2_NAME --cwd $OLD_DIR/$RUN_DIR"
  fi
  exit 1
}

sleep 5
pid="\$(pm2 pid "$PM2_NAME")"
[ -n "\$pid" ] && [ "\$pid" != "0" ] || rollback
# The running process must be on the new release, not a stale path.
[ "\$(readlink -f /proc/\$pid/cwd)" = "\$(readlink -f "\$run_cwd")" ] || { echo "process cwd is not the new release"; rollback; }
if [ -n "$HEALTH" ]; then
  code="\$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$HEALTH")" || code=000
  echo "health $HEALTH -> \$code"
  [ "\$code" != "000" ] && [ "\$code" -lt 500 ] || rollback
fi
restarts_before="\$(pm_json restart_time)"
sleep 10
restarts_after="\$(pm_json restart_time)"
[ "\$restarts_before" = "\$restarts_after" ] || { echo "process is crash-looping"; rollback; }

pm2 save >/dev/null
ls -1dt "$APP_BASE"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf
echo "Deployed $sha; now running \$(readlink "$APP_BASE/current")"
EOF

  if [ "$DRY_RUN" -eq 0 ] && [ -n "$SMOKE" ]; then
    log "Smoke test (local, read-only): $SMOKE"
    if ! (cd "$REPO" && eval "$SMOKE"); then
      echo "SMOKE TEST FAILED: the release is live. Look at the output above; './deploy.sh rollback' undoes it." >&2
      exit 1
    fi
  fi
}

cmd_rollback() {
  log "Rolling back to the previous release"
  remote <<EOF
set -euo pipefail
cur="\$(readlink -f "$APP_BASE/current")"
# The release just older than current (newest first, so the one listed after it).
prev="\$(ls -1dt "$APP_BASE"/releases/*/ | sed 's:/*$::' | grep -A1 -x "\$cur" | sed -n 2p)"
[ -n "\$prev" ] || { echo "no earlier release to roll back to"; exit 1; }
ln -sfn "\$prev" "$APP_BASE/current.tmp" && mv -T "$APP_BASE/current.tmp" "$APP_BASE/current"
pm2 reload "$PM2_NAME" --update-env
pm2 save >/dev/null
echo "Now running \$prev"
EOF
}

cmd_status() {
  remote <<EOF
echo "current -> \$(readlink "$APP_BASE/current" 2>/dev/null || echo none)"
ls -1t "$APP_BASE/releases" 2>/dev/null || echo "no releases"
pm2 describe "$PM2_NAME" 2>/dev/null | grep -E 'status|exec cwd|restarts|uptime' || echo "PM2 app $PM2_NAME not found"
EOF
}

"cmd_$CMD"
