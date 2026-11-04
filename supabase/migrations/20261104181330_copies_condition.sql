-- copies_condition: a copy's condition is one of five words or null (Ch 1.7,
-- A1), text with a check as every enumeration is. The five fixture copies have
-- null and pass. No index rides this (the census's C7). Nothing depends on it.
-- Down:
--   alter table public.copies drop constraint copies_condition;
ALTER TABLE "copies" ADD CONSTRAINT "copies_condition" CHECK ("copies"."condition" is null or "copies"."condition" in ('new', 'fine', 'good', 'fair', 'poor'));
