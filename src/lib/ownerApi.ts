import { supabase, Profile, ShiftRequest, ShiftAssignment, ROOMS, Room } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff`;

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export async function fetchStaff(): Promise<StaffMember[]> {
  // profiles テーブルから直接スタッフを取得（オーナー以外、または role が staff の人）
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'owner')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('スタッフ取得エラー:', error);
    return [];
  }

  // 型を合わせて返却
  return (data || []).map((p) => ({
    id: p.id,
    name: p.name || '名前未設定',
    email: '', // profiles に email がない場合は空文字
    role: p.role,
  }));
}

async function callEdgeFunction(path: string, body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error('セッションがありません');

  const res = await fetch(`${FUNCTION_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'エラーが発生しました');
  return json;
}

export async function createStaff(email: string, password: string, name: string) {
  return callEdgeFunction('/create', { email, password, name });
}

export async function updateStaffPassword(userId: string, password: string) {
  return callEdgeFunction('/update-password', { userId, password });
}

export async function updateStaffName(userId: string, name: string) {
  return callEdgeFunction('/update-name', { userId, name });
}

export async function deleteStaff(userId: string) {
  return callEdgeFunction('/delete', { userId });
}

// Auto-assign: distribute staff to rooms without time overlap per day
export type AssignmentResult = {
  date: string;
  room: Room;
  staff_id: string | null;
  staff_name: string | null;
  start_time: string | null;
  end_time: string | null;
};

export function autoAssign(
  requests: ShiftRequest[],
  profiles: Profile[],
  dates: string[]
): AssignmentResult[] {
  const results: AssignmentResult[] = [];

  for (const date of dates) {
    const dayRequests = requests.filter(
      (r) => r.request_date === date && !r.is_off && r.start_time && r.end_time
    );

    // Sort by start_time ascending for stable assignment
    dayRequests.sort((a, b) => (a.start_time! < b.start_time! ? -1 : 1));

    const rooms: Room[] = [...ROOMS];
    const roomAssignments: { room: Room; staff_id: string; start: string; end: string }[] = [];

    // Greedy assignment: assign each request to the first room where time doesn't overlap
    for (const req of dayRequests) {
      let assigned = false;
      for (const room of rooms) {
        const existing = roomAssignments.filter((a) => a.room === room);
        const overlap = existing.some(
          (a) => req.start_time! < a.end && req.end_time! > a.start
        );
        if (!overlap) {
          roomAssignments.push({
            room,
            staff_id: req.staff_id,
            start: req.start_time!,
            end: req.end_time!,
          });
          assigned = true;
          break;
        }
      }
      // If all rooms overlap, still assign to room with least overlap (best fit)
      if (!assigned && roomAssignments.length < rooms.length) {
        // find a room with no assignment at all
        for (const room of rooms) {
          if (!roomAssignments.some((a) => a.room === room)) {
            roomAssignments.push({
              room,
              staff_id: req.staff_id,
              start: req.start_time!,
              end: req.end_time!,
            });
            break;
          }
        }
      }
    }

    // Build results for all 4 rooms (empty rooms get null)
    for (const room of rooms) {
      const a = roomAssignments.find((x) => x.room === room);
      const profile = a ? profiles.find((p) => p.id === a.staff_id) : null;
      results.push({
        date,
        room,
        staff_id: a?.staff_id || null,
        staff_name: profile?.name || null,
        start_time: a?.start || null,
        end_time: a?.end || null,
      });
    }
  }

  return results;
}

export async function saveAssignments(
  results: AssignmentResult[],
  mode: 'draft' | 'published'
): Promise<void> {
  // Delete existing assignments for these dates, then insert new ones
  const dates = [...new Set(results.map((r) => r.date))];

  for (const date of dates) {
    await supabase.from('shift_assignments').delete().eq('assignment_date', date);
  }

  const rows = results.map((r) => ({
    assignment_date: r.date,
    room: r.room,
    staff_id: r.staff_id,
    start_time: r.start_time,
    end_time: r.end_time,
    status: mode,
  }));

  const { error } = await supabase.from('shift_assignments').upsert(rows, {
    onConflict: 'assignment_date,room',
  });

  if (error) throw new Error(error.message);
}

export { Loader2 };
