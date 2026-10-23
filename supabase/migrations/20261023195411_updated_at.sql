-- updated_at: one function keeps updated_at on every Ch 1.1 table. profiles has no
-- updated_at (Deferral), so no trigger there.
-- Down (first; the content and catalog Downs follow):
--   drop trigger if exists items_updated_at on public.items;
--   drop trigger if exists item_books_updated_at on public.item_books;
--   drop trigger if exists item_comics_updated_at on public.item_comics;
--   drop trigger if exists item_sources_updated_at on public.item_sources;
--   drop trigger if exists item_relations_updated_at on public.item_relations;
--   drop trigger if exists editions_updated_at on public.editions;
--   drop trigger if exists edition_sources_updated_at on public.edition_sources;
--   drop trigger if exists edition_contents_updated_at on public.edition_contents;
--   drop trigger if exists franchises_updated_at on public.franchises;
--   drop trigger if exists franchise_sources_updated_at on public.franchise_sources;
--   drop trigger if exists item_franchises_updated_at on public.item_franchises;
--   drop trigger if exists shelves_updated_at on public.shelves;
--   drop trigger if exists shelf_sections_updated_at on public.shelf_sections;
--   drop trigger if exists shelf_entries_updated_at on public.shelf_entries;
--   drop trigger if exists occurrences_updated_at on public.occurrences;
--   drop trigger if exists journal_entries_updated_at on public.journal_entries;
--   drop trigger if exists copies_updated_at on public.copies;
--   drop function if exists public.set_updated_at();

-- Not security definer: it fires on public tables as whoever made the update.
CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_books_updated_at BEFORE UPDATE ON public.item_books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_comics_updated_at BEFORE UPDATE ON public.item_comics FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_sources_updated_at BEFORE UPDATE ON public.item_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_relations_updated_at BEFORE UPDATE ON public.item_relations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER editions_updated_at BEFORE UPDATE ON public.editions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER edition_sources_updated_at BEFORE UPDATE ON public.edition_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER edition_contents_updated_at BEFORE UPDATE ON public.edition_contents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER franchises_updated_at BEFORE UPDATE ON public.franchises FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER franchise_sources_updated_at BEFORE UPDATE ON public.franchise_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_franchises_updated_at BEFORE UPDATE ON public.item_franchises FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER shelves_updated_at BEFORE UPDATE ON public.shelves FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER shelf_sections_updated_at BEFORE UPDATE ON public.shelf_sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER shelf_entries_updated_at BEFORE UPDATE ON public.shelf_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER occurrences_updated_at BEFORE UPDATE ON public.occurrences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER journal_entries_updated_at BEFORE UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER copies_updated_at BEFORE UPDATE ON public.copies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
