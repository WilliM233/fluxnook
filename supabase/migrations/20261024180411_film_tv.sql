-- film_tv: TMDB's first columns (Ch 1.2). Type `tv` with item_tv, item_films for
-- films, and summary and cover_path on items, which every type shares.
-- Down (after the covers_bucket and film_tv_updated_at Downs, before 1.1's; a show
-- can't satisfy the old checks, so the tv rows go first and their item_tv rows
-- and sources cascade):
--   delete from public.items where type = 'tv';
--   drop table public.item_tv;
--   drop table public.item_films;
--   alter table public.items drop column cover_path;
--   alter table public.items drop column summary;
--   alter table public.items drop constraint items_form_per_type;
--   alter table public.items add constraint items_form_per_type check (("items"."type" = 'film' and "items"."form" is null) or ("items"."type" = 'book' and "items"."form" is not null and "items"."form" in ('novel', 'novella', 'collection', 'story', 'series')) or ("items"."type" = 'comic' and "items"."form" is not null and "items"."form" in ('issue', 'one-shot', 'backup', 'collected', 'anthology')));
--   alter table public.items drop constraint items_type;
--   alter table public.items add constraint items_type check ("items"."type" in ('film', 'book', 'comic'));
CREATE TABLE "item_films" (
	"item" uuid PRIMARY KEY NOT NULL,
	"runtime_minutes" integer,
	"original_title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_tv" (
	"item" uuid PRIMARY KEY NOT NULL,
	"seasons" integer,
	"episodes" integer,
	"original_title" text,
	"first_aired" date,
	"last_aired" date,
	"ended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_type";--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_form_per_type";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "cover_path" text;--> statement-breakpoint
ALTER TABLE "item_films" ADD CONSTRAINT "item_films_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_tv" ADD CONSTRAINT "item_tv_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_type" CHECK ("items"."type" in ('film', 'book', 'comic', 'tv'));--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_form_per_type" CHECK (("items"."type" = 'film' and "items"."form" is null) or ("items"."type" = 'tv' and "items"."form" is null) or ("items"."type" = 'book' and "items"."form" is not null and "items"."form" in ('novel', 'novella', 'collection', 'story', 'series')) or ("items"."type" = 'comic' and "items"."form" is not null and "items"."form" in ('issue', 'one-shot', 'backup', 'collected', 'anthology')));