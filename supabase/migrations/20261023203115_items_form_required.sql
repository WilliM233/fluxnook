-- items_form_required: a book or comic must name its form. The catalog migration's
-- check let a null form through (a null check passes); Ch 1.1 B1.
-- Down (first, before the updated_at, content and catalog Downs; puts the old check back):
--   alter table public.items drop constraint items_form_per_type;
--   alter table public.items add constraint items_form_per_type check (("items"."type" = 'film' and "items"."form" is null) or ("items"."type" = 'book' and "items"."form" in ('novel', 'novella', 'collection', 'story', 'series')) or ("items"."type" = 'comic' and "items"."form" in ('issue', 'one-shot', 'backup', 'collected', 'anthology')));
ALTER TABLE "items" DROP CONSTRAINT "items_form_per_type";--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_form_per_type" CHECK (("items"."type" = 'film' and "items"."form" is null) or ("items"."type" = 'book' and "items"."form" is not null and "items"."form" in ('novel', 'novella', 'collection', 'story', 'series')) or ("items"."type" = 'comic' and "items"."form" is not null and "items"."form" in ('issue', 'one-shot', 'backup', 'collected', 'anthology')));