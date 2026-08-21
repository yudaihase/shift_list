import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const ws = getWeekStart(new Date());

    const testUsers = [
      { email: "owner@test.com", password: "test123456", name: "オーナー", role: "owner" },
      { email: "staff1@test.com", password: "test123456", name: "佐藤花子", role: "staff" },
      { email: "staff2@test.com", password: "test123456", name: "鈴木美咲", role: "staff" },
    ];

    const userIds: Record<string, string> = {};

    for (const u of testUsers) {
      // Check if user already exists
      const { data: existing } = await adminClient.auth.admin.listUsers();
      const found = existing?.users?.find((x: any) => x.email === u.email);

      if (found) {
        userIds[u.email] = found.id;
        // Update password to ensure it works
        await adminClient.auth.admin.updateUserById(found.id, {
          password: u.password,
          user_metadata: { name: u.name },
        });
      } else {
        const { data: created, error } = await adminClient.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { name: u.name },
        });
        if (error) throw new Error(`Failed to create ${u.email}: ${error.message}`);
        userIds[u.email] = created.user.id;
      }

      // Ensure profile exists with correct role
      await adminClient.from("profiles").upsert({
        id: userIds[u.email],
        name: u.name,
        role: u.role,
      }, { onConflict: "id" });
    }

    const staff1Id = userIds["staff1@test.com"];
    const staff2Id = userIds["staff2@test.com"];

    // Insert shift requests for staff1 (佐藤花子)
    const staff1Requests = [
      { date: 0, start: "12:00", end: "18:00", off: false },
      { date: 1, start: "14:00", end: "20:00", off: false },
      { date: 2, start: "12:00", end: "16:00", off: false },
      { date: 3, start: null, end: null, off: true },
      { date: 4, start: "12:00", end: "18:00", off: false },
      { date: 5, start: "15:00", end: "21:00", off: false },
      { date: 6, start: "12:00", end: "17:00", off: false },
    ];

    for (const r of staff1Requests) {
      const reqDate = addDays(ws, r.date);
      await adminClient.from("shift_requests").upsert({
        staff_id: staff1Id,
        week_start: ws,
        request_date: reqDate,
        start_time: r.off ? null : r.start,
        end_time: r.off ? null : r.end,
        is_off: r.off,
      }, { onConflict: "staff_id,request_date" });
    }

    // Insert shift requests for staff2 (鈴木美咲)
    const staff2Requests = [
      { date: 0, start: "15:00", end: "21:00", off: false },
      { date: 1, start: "12:00", end: "18:00", off: false },
      { date: 2, start: "16:00", end: "22:00", off: false },
      { date: 3, start: "12:00", end: "18:00", off: false },
      { date: 4, start: null, end: null, off: true },
      { date: 5, start: "12:00", end: "17:00", off: false },
      { date: 6, start: "14:00", end: "20:00", off: false },
    ];

    for (const r of staff2Requests) {
      const reqDate = addDays(ws, r.date);
      await adminClient.from("shift_requests").upsert({
        staff_id: staff2Id,
        week_start: ws,
        request_date: reqDate,
        start_time: r.off ? null : r.start,
        end_time: r.off ? null : r.end,
        is_off: r.off,
      }, { onConflict: "staff_id,request_date" });
    }

    // Insert published shift assignments
    const assignments = [
      { date: 0, room: "101", staffId: staff1Id, start: "12:00", end: "18:00" },
      { date: 0, room: "102", staffId: staff2Id, start: "15:00", end: "21:00" },
      { date: 1, room: "101", staffId: staff1Id, start: "14:00", end: "20:00" },
      { date: 1, room: "102", staffId: staff2Id, start: "12:00", end: "18:00" },
      { date: 2, room: "101", staffId: staff1Id, start: "12:00", end: "16:00" },
      { date: 2, room: "102", staffId: staff2Id, start: "16:00", end: "22:00" },
      { date: 3, room: "103", staffId: staff2Id, start: "12:00", end: "18:00" },
      { date: 4, room: "101", staffId: staff1Id, start: "12:00", end: "18:00" },
      { date: 5, room: "101", staffId: staff1Id, start: "15:00", end: "21:00" },
      { date: 5, room: "102", staffId: staff2Id, start: "12:00", end: "17:00" },
      { date: 6, room: "101", staffId: staff1Id, start: "12:00", end: "17:00" },
      { date: 6, room: "102", staffId: staff2Id, start: "14:00", end: "20:00" },
    ];

    for (const a of assignments) {
      const assignDate = addDays(ws, a.date);
      await adminClient.from("shift_assignments").upsert({
        assignment_date: assignDate,
        room: a.room,
        staff_id: a.staffId,
        start_time: a.start,
        end_time: a.end,
        status: "published",
      }, { onConflict: "assignment_date,room" });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Test data seeded successfully",
      accounts: testUsers.map(u => ({ email: u.email, password: u.password, role: u.role, name: u.name })),
      week_start: ws,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day - 3 + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
