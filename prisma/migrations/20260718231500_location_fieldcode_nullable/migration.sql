-- Fixes a gap left by the prior hand-written rename migration
-- (20260718230000_generalize_field_to_location): it renamed Field.code -> Location.fieldCode
-- but never dropped the NOT NULL constraint that column carried over from the
-- horse-only-turnout-fields era. schema.prisma has always declared `fieldCode String?` since
-- BARN_STALL/SICK_BAY/ARENA/OTHER locations don't have one — every existing row already has
-- a real value here (all pre-existing Location rows are FIELD type), so this is a pure
-- constraint relaxation, no backfill needed.
ALTER TABLE "Location" ALTER COLUMN "fieldCode" DROP NOT NULL;
