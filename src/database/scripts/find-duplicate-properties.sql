-- Read-only report of duplicate `properties` rows.
--
-- Background: until the intake orchestrator was fixed to find-or-create (see
-- DisputeIntakeOrchestrator.findOrCreateProperty), every dispute-case intake submission inserted a
-- fresh `properties` row, so a client submitting a second case for a property they already owned
-- ended up with two property rows instead of two cases on one.
--
-- This query exists to size up the rows that bug already created. It is deliberately SELECT-only:
-- merging duplicates means repointing `dispute_cases.property_id`, which must be reviewed by hand
-- before anything touches real data. Do NOT wrap this in a migration.
--
-- It also gates the follow-up ticket that adds the UNIQUE index on
-- (client_id, state, address_normalized): Postgres aborts unique-index creation while duplicates
-- exist, and every deploy target runs `npm run migration:run` as a deploy step, so this must come
-- back empty before that migration can ship.
--
--   docker exec nest_postgres psql -U postgres -d landtaxDisputeDb -f - < src/database/scripts/find-duplicate-properties.sql

SELECT
  p.client_id,
  c.name                              AS client_name,
  p.state,
  p.address_normalized,
  COUNT(*)                            AS duplicate_rows,
  COUNT(DISTINCT dc.id)               AS cases_attached,
  ARRAY_AGG(DISTINCT p.address)       AS address_variants,
  ARRAY_AGG(DISTINCT p.pid)           AS pid_variants,
  ARRAY_AGG(p.id ORDER BY p.created_at) AS property_ids
FROM properties p
JOIN clients c            ON c.id = p.client_id
LEFT JOIN dispute_cases dc ON dc.property_id = p.id
GROUP BY p.client_id, c.name, p.state, p.address_normalized
HAVING COUNT(*) > 1
ORDER BY duplicate_rows DESC, client_name;

-- Orphan properties — rows the pre-fix ordering bug left behind when a submitter unticked
-- "create dispute", plus anything left over from a failed mid-loop intake (submitIntakeApplication
-- is still non-transactional). Safe to review for deletion; nothing references them.
SELECT
  p.id,
  p.client_id,
  c.name AS client_name,
  p.address,
  p.created_at
FROM properties p
JOIN clients c ON c.id = p.client_id
WHERE NOT EXISTS (SELECT 1 FROM dispute_cases dc WHERE dc.property_id = p.id)
ORDER BY p.created_at DESC;
