import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type Profile = {
  id: string;
  name: string;
  role: 'owner' | 'staff';
  created_at: string;
};

export type ShiftRequest = {
  id: string;
  staff_id: string;
  week_start: string;
  request_date: string;
  start_time: string | null;
  end_time: string | null;
  is_off: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type ShiftAssignment = {
  id: string;
  assignment_date: string;
  room: string;
  staff_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: 'draft' | 'published';
  created_at: string;
  updated_at: string;
};

// 💡 スタッフ評価用型定義
export type StaffEvaluation = {
  id?: string;
  staff_id: string;
  work_attitude: number;
  nomination_score: number;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
};

// 💡 画面表示用の評価＋プロフィールの結合型
export type EvaluationWithProfile = StaffEvaluation & {
  staff_name: string;
  email?: string;
  average_score: number; // 算出用 (work_attitude + nomination_score) / 2
  rank?: number;        // 順位
};

export const ROOMS = ['101', '401', '601', '602'] as const;
export type Room = (typeof ROOMS)[number];

// Salon week: Wednesday through next Tuesday
export const WEEKDAYS = ['水', '木', '金', '土', '日', '月', '火'] as const;

// 日付オブジェクトを YYYY-MM-DD 形式の文字列にする
export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 指定した日付が含まれる週の開始日（水曜日など）を取得する
export function getWeekStart(date: Date): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土
  
  // 水曜日(3)を基準とする場合 (水曜日始まり)
  const diff = (day < 3 ? day + 7 : day) - 3;
  d.setDate(d.getDate() - diff);
  
  return formatDate(d);
}

// weekStart（YYYY-MM-DD）から7日間の Date オブジェクト配列を生成する
export function getWeekDates(weekStartStr: string): Date[] {
  // 文字列分解で安全に Date オブジェクトを作成（タイムゾーンによるズレを防止）
  const [y, m, d] = weekStartStr.split('-').map(Number);
  const startDate = new Date(y, m - 1, d);
  
  const dates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const nextDate = new Date(y, m - 1, d + i);
    dates.push(nextDate);
  }
  return dates;
}

export function formatDateLabel(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${m}/${d}`;
}

export function formatWeekLabel(weekStart: string): string {
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
}

// Time slots: 12:00 to 00:00 (midnight) in 30-min increments
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  for (let h = 12; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  slots.push('00:00');
  return slots;
})();