-- Discovered while adding upsert-based seeding for the V2.md Session 2 CredentialType
-- fields: this table had no unique constraint on `name` at all, so every `db:seed` re-run
-- (createMany + skipDuplicates, which needs a unique constraint to detect duplicates against)
-- silently inserted fresh copies of "Rabies Vaccination" etc. instead of skipping them.
-- Defensive dedup below in case any environment this runs against has already accumulated
-- duplicates the same way the long-lived local test container did; a no-op on a clean DB.

-- Repoint any CredentialRecord rows on a duplicate CredentialType to the row we're keeping
-- (earliest createdAt per name) before deleting the duplicates, so no completion history is
-- orphaned.
WITH ranked AS (
  SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "CredentialType"
),
keepers AS (
  SELECT r1.id AS duplicate_id, r2.id AS keeper_id
  FROM ranked r1
  JOIN ranked r2 ON r1.name = r2.name AND r2.rn = 1
  WHERE r1.rn > 1
)
UPDATE "CredentialRecord" cr
SET "credentialTypeId" = k.keeper_id
FROM keepers k
WHERE cr."credentialTypeId" = k.duplicate_id;

WITH ranked AS (
  SELECT id, name, ROW_NUMBER() OVER (PARTITION BY name ORDER BY "createdAt" ASC, id ASC) AS rn
  FROM "CredentialType"
)
DELETE FROM "CredentialType"
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX "CredentialType_name_key" ON "CredentialType"("name");
