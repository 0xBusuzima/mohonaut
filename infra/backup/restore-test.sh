#!/usr/bin/env bash
# Restore test (docs/06 Kapı 6): proves the latest backup can be read back. Run it away from the
# production database, with the private age key at hand (founder laptop or CI):
#   restore-test.sh <backup.dump.age> <age-identity-file> <scratch-postgres-url> [<source-url>]
# Checks the file's checksum, decrypts, restores into the scratch database (dropped and created
# fresh), then compares row counts of every table with the source (when given) or prints them.
set -euo pipefail

BACKUP="${1:?backup file}"
IDENTITY="${2:?age identity file}"
SCRATCH="${3:?scratch postgres url}"
SOURCE="${4:-}"
PG_RESTORE="${PG_RESTORE:-pg_restore}"
PSQL="${PSQL:-psql}"

if [[ -f "${BACKUP}.sha256" ]]; then
  [[ "$(sha256sum "${BACKUP}" | awk '{print $1}')" == "$(cat "${BACKUP}.sha256")" ]] || {
    echo "checksum mismatch: ${BACKUP}" >&2
    exit 1
  }
fi

# Fresh scratch database: connect to its server's `postgres` database to recreate it.
# (URLs may carry a query, e.g. postgresql:///scratch?user=postgres for a local socket.)
base="${SCRATCH%%\?*}"
query="${SCRATCH#"${base}"}"
db="${base##*/}"
admin="${base%/*}/postgres${query}"
${PSQL} --quiet --dbname="${admin}" -c "DROP DATABASE IF EXISTS \"${db}\"" -c "CREATE DATABASE \"${db}\""

start=$(date +%s)
age --decrypt --identity "${IDENTITY}" "${BACKUP}" |
  ${PG_RESTORE} --no-owner --no-privileges --exit-on-error --dbname="${SCRATCH}"
echo "restored in $(($(date +%s) - start)) s"

counts() {
  ${PSQL} --quiet --tuples-only --no-align --dbname="$1" <<'SQL'
SELECT format('%s.%s=%s', schemaname, relname, n)
FROM (
  SELECT t.schemaname, t.relname,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM %I.%I', t.schemaname, t.relname),
                             false, true, '')))[1]::text::bigint AS n
  FROM pg_stat_user_tables t
) x
ORDER BY 1;
SQL
}

restored="$(counts "${SCRATCH}")"
[[ -n "${restored}" ]] || {
  echo "restored database has no tables" >&2
  exit 1
}
grep -q '^public.schema_migrations=' <<<"${restored}" || {
  echo "no schema_migrations table: not a Mohonaut backup?" >&2
  exit 1
}
if [[ -n "${SOURCE}" ]]; then
  if ! diff <(counts "${SOURCE}") <(echo "${restored}"); then
    echo "row counts differ from the source" >&2
    exit 1
  fi
  echo "row counts match the source ($(wc -l <<<"${restored}") tables)"
else
  echo "${restored}"
fi
