-- catalog: the shared half of the core model (Ch 1.1). Items and their type columns,
-- sources, relations, editions with contents, franchises. No visibility: every user
-- reads the same catalog, deduped on (source, key).
-- Down (after the content and updated_at Downs; the content tables reference these):
--   drop table if exists public.item_franchises;
--   drop table if exists public.franchise_sources;
--   drop table if exists public.edition_contents;
--   drop table if exists public.edition_sources;
--   drop table if exists public.item_relations;
--   drop table if exists public.item_sources;
--   drop table if exists public.item_comics;
--   drop table if exists public.item_books;
--   drop table if exists public.editions;
--   drop table if exists public.franchises;
--   drop table if exists public.items;
CREATE TABLE "edition_contents" (
	"edition" uuid NOT NULL,
	"item" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_contents_edition_item_pk" PRIMARY KEY("edition","item")
);
--> statement-breakpoint
CREATE TABLE "edition_sources" (
	"edition" uuid NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "edition_sources_source_key_pk" PRIMARY KEY("source","key")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item" uuid NOT NULL,
	"format" text NOT NULL,
	"title" text,
	"released_on" date,
	"released_precision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "editions_format" CHECK ("editions"."format" in ('floppy', 'tpb', 'hardcover', 'omnibus', 'paperback', 'ebook', 'audiobook', 'dvd', 'blu-ray', '4k', 'digital')),
	CONSTRAINT "editions_released" CHECK (("editions"."released_on" is null) = ("editions"."released_precision" is null)),
	CONSTRAINT "editions_released_precision" CHECK ("editions"."released_precision" is null or "editions"."released_precision" in ('day', 'month', 'year'))
);
--> statement-breakpoint
CREATE TABLE "franchise_sources" (
	"franchise" uuid NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "franchise_sources_source_key_pk" PRIMARY KEY("source","key")
);
--> statement-breakpoint
CREATE TABLE "franchises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_books" (
	"item" uuid PRIMARY KEY NOT NULL,
	"author" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_comics" (
	"item" uuid PRIMARY KEY NOT NULL,
	"series" text,
	"series_kind" text,
	"number" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_comics_series_kind" CHECK ("item_comics"."series_kind" is null or "item_comics"."series_kind" in ('ongoing', 'micro-series', 'mini-series', 'crossover', 'tie-in', 'minor'))
);
--> statement-breakpoint
CREATE TABLE "item_franchises" (
	"item" uuid NOT NULL,
	"franchise" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_franchises_item_franchise_pk" PRIMARY KEY("item","franchise")
);
--> statement-breakpoint
CREATE TABLE "item_relations" (
	"from_item" uuid NOT NULL,
	"to_item" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_relations_from_item_to_item_kind_pk" PRIMARY KEY("from_item","to_item","kind"),
	CONSTRAINT "item_relations_kind" CHECK ("item_relations"."kind" in ('adaptation-of', 'contained-in')),
	CONSTRAINT "item_relations_not_self" CHECK ("item_relations"."from_item" <> "item_relations"."to_item")
);
--> statement-breakpoint
CREATE TABLE "item_sources" (
	"item" uuid NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_sources_source_key_pk" PRIMARY KEY("source","key")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"form" text,
	"released_on" date,
	"released_precision" text,
	"source_note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_type" CHECK ("items"."type" in ('film', 'book', 'comic')),
	CONSTRAINT "items_form_per_type" CHECK (("items"."type" = 'film' and "items"."form" is null) or ("items"."type" = 'book' and "items"."form" in ('novel', 'novella', 'collection', 'story', 'series')) or ("items"."type" = 'comic' and "items"."form" in ('issue', 'one-shot', 'backup', 'collected', 'anthology'))),
	CONSTRAINT "items_released" CHECK (("items"."released_on" is null) = ("items"."released_precision" is null)),
	CONSTRAINT "items_released_precision" CHECK ("items"."released_precision" is null or "items"."released_precision" in ('day', 'month', 'year'))
);
--> statement-breakpoint
ALTER TABLE "edition_contents" ADD CONSTRAINT "edition_contents_edition_editions_id_fk" FOREIGN KEY ("edition") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_contents" ADD CONSTRAINT "edition_contents_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edition_sources" ADD CONSTRAINT "edition_sources_edition_editions_id_fk" FOREIGN KEY ("edition") REFERENCES "public"."editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "franchise_sources" ADD CONSTRAINT "franchise_sources_franchise_franchises_id_fk" FOREIGN KEY ("franchise") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_books" ADD CONSTRAINT "item_books_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comics" ADD CONSTRAINT "item_comics_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_franchises" ADD CONSTRAINT "item_franchises_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_franchises" ADD CONSTRAINT "item_franchises_franchise_franchises_id_fk" FOREIGN KEY ("franchise") REFERENCES "public"."franchises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_relations" ADD CONSTRAINT "item_relations_from_item_items_id_fk" FOREIGN KEY ("from_item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_relations" ADD CONSTRAINT "item_relations_to_item_items_id_fk" FOREIGN KEY ("to_item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_sources" ADD CONSTRAINT "item_sources_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;