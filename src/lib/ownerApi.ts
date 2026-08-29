import {
  supabase,
  Profile,
  ShiftRequest,
  ShiftAssignment,
  ROOMS,
  Room,
  StaffEvaluation,
  EvaluationWithProfile,
} from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-staff`;

// 🔑 IDログイン用のダミードメイン設定
export const DUMMY_DOMAIN = '@internal.local';

/**
 * ユーザーIDをSupabase Auth用のメールアドレス形式に変換する
 */
export function usernameToEmail(username: string): string {
  const trimmed = username.trim();
  return trimmed.includes('@') ? trimmed : `${trimmed}${DUMMY_DOMAIN}`;
}

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  fixed_room?: Room | null;
  fixed_parking?: string | null;
};

/**
 * スタッフ一覧を取得（固定部屋・固定駐車場含む）
 */
export async function fetchStaff(): Promise<StaffMember[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('role', 'owner')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('スタッフ取得エラー:', error);
    return [];
  }

  return (data || []).map((p) => ({
    id: p.id,
    name: p.name || '名前未設定',
    email: p.email || '',
    role: p.role,
    fixed_room: p.fixed_room || null,
    fixed_parking: p.fixed_parking || null,
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

/**
 * スタッフ作成（ユーザーIDをメール形式に変換して処理）
 */
export async function createStaff(username: string, password: string, name: string) {
  const email = usernameToEmail(username);
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

// -------------------------------------------------------------
// Auto-Assign (シフト自動割り当て)
// -------------------------------------------------------------

export type AssignmentResult = {
  date: string;
  room: Room;
  staff_id: string | null;
  staff_name: string | null;
  start_time: string | null;
  end_time: string | null;
  parking?: string | null;
};

/**
 * 固定部屋・固定駐車場を優先しつつ、未割当枠を評価順に自動割り当て
 */
export function autoAssign(
  requests: ShiftRequest[],
  profiles: (Profile & { fixed_room?: string | null; fixed_parking?: string | null })[],
  dateStrings: string[],
  evaluations: Array<{ staff_id: string; rank?: number; average_score?: number }> = []
): AssignmentResult[] {
  const rankMap = new Map<string, number>();
  evaluations.forEach((item, index) => {
    if (item.staff_id) {
      rankMap.set(item.staff_id, item.rank ?? index + 1);
    }
  });

  // 評価ランク順にスタッフを並び替え
  const staffPool = profiles
    .filter((profile) => profile.role === 'staff')
    .sort((a, b) => {
      const aRank = rankMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rankMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });

  const results: AssignmentResult[] = [];

  dateStrings.forEach((date) => {
    // 当日の出勤希望（休み除く）
    const dayRequests = requests.filter(
      (request) => request.request_date === date && !request.is_off
    );

    const requestedStaffIds = dayRequests
      .map((request) => request.staff_id)
      .filter((id): id is string => !!id);

    // 当日出勤対象スタッフ
    const activeStaff = staffPool.filter(
      (profile) => requestedStaffIds.includes(profile.id) || !requestedStaffIds.length
    );

    const assignedStaffIds = new Set<string>();
    const roomMap = new Map<Room, { staff: (typeof activeStaff)[0]; req?: ShiftRequest }>();

    // 1. 固定部屋（fixed_room）が設定されているスタッフを優先配置
    for (const staff of activeStaff) {
      if (staff.fixed_room && ROOMS.includes(staff.fixed_room as Room)) {
        const targetRoom = staff.fixed_room as Room;
        if (!roomMap.has(targetRoom)) {
          const req = dayRequests.find((r) => r.staff_id === staff.id);
          roomMap.set(targetRoom, { staff, req });
          assignedStaffIds.add(staff.id);
        }
      }
    }

    // 2. 残りの部屋に未割当スタッフを評価順で配置
    const unassignedStaff = activeStaff.filter((s) => !assignedStaffIds.has(s.id));
    let staffIdx = 0;

    for (const room of ROOMS) {
      if (roomMap.has(room)) continue;

      if (staffIdx < unassignedStaff.length) {
        const staff = unassignedStaff[staffIdx];
        const req = dayRequests.find((r) => r.staff_id === staff.id);
        roomMap.set(room, { staff, req });
        assignedStaffIds.add(staff.id);
        staffIdx++;
      }
    }

    // 3. 結果の作成
    for (const room of ROOMS) {
      const assignment = roomMap.get(room);
      if (assignment) {
        const { staff, req } = assignment;
        const startTime = req?.start_time ? req.start_time.slice(0, 5) : '12:00';
        const endTime = req?.end_time ? req.end_time.slice(0, 5) : '18:00';

        results.push({
          date,
          room,
          staff_id: staff.id,
          staff_name: staff.name,
          start_time: startTime,
          end_time: endTime,
          parking: staff.fixed_parking || null, // 固定駐車場を割り当て
        });
      }
    }
  });

  return results;
}

/**
 * 割り当て結果の保存
 */
export async function saveAssignments(
  results: AssignmentResult[],
  mode: 'draft' | 'published'
): Promise<void> {
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
    parking: r.parking || null,
    status: mode,
  }));

  const { error } = await supabase.from('shift_assignments').upsert(rows, {
    onConflict: 'assignment_date,room',
  });

  if (error) throw new Error(error.message);
}

// -------------------------------------------------------------
// スタッフ評価関数群
// -------------------------------------------------------------

export async function fetchEvaluations(): Promise<EvaluationWithProfile[]> {
  const staffList = await fetchStaff();

  const { data: evalData, error } = await supabase
    .from('staff_evaluations')
    .select('*');

  if (error) {
    console.error('評価データ取得エラー:', error);
    throw new Error(error.message);
  }

  const evalMap = new Map<string, StaffEvaluation>();
  (evalData || []).forEach((e) => evalMap.set(e.staff_id, e));

  const results: EvaluationWithProfile[] = staffList.map((staff) => {
    const e = evalMap.get(staff.id);
    const workAttitude = e?.work_attitude ?? 0;
    const nominationScore = e?.nomination_score ?? 0;
    const avgScore = Math.round((workAttitude + nominationScore) / 2);

    return {
      id: e?.id,
      staff_id: staff.id,
      staff_name: staff.name,
      email: staff.email,
      work_attitude: workAttitude,
      nomination_score: nominationScore,
      notes: e?.notes || '',
      average_score: avgScore,
    };
  });

  results.sort((a, b) => {
    if (b.average_score !== a.average_score) {
      return b.average_score - a.average_score;
    }
    return b.work_attitude - a.work_attitude;
  });

  return results.map((item, idx) => ({
    ...item,
    rank: idx + 1,
  }));
}

export async function saveEvaluation(evaluation: StaffEvaluation): Promise<void> {
  const payload = {
    staff_id: evaluation.staff_id,
    work_attitude: evaluation.work_attitude,
    nomination_score: evaluation.nomination_score,
    notes: evaluation.notes || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('staff_evaluations').upsert(payload, {
    onConflict: 'staff_id',
  });

  if (error) {
    console.error('評価保存エラー:', error);
    throw new Error(error.message);
  }
}

export { Loader2 };