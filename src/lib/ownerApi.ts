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

parking?: string | null; // 💡 駐車場プロパティを追加

};

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

parking: r.parking || null, // 💡 DB保存用payloadに parking を追加

status: mode,

}));



const { error } = await supabase.from('shift_assignments').upsert(rows, {

onConflict: 'assignment_date,room',

});



if (error) throw new Error(error.message);

}



// 💡 スタッフ評価一覧を取得（スコア順に自動ソート＋順位付与）

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



// 評価スコア（平均）の降順ソート。同点時は勤務態度を優先

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



// 💡 スタッフ評価の保存（upsert）

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