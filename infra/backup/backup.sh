#!/usr/bin/env bash
# Daily encrypted Postgres backup (docs/06 6.1, infra/RUNBOOK.md §Backups).
#   backup.sh                       # dump, encrypt, keep locally, copy off the server
# A custom-format pg_dump is encrypted with age to the recipients in AGE_RECIPIENTS_FILE (public
# keys; the matching private key is NOT on the server), kept in BACKUP_DIR for KEEP_DAYS and
# copied with rclone to BACKUP_REMOTE (e.g. Cloudflare R2, free tier). Without a remote it only
# keeps the local copies.
set -euo pipefail

PGURL="${PGURL:-postgres://mohonaut@127.0.0.1:5432/mohonaut}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/mohonaut}"
AGE_RECIPIENTS_FILE="${AGE_RECIPIENTS_FILE:-/etc/mohonaut/backup-recipients.txt}"
BACKUP_REMOTE="${BACKUP_REMOTE:-}"
KEEP_DAYS="${KEEP_DAYS:-14}"
PG_DUMP="${PG_DUMP:-pg_dump}"

[[ -s "${AGE_RECIPIENTS_FILE}" ]] || {
  echo "no age recipients in ${AGE_RECIPIENTS_FILE}" >&2
  exit 1
}
install -d -m 0700 "${BACKUP_DIR}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="${BACKUP_DIR}/mohonaut-${stamp}.dump.age"
tmp="${file}.partial"
trap 'rm -f "${tmp}"' EXIT

# Streamed: the plaintext dump never touches the disk.
${PG_DUMP} --format=custom --no-owner --no-privileges --dbname="${PGURL}" |
  age --encrypt --recipients-file "${AGE_RECIPIENTS_FILE}" >"${tmp}"
mv "${tmp}" "${file}"
sha256sum "${file}" | awk '{print $1}' >"${file}.sha256"
echo "backup: ${file} ($(stat -c %s "${file}") bytes)"

if [[ -n "${BACKUP_REMOTE}" ]]; then
  rclone copy --no-traverse "${file}" "${BACKUP_REMOTE}"
  rclone copy --no-traverse "${file}.sha256" "${BACKUP_REMOTE}"
  echo "copied to ${BACKUP_REMOTE}"
fi

find "${BACKUP_DIR}" -name 'mohonaut-*.dump.age*' -mtime "+${KEEP_DAYS}" -delete
