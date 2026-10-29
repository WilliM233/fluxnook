-- editions_publisher_pages: an edition's publisher and page count, which Open
-- Library brings with an ISBN (Ch 1.3). The ISBN itself is an edition_sources
-- row, so nothing else changes shape. Appended, not folded: the 1.2 files have
-- reached dev.
-- Down (any order relative to the 1.2 Downs; nothing later depends on it):
--   alter table public.editions drop constraint editions_pages;
--   alter table public.editions drop column pages;
--   alter table public.editions drop column publisher;
ALTER TABLE "editions" ADD COLUMN "publisher" text;--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN "pages" integer;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_pages" CHECK ("editions"."pages" is null or "editions"."pages" > 0);