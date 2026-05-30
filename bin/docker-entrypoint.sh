#!/usr/bin/env bash
set -euo pipefail
# App-entrypoint: draai DB-migrations (idempotent, advisory-locked) vóór de
# server start. Hierdoor is "git pull + restart" genoeg om schema-wijzigingen
# door te zetten; geen handmatige migrate-stap meer nodig.
#
# Retry zodat een net-startende Postgres (compose depends_on race) niet meteen
# faalt.
ATTEMPTS="${MIGRATE_ATTEMPTS:-15}"
for i in $(seq 1 "$ATTEMPTS"); do
  if bun run /app/bin/migrate.ts; then
    break
  fi
  if [ "$i" -eq "$ATTEMPTS" ]; then
    echo "migrate: gaf op na ${ATTEMPTS} pogingen" >&2
    exit 1
  fi
  echo "migrate: DB nog niet klaar (poging ${i}/${ATTEMPTS}), retry in 2s" >&2
  sleep 2
done

exec "$@"
