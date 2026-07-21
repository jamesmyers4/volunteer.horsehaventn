-- V3FIX.md: closes the follow-up flagged in the CredentialType.name migration comment.
-- FeedType/CareType/WorkType/MetricType had the identical gap — no unique constraint on
-- `name`, so prisma/seed.ts's createMany({ skipDuplicates: true }) had nothing to dedupe
-- against and silently inserted fresh duplicate rows on every re-run.
--
-- Unlike the CredentialType.name migration, this one does NOT include a defensive
-- dedup/repoint step. That was a deliberate call per V3FIX.md: any duplicates found should
-- be flagged for the user to resolve, not auto-merged by this migration. The local test
-- database was checked before writing this file and is clean on a single seed pass (see the
-- session summary for the one place duplicates did turn up, and how it was resolved). If
-- this fails on Neon with a unique-constraint violation, that means real duplicate rows
-- exist there — do not re-run this migration with dedup logic added unilaterally; check
-- which rows are duplicated and how they're referenced (FeedingBaseline.feedTypeId,
-- CareEntry.careTypeId / RecurringCareSchedule.careTypeId, CheckIn.workTypeId,
-- AnimalMetric.metricTypeId) before deciding how to consolidate them by hand.

CREATE UNIQUE INDEX "FeedType_name_key" ON "FeedType"("name");
CREATE UNIQUE INDEX "CareType_name_key" ON "CareType"("name");
CREATE UNIQUE INDEX "WorkType_name_key" ON "WorkType"("name");
CREATE UNIQUE INDEX "MetricType_name_key" ON "MetricType"("name");
