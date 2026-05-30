#!/usr/bin/env bash
set -euo pipefail
# /etc/environment is default 0644 → wereldleesbaar. Schrijven + direct
# beperken tot root vóór andere processen kunnen lezen.
umask 077
printenv | grep -E '^(DATABASE_URL|CF_API_TOKEN|CF_ZONE_ID|LOG_LEVEL|PUBLIC_BASE_URL)=' \
  > /etc/environment
chmod 600 /etc/environment

# Schema bijwerken vóór cron-jobs draaien. Idempotent + advisory-locked, dus
# veilig naast de app-container die hetzelfde doet bij boot.
for i in $(seq 1 15); do
  if bun run /app/bin/migrate.ts; then break; fi
  if [ "$i" -eq 15 ]; then echo "migrate: gaf op na 15 pogingen" >&2; exit 1; fi
  echo "migrate: DB nog niet klaar (poging ${i}/15), retry in 2s" >&2
  sleep 2
done

service cron start
echo "wetten worker: cron started, tailing logs"
exec tail -f /dev/null
