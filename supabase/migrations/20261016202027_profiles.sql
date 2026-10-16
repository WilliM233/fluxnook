-- profiles: one row per auth user. Account data, so no visibility column (ch 0.2 Q2);
-- it arrives with the public profile.
-- Down (after 20261016202031's Down; the signup trigger inserts here, so dropping this
-- table first breaks every signup):
--   drop table if exists public.profiles;
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;