-- content: a person's own half of the core model (Ch 1.1). Shelves with sections and
-- entries, occurrences, journal entries, copies. Every row reaches its owner, private by
-- default; a profile delete cascades through all of it, a catalog row restricts.
-- Down (after the updated_at Down; before 20261023194759_catalog's):
--   drop table if exists public.journal_entries;
--   drop table if exists public.shelf_entries;
--   drop table if exists public.shelf_sections;
--   drop table if exists public.copies;
--   drop table if exists public.occurrences;
--   drop table if exists public.shelves;
CREATE TABLE "copies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid NOT NULL,
	"edition" uuid NOT NULL,
	"condition" text,
	"acquired_on" date,
	"note" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copies_visibility" CHECK ("copies"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence" uuid NOT NULL,
	"written_at" timestamp with time zone DEFAULT now() NOT NULL,
	"body" text NOT NULL,
	"anchor_kind" text,
	"anchor_value" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_anchor_kind" CHECK ("journal_entries"."anchor_kind" is null or "journal_entries"."anchor_kind" in ('page', 'chapter', 'episode', 'issue')),
	CONSTRAINT "journal_entries_anchor" CHECK (("journal_entries"."anchor_kind" is null) = ("journal_entries"."anchor_value" is null)),
	CONSTRAINT "journal_entries_visibility" CHECK ("journal_entries"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
CREATE TABLE "occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid NOT NULL,
	"item" uuid NOT NULL,
	"status" text NOT NULL,
	"started_on" date,
	"finished_on" date,
	"stars" numeric(2, 1),
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occurrences_status" CHECK ("occurrences"."status" in ('in_progress', 'done', 'abandoned')),
	CONSTRAINT "occurrences_stars" CHECK ("occurrences"."stars" is null or ("occurrences"."stars" >= 0.5 and "occurrences"."stars" <= 5.0 and "occurrences"."stars" * 2 = trunc("occurrences"."stars" * 2))),
	CONSTRAINT "occurrences_visibility" CHECK ("occurrences"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
CREATE TABLE "shelf_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelf" uuid NOT NULL,
	"section" uuid,
	"item" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" text DEFAULT 'unmarked' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_entries_shelf_item" UNIQUE("shelf","item"),
	CONSTRAINT "shelf_entries_status" CHECK ("shelf_entries"."status" in ('unmarked', 'done', 'skipped')),
	CONSTRAINT "shelf_entries_visibility" CHECK ("shelf_entries"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
CREATE TABLE "shelf_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shelf" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelf_sections_shelf_name" UNIQUE("shelf","name"),
	CONSTRAINT "shelf_sections_id_shelf" UNIQUE("id","shelf")
);
--> statement-breakpoint
CREATE TABLE "shelves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source_url" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelves_visibility" CHECK ("shelves"."visibility" in ('private', 'unlisted', 'public'))
);
--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_owner_profiles_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copies" ADD CONSTRAINT "copies_edition_editions_id_fk" FOREIGN KEY ("edition") REFERENCES "public"."editions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_occurrence_occurrences_id_fk" FOREIGN KEY ("occurrence") REFERENCES "public"."occurrences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_owner_profiles_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occurrences" ADD CONSTRAINT "occurrences_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_shelf_shelves_id_fk" FOREIGN KEY ("shelf") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_item_items_id_fk" FOREIGN KEY ("item") REFERENCES "public"."items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_entries" ADD CONSTRAINT "shelf_entries_section_shelf_fk" FOREIGN KEY ("section","shelf") REFERENCES "public"."shelf_sections"("id","shelf") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelf_sections" ADD CONSTRAINT "shelf_sections_shelf_shelves_id_fk" FOREIGN KEY ("shelf") REFERENCES "public"."shelves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelves" ADD CONSTRAINT "shelves_owner_profiles_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;