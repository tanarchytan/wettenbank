#!/usr/bin/env bash
set -euo pipefail
# /etc/environment is default 0644 → wereldleesbaar. Schrijven + direct
# beperken tot root vóór andere processen kunnen lezen.
umask 077
printenv | grep -E '^(DATABASE_URL|SRU_BASE_URL|CF_API_TOKEN|CF_ZONE_ID|LOG_LEVEL|PUBLIC_BASE_URL)=' \
  > /etc/environment
chmod 600 /etc/environment
service cron start
echo "wetten worker: cron started, tailing logs"
exec tail -f /dev/null
