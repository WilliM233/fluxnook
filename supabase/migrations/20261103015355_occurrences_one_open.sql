-- occurrences_one_open: one open read per person and work (Ch 1.6, A1). A
-- second in_progress row for the same owner and item is a unique violation,
-- which the read routes answer as a 409, so the rule holds under a race.
-- Partial, so done and abandoned reads repeat freely. Nothing depends on it.
-- Down:
--   drop index public.occurrences_one_open;
CREATE UNIQUE INDEX "occurrences_one_open" ON "occurrences" USING btree ("owner","item") WHERE "occurrences"."status" = 'in_progress';
