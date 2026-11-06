-- series: a provider's run of comics as a catalog table (Ch 1.4), with its
-- sources shaped as franchise_sources, and item_comics.series_id pointing at
-- it (restrict, as the catalog does). The series text column stays for
-- hand-entered runs. Appended: the 1.3 migration has reached dev.
-- Down (after series_updated_at's):
--   alter table public.item_comics drop constraint item_comics_series_id_series_id_fk;
--   alter table public.item_comics drop column series_id;
--   drop table public.series_sources;
--   drop table public.series;
CREATE TABLE "series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"volume" integer,
	"year_began" integer,
	"year_ended" integer,
	"publisher" text,
	"kind" text,
	"summary" text,
	"cover_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_kind" CHECK ("series"."kind" is null or "series"."kind" in ('ongoing', 'micro-series', 'mini-series', 'crossover', 'tie-in', 'minor'))
);
--> statement-breakpoint
CREATE TABLE "series_sources" (
	"series" uuid NOT NULL,
	"source" text NOT NULL,
	"key" text NOT NULL,
	"url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "series_sources_source_key_pk" PRIMARY KEY("source","key")
);
--> statement-breakpoint
ALTER TABLE "item_comics" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "series_sources" ADD CONSTRAINT "series_sources_series_series_id_fk" FOREIGN KEY ("series") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comics" ADD CONSTRAINT "item_comics_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE restrict ON UPDATE no action;