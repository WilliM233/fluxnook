-- film_tv_updated_at: the two Ch 1.2 tables keep updated_at through the 1.1
-- function (20261023195411_updated_at.sql).
-- Down (after covers_bucket's, before film_tv's):
--   drop trigger if exists item_tv_updated_at on public.item_tv;
--   drop trigger if exists item_films_updated_at on public.item_films;
CREATE TRIGGER item_films_updated_at BEFORE UPDATE ON public.item_films FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER item_tv_updated_at BEFORE UPDATE ON public.item_tv FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
