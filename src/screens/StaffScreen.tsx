import { useState, useEffect } from 'react';
import { supabase, ShiftRequest, ShiftAssignment, WEEKDAYS, getWeekStart, getWeekDates, formatDate, formatDateLabel, formatWeekLabel, TIME_SLOTS } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { Calendar, Send, Check, Clock, LogOut, ChevronLeft, ChevronRight, X, Loader2, RotateCcw, Car } from 'lucide-react';

type DayRequest = {
  is_off: boolean;
  start_time: string;
  end_time: string;
  note: string;
};

const DEFAULT_START_TIME = '12:00';
const DEFAULT_END_TIME = '00:00';

const EMPTY_DAY: DayRequest = {
  is_off: false,
  start_time: DEFAULT_START_TIME,
  end_time: DEFAULT_END_TIME,
  note: '',
};

// DBから取得した時刻文字列 (例: "12:00:00") を <select> の値 ("12:00") に整形するヘルパー
const formatTimeSlot = (timeStr: string | null, fallback: string): string => {
  if (!timeStr) return fallback;
  const formatted = timeStr.slice(0, 5);
  return TIME_SLOTS.includes(formatted) ? formatted : fallback;
};

export default function StaffScreen() {
  const { profile, signOut } = useAuth();
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [requests, setRequests] = useState<Record<string, DayRequest>>({});
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<'request' | 'confirmed'>('request');

  const weekDates = getWeekDates(weekStart);

  useEffect(() => {
    let isMounted = true;

    const fetchWeekData = async () => {
      if (!profile) return;
      setLoading(true);
      setSaved(false);

      const currentDates = getWeekDates(weekStart);

      // 希望シフトの取得
      const { data: reqData } = await supabase
        .from('shift_requests')
        .select('*')
        .eq('staff_id', profile.id)
        .eq('week_start', weekStart);

      const map: Record<string, DayRequest> = {};
      (reqData || []).forEach((r: ShiftRequest) => {
        map[r.request_date] = {
          is_off: r.is_off,
          start_time: formatTimeSlot(r.start_time, DEFAULT_START_TIME),
          end_time: formatTimeSlot(r.end_time, DEFAULT_END_TIME),
          note: r.note || '',
        };
      });

      // 確定シフトの取得
      const { data: assignData } = await supabase
        .from('shift_assignments')
        .select('*')
        .eq('status', 'published')
        .eq('staff_id', profile.id)
        .gte('assignment_date', formatDate(currentDates[0]))
        .lte('assignment_date', formatDate(currentDates[6]));

      if (isMounted) {
        setRequests(map);
        setAssignments(assignData || []);
        setLoading(false);
      }
    };

    fetchWeekData();

    return () => {
      isMounted = false;
    };
  }, [profile, weekStart]);

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(getWeekStart(d));
  };

  const updateDay = (date: string, patch: Partial<DayRequest>) => {
    setRequests((prev) => ({
      ...prev,
      [date]: { ...(prev[date] || EMPTY_DAY), ...patch },
    }));
    setSaved(false);
  };

  // 💡 一括リセット処理
  const handleReset = () => {
    if (confirm('現在の入力内容を初期状態にリセットしますか？')) {
      const resetMap: Record<string, DayRequest> = {};
      weekDates.forEach((d) => {
        resetMap[formatDate(d)] = { ...EMPTY_DAY };
      });
      setRequests(resetMap);
      setSaved(false);
    }
  };

  const handleSubmit = async () => {
    if (!profile) return;
    setSaving(true);

    const rows = weekDates.map((d) => {
      const dateStr = formatDate(d);
      const req = requests[dateStr] || EMPTY_DAY;
      return {
        staff_id: profile.id,
        week_start: weekStart,
        request_date: dateStr,
        start_time: req.is_off ? null : req.start_time,
        end_time: req.is_off ? null : req.end_time,
        is_off: req.is_off,
        note: req.note || null,
      };
    });

    for (const row of rows) {
      await supabase
        .from('shift_requests')
        .upsert(row, { onConflict: 'staff_id,request_date' });
    }

    setSaving(false);
    setSaved(true);
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-salon-beige-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-salon-beige-400">エステサロン</p>
            <h1 className="text-base font-bold text-salon-ink-800">{profile?.name}さん</h1>
          </div>
          <button onClick={signOut} className="p-2 text-salon-ink-700 hover:text-salon-mint-600 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        {/* Tab switch */}
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          <button
            onClick={() => setView('request')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'request' ? 'bg-salon-mint-100 text-salon-mint-600' : 'text-salon-ink-700'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-1" /> シフト希望
          </button>
          <button
            onClick={() => setView('confirmed')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
              view === 'confirmed' ? 'bg-salon-mint-100 text-salon-mint-600' : 'text-salon-ink-700'
            }`}
          >
            <Check className="w-4 h-4 inline mr-1" /> 確定シフト
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {/* Week navigation & Reset button */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
            <ChevronLeft className="w-5 h-5 text-salon-ink-700" />
          </button>
          <div className="text-center">
            <p className="text-sm font-medium text-salon-ink-800">{formatWeekLabel(weekStart)}</p>
            <p className="text-xs text-salon-beige-400">水曜〜火曜</p>
          </div>
          <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
            <ChevronRight className="w-5 h-5 text-salon-ink-700" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
          </div>
        ) : view === 'request' ? (
          <>
            {/* 💡 一括リセットボタン */}
            <div className="flex justify-end mb-3">
              <button
                onClick={handleReset}
                className="flex items-center gap-1 text-xs font-medium text-salon-beige-500 hover:text-red-500 bg-salon-beige-50 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors border border-salon-beige-100"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                入力をリセット
              </button>
            </div>

            <div className="space-y-3">
              {weekDates.map((date, i) => {
                const dateStr = formatDate(date);
                const req = requests[dateStr] || EMPTY_DAY;
                return (
                  <div key={dateStr} className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-sm font-bold">
                          {WEEKDAYS[i]}
                        </span>
                        <span className="text-sm font-medium text-salon-ink-800">{formatDateLabel(date)}</span>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={req.is_off}
                          onChange={(e) => updateDay(dateStr, { is_off: e.target.checked })}
                          className="w-4 h-4 rounded accent-salon-mint-500"
                        />
                        <span className="text-sm text-salon-ink-700">休み</span>
                      </label>
                    </div>

                    {req.is_off ? (
                      <div className="flex items-center justify-center py-3 bg-salon-beige-50 rounded-xl text-salon-beige-400 text-sm">
                        <X className="w-4 h-4 mr-1" /> お休み
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-salon-beige-400 shrink-0" />
                          <select
                            value={req.start_time}
                            onChange={(e) => updateDay(dateStr, { start_time: e.target.value })}
                            className="input-field py-2 text-sm"
                          >
                            {TIME_SLOTS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <span className="text-salon-beige-400">〜</span>
                          <select
                            value={req.end_time}
                            onChange={(e) => updateDay(dateStr, { end_time: e.target.value })}
                            className="input-field py-2 text-sm"
                          >
                            {TIME_SLOTS.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </div>
                        <input
                          type="text"
                          value={req.note}
                          onChange={(e) => updateDay(dateStr, { note: e.target.value })}
                          placeholder="備考（任意）"
                          className="input-field py-2 text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-salon-beige-100 p-4">
              <div className="max-w-2xl mx-auto flex items-center gap-3">
                {saved && (
                  <span className="flex items-center text-sm text-salon-mint-600">
                    <Check className="w-4 h-4 mr-1" /> 送信済み
                  </span>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={saving}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  シフト希望を送信
                </button>
              </div>
            </div>
          </>
        ) : (
          <ConfirmedShifts assignments={assignments} weekDates={weekDates} />
        )}
      </main>
    </div>
  );
}

function ConfirmedShifts({ assignments, weekDates }: { assignments: (ShiftAssignment & { parking?: string })[]; weekDates: Date[] }) {
  return (
    <div className="space-y-3">
      {weekDates.map((date, i) => {
        const dateStr = formatDate(date);
        const dayAssignments = assignments.filter((a) => a.assignment_date === dateStr);

        return (
          <div key={dateStr} className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-sm font-bold">
                {WEEKDAYS[i]}
              </span>
              <span className="text-sm font-medium text-salon-ink-800">{formatDateLabel(date)}</span>
            </div>

            {dayAssignments.length > 0 ? (
              <div className="space-y-2">
                {dayAssignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between bg-salon-beige-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-salon-mint-600 bg-salon-mint-100 px-2 py-1 rounded">
                        {a.room}号室
                      </span>
                      <span className="text-sm text-salon-ink-800">
                        {a.start_time?.slice(0, 5)} 〜 {a.end_time?.slice(0, 5)}
                      </span>

                      {/* 💡 駐車場の表示 */}
                      {a.parking && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-1 rounded-md border border-blue-200">
                          <Car className="w-3.5 h-3.5" />
                          : {a.parking}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-3 bg-salon-beige-50 rounded-xl text-salon-beige-400 text-sm">
                <X className="w-4 h-4 mr-1" /> シフトなし
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}