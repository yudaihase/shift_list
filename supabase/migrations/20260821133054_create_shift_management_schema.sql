/*
# Esthetic Salon Shift Management Schema

1. New Tables
- profiles: Links to auth.users. Stores display name and role (owner/staff).
- shift_requests: Staff-submitted weekly shift preferences.
- shift_assignments: Owner-created room assignments.

2. Security
- RLS enabled on all tables.
- Ownership-based policies using auth.uid().
- Trigger auto-creates profile on signup; first user becomes owner.

3. Notes
- Week runs Wednesday to next Tuesday per salon requirement.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own_or_owner" ON profiles;
CREATE POLICY "profiles_select_own_or_owner" ON profiles FOR SELECT
  TO authenticated USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "profiles_update_owner_only" ON profiles;
CREATE POLICY "profiles_update_owner_only" ON profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "profiles_delete_owner_only" ON profiles;
CREATE POLICY "profiles_delete_owner_only" ON profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

CREATE TABLE IF NOT EXISTS shift_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  request_date date NOT NULL,
  start_time time,
  end_time time,
  is_off boolean NOT NULL DEFAULT false,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, request_date)
);

ALTER TABLE shift_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "requests_select_own_or_owner" ON shift_requests;
CREATE POLICY "requests_select_own_or_owner" ON shift_requests FOR SELECT
  TO authenticated USING (
    staff_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "requests_insert_own" ON shift_requests;
CREATE POLICY "requests_insert_own" ON shift_requests FOR INSERT
  TO authenticated WITH CHECK (staff_id = auth.uid());

DROP POLICY IF EXISTS "requests_update_own" ON shift_requests;
CREATE POLICY "requests_update_own" ON shift_requests FOR UPDATE
  TO authenticated USING (staff_id = auth.uid())
  WITH CHECK (staff_id = auth.uid());

DROP POLICY IF EXISTS "requests_delete_own" ON shift_requests;
CREATE POLICY "requests_delete_own" ON shift_requests FOR DELETE
  TO authenticated USING (staff_id = auth.uid());

CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_date date NOT NULL,
  room text NOT NULL CHECK (room IN ('101', '102', '103', '104')),
  staff_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  start_time time,
  end_time time,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_date, room)
);

ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignments_select_staff_published_owner_all" ON shift_assignments;
CREATE POLICY "assignments_select_staff_published_owner_all" ON shift_assignments FOR SELECT
  TO authenticated USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "assignments_insert_owner_only" ON shift_assignments;
CREATE POLICY "assignments_insert_owner_only" ON shift_assignments FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "assignments_update_owner_only" ON shift_assignments;
CREATE POLICY "assignments_update_owner_only" ON shift_assignments FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

DROP POLICY IF EXISTS "assignments_delete_owner_only" ON shift_assignments;
CREATE POLICY "assignments_delete_owner_only" ON shift_assignments FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'owner')
  );

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX IF NOT EXISTS idx_shift_requests_staff ON shift_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_shift_requests_week ON shift_requests(week_start);
CREATE INDEX IF NOT EXISTS idx_shift_requests_date ON shift_requests(request_date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(assignment_date);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_staff ON shift_assignments(staff_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
