-- series_updated_at: the two Ch 1.4 tables keep updated_at through the 1.1
-- function (20261023195411_updated_at.sql).
-- Down (before series's):
--   drop trigger if exists series_sources_updated_at on public.series_sources;
--   drop trigger if exists series_updated_at on public.series;
CREATE TRIGGER series_updated_at BEFORE UPDATE ON public.series FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER series_sources_updated_at BEFORE UPDATE ON public.series_sources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
