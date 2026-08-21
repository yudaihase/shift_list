/*
# Update profile trigger for owner bootstrap

1. Changes
- Modified handle_new_user() so the very first user created becomes the owner.
  Subsequent users are created as 'staff' (default).
- This allows the salon to bootstrap by having the first person sign up become the owner,
  who then creates staff accounts via the manage-staff edge function.

2. Security
- No policy changes. The trigger is SECURITY DEFINER and runs on auth.users insert.
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_owner boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE role = 'owner') INTO has_owner;
  INSERT INTO public.profiles (id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    CASE WHEN NOT has_owner THEN 'owner' ELSE 'staff' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
