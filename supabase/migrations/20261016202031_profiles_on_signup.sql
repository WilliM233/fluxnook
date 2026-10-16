-- profiles_on_signup: every new auth user gets a profiles row. Lives in a migration so
-- `supabase db reset` keeps it.
-- Down:
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists public.create_profile_for_new_user();

-- security definer: the insert into auth.users runs as supabase_auth_admin, which has no
-- grant on public.profiles. Empty search_path so every name below is schema-qualified.
CREATE FUNCTION public.create_profile_for_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id) VALUES (new.id);
  RETURN new;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_for_new_user();
