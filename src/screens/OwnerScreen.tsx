import { useState, useEffect, useCallback } from 'react';
import { supabase, Profile, ShiftRequest, ShiftAssignment, ROOMS, Room, WEEKDAYS, getWeekStart, getWeekDates, formatDate, formatDateLabel, formatWeekLabel } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  fetchStaff, createStaff, updateStaffPassword, updateStaffName, deleteStaff,
  autoAssign, AssignmentResult, saveAssignments, StaffMember,
} from '@/lib/ownerApi';
import {
  Users, Calendar, LogOut, Plus, KeyRound, Trash2, Edit2, Loader2, Wand2,
  CheckCircle, Send, ChevronLeft, ChevronRight, X, AlertCircle, Clock,
} from 'lucide-react';

type Tab = 'requests' | 'assign' | 'staff';

export default function OwnerScreen() {
  const { profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-salon-beige-100">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-salon-beige-400">エステサロン</p>
            <h1 className="text-base font-bold text-salon-ink-800">オーナー管理画面</h1>
          </div>
          <button onClick={signOut} className="p-2 text-salon-ink-700 hover:text-salon-mint-600 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
        <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2">
          <TabButton active={tab === 'requests'} onClick={() => setTab('requests')} icon={<Calendar className="w-4 h-4" />} label="希望状況" />
          <TabButton active={tab === 'assign'} onClick={() => setTab('assign')} icon={<Wand2 className="w-4 h-4" />} label="シフト作成" />
          <TabButton active={tab === 'staff'} onClick={() => setTab('staff')} icon={<Users className="w-4 h-4" />} label="スタッフ管理" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4">
        {tab === 'requests' && <RequestsView />}
        {tab === 'assign' && <AssignView />}
        {tab === 'staff' && <StaffManageView />}
      </main>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
        active ? 'bg-salon-mint-100 text-salon-mint-600' : 'text-salon-ink-700'
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ============ Requests View ============
function RequestsView() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const weekDates = getWeekDates(weekStart);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: profilesData } = await supabase.from('profiles').select('*').order('name');
    setProfiles(profilesData || []);

    const { data: reqData } = await supabase
      .from('shift_requests')
      .select('*')
      .eq('week_start', weekStart);
    setRequests(reqData || []);
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const shiftWeek = (delta: number) => {
  const d = new Date(weekStart + 'T00:00:00');
  d.setDate(d.getDate() + delta * 7);
  setWeekStart(getWeekStart(d));
};

  const submittedIds = new Set(requests.map((r) => r.staff_id));
  const submittedCount = profiles.filter((p) => submittedIds.has(p.id)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-salon-ink-700" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-salon-ink-800">{formatWeekLabel(weekStart)}</p>
          <p className="text-xs text-salon-mint-600">回収状況: {submittedCount} / {profiles.length}名</p>
        </div>
        <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
          <ChevronRight className="w-5 h-5 text-salon-ink-700" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" /></div>
      ) : (
        <>
          {/* Submission status */}
          <div className="card p-4 mb-4">
            <h3 className="text-sm font-medium text-salon-ink-800 mb-3">シフト希望回収状況</h3>
            <div className="space-y-2">
              {profiles.map((p) => {
                const hasSubmitted = submittedIds.has(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between">
                    <span className="text-sm text-salon-ink-800">{p.name}</span>
                    {hasSubmitted ? (
                      <span className="flex items-center text-xs text-salon-mint-600 bg-salon-mint-50 px-2 py-1 rounded-lg">
                        <CheckCircle className="w-3.5 h-3.5 mr-1" /> 提出済み
                      </span>
                    ) : (
                      <span className="flex items-center text-xs text-salon-beige-400 bg-salon-beige-50 px-2 py-1 rounded-lg">
                        <Clock className="w-3.5 h-3.5 mr-1" /> 未提出
                      </span>
                    )}
                  </div>
                );
              })}
              {profiles.length === 0 && (
                <p className="text-sm text-salon-beige-400 text-center py-4">スタッフがいません</p>
              )}
            </div>
          </div>

          {/* Daily request overview with overlap display */}
          <h3 className="text-sm font-medium text-salon-ink-800 mb-2">日別希望一覧</h3>
          <div className="space-y-3">
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date);
              const dayRequests = requests.filter((r) => r.request_date === dateStr);
              if (dayRequests.length === 0) return null;

              // Check for time overlaps
              const overlaps = findOverlaps(dayRequests);

              return (
                <div key={dateStr} className={`card p-4 ${overlaps.length > 0 ? 'border-salon-mint-200' : ''}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-sm font-bold">
                      {WEEKDAYS[i]}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {dayRequests.map((r) => {
                      const profile = profiles.find((p) => p.id === r.staff_id);
                      return (
                        <div key={r.id} className="flex items-center justify-between bg-salon-beige-50 rounded-xl px-3 py-2">
                          <span className="text-sm text-salon-ink-800">{profile?.name || '不明'}</span>
                          {r.is_off ? (
                            <span className="text-xs text-salon-beige-400">お休み</span>
                          ) : (
                            <span className="text-sm text-salon-ink-700">
                              {r.start_time?.slice(0, 5)} 〜 {r.end_time?.slice(0, 5)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function findOverlaps(requests: ShiftRequest[]): ShiftRequest[][] {
  const groups: ShiftRequest[][] = [];
  const active = requests.filter((r) => !r.is_off && r.start_time && r.end_time);

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (active[i].start_time! < active[j].end_time! && active[i].end_time! > active[j].start_time!) {
        groups.push([active[i], active[j]]);
      }
    }
  }
  return groups;
}

// ============ Assign View ============
type AssignSubTab = 'create' | 'table';

function AssignView() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<AssignmentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);

  // 💡 サブタブ管理の State
  const [subTab, setSubTab] = useState<AssignSubTab>('create');

  const weekDates = getWeekDates(weekStart);
  const dateStrings = weekDates.map(formatDate);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setPublished(false);

    const currentWeekDates = getWeekDates(weekStart);
    const startDateStr = formatDate(currentWeekDates[0]);
    const endDateStr = formatDate(currentWeekDates[6]);

    const { data: profilesData } = await supabase.from('profiles').select('*').order('name');
    setProfiles(profilesData || []);

    const { data: reqData } = await supabase
      .from('shift_requests')
      .select('*')
      .eq('week_start', weekStart);
    setRequests(reqData || []);

    // Load existing draft/published assignments
    const { data: assignData } = await supabase
      .from('shift_assignments')
      .select('*')
      .gte('assignment_date', startDateStr)
      .lte('assignment_date', endDateStr);

    if (assignData && assignData.length > 0) {
      const existing: AssignmentResult[] = (assignData as ShiftAssignment[]).map((a) => {
        const profile = profilesData?.find((p) => p.id === a.staff_id);
        return {
          date: a.assignment_date,
          room: a.room as Room,
          staff_id: a.staff_id,
          staff_name: profile?.name || null,
          start_time: a.start_time ? a.start_time.slice(0, 5) : null,
          end_time: a.end_time ? a.end_time.slice(0, 5) : null,
        };
      });
      setAssignments(existing);
    } else {
      setAssignments([]);
    }

    setLoading(false);
  }, [weekStart]);

  useEffect(() => { load(); }, [load]);

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(getWeekStart(d));
  };

  const handleAutoAssign = async () => {
    setAutoRunning(true);
    setError('');
    const results = autoAssign(requests, profiles, dateStrings);
    setAssignments(results);
    try {
      await saveAssignments(results, 'draft');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
    setAutoRunning(false);
  };

  const handlePublish = async () => {
    if (assignments.length === 0) return;

    // 同日・同一人物の割り当て重複チェック
    const duplicates: string[] = [];
    const dateStaffMap = new Map<string, Set<string>>();

    for (const a of assignments) {
      if (a.staff_id) {
        if (dateStaffMap.has(a.date) && dateStaffMap.get(a.date)!.has(a.staff_id)) {
          const dateObj = new Date(a.date + 'T00:00:00');
          const dateLabel = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
          const name = a.staff_name || 'スタッフ';
          
          const msg = `${dateLabel} に ${name} さんが複数の部屋に重複して割り当てられています。`;
          if (!duplicates.includes(msg)) {
            duplicates.push(msg);
          }
        } else {
          if (!dateStaffMap.has(a.date)) {
            dateStaffMap.set(a.date, new Set());
          }
          dateStaffMap.get(a.date)!.add(a.staff_id);
        }
      }
    }

    if (duplicates.length > 0) {
      setError(duplicates.join('\n'));
      setShowErrorModal(true);
      return;
    }

    setPublishing(true);
    setError('');
    try {
      await saveAssignments(assignments, 'published');
      setPublished(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setShowErrorModal(true);
    }
    setPublishing(false);
  };

  const updateAssignment = (date: string, room: Room, patch: Partial<AssignmentResult>) => {
    setAssignments((prev) => {
      const existing = prev.find((a) => a.date === date && a.room === room);
      if (existing) {
        return prev.map((a) =>
          a.date === date && a.room === room ? { ...a, ...patch } : a
        );
      }
      return [...prev, { date, room, staff_id: null, staff_name: null, start_time: null, end_time: null, ...patch }];
    });
    setPublished(false);
  };

  const handleSaveDraft = async () => {
    try {
      await saveAssignments(assignments, 'draft');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div>
      {/* 💡 サブタブ（シフト作成 / シフト表） */}
      <div className="flex items-center justify-between mb-4 bg-salon-beige-50 p-1.5 rounded-xl border border-salon-beige-100">
        <button
          onClick={() => setSubTab('create')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
            subTab === 'create'
              ? 'bg-white text-salon-ink-800 shadow-sm'
              : 'text-salon-beige-400 hover:text-salon-ink-800'
          }`}
        >
          シフト作成
        </button>
        <button
          onClick={() => setSubTab('table')}
          className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
            subTab === 'table'
              ? 'bg-white text-salon-ink-800 shadow-sm'
              : 'text-salon-beige-400 hover:text-salon-ink-800'
          }`}
        >
          シフト表（確定）
        </button>
      </div>

      {/* 週切り替えナビゲーション */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftWeek(-1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
          <ChevronLeft className="w-5 h-5 text-salon-ink-700" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-salon-ink-800">{formatWeekLabel(weekStart)}</p>
        </div>
        <button onClick={() => shiftWeek(1)} className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors">
          <ChevronRight className="w-5 h-5 text-salon-ink-700" />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ---------------- 1. シフト作成 タブ ---------------- */}
      {subTab === 'create' && (
        <>
          <button
            onClick={handleAutoAssign}
            disabled={autoRunning || loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
          >
            {autoRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            シフト自動作成
          </button>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" /></div>
          ) : assignments.length === 0 ? (
            <div className="card p-8 text-center">
              <Wand2 className="w-10 h-10 text-salon-beige-300 mx-auto mb-3" />
              <p className="text-sm text-salon-ink-700">「シフト自動作成」ボタンで</p>
              <p className="text-sm text-salon-ink-700">自動割り当てを開始してください</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 pb-24">
                {weekDates.map((date, i) => {
                  const dateStr = formatDate(date);
                  const dayAssignments = assignments.filter((a) => a.date === dateStr);
                  const dayRequests = requests.filter((r) => r.request_date === dateStr && !r.is_off);
                  const hasOverlap = findOverlaps(requests.filter((r) => r.request_date === dateStr)).length > 0;

                  return (
                    <div key={dateStr} className="card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-sm font-bold">
                          {WEEKDAYS[i]}
                        </span>
                        <span className="text-sm font-medium text-salon-ink-800">{formatDateLabel(date)}</span>
                      </div>

                      {/* 重複ありリスト */}
                      {hasOverlap && (
                        <div className="mb-3 bg-amber-50 rounded-xl p-3">
                          <p className="text-xs text-amber-700 mb-1.5 font-medium">希望シフト（重複あり）:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {dayRequests.map((r) => {
                              const p = profiles.find((pp) => pp.id === r.staff_id);
                              return (
                                <span key={r.id} className="text-xs text-amber-700 bg-white px-2 py-1 rounded-lg border border-amber-200">
                                  {p?.name} {r.start_time?.slice(0, 5)}〜{r.end_time?.slice(0, 5)}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 希望シフト（備考あり）リスト */}
                      {dayRequests.some((r) => r.note && r.note.trim() !== '') && (
                        <div className="mb-3 bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <p className="text-xs text-blue-700 mb-1.5 font-medium flex items-center gap-1">
                            希望シフト（備考あり）:
                          </p>
                          <div className="space-y-1.5">
                            {dayRequests
                              .filter((r) => r.note && r.note.trim() !== '')
                              .map((r) => {
                                const p = profiles.find((pp) => pp.id === r.staff_id);
                                return (
                                  <div key={r.id} className="text-xs text-blue-900 bg-white p-2 rounded-lg border border-blue-200">
                                    <span className="mr-2 text-blue-800">{p?.name || '不明'}:</span>
                                    <span>{r.note}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Room assignments */}
                      <div className="space-y-2">
                        {ROOMS.map((room) => {
                          const a = dayAssignments.find((x) => x.room === room);
                          return (
                            <RoomAssignmentRow
                              key={room}
                              room={room}
                              assignment={a}
                              profiles={profiles}
                              date={dateStr}
                              onChange={(patch) => updateAssignment(dateStr, room, patch)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 下部固定アクションバー */}
              <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-salon-beige-100 p-4 z-40">
                <div className="max-w-2xl mx-auto flex items-center gap-3">
                  {published && (
                    <span className="flex items-center text-sm text-salon-mint-600">
                      <CheckCircle className="w-4 h-4 mr-1" /> 公開済み
                    </span>
                  )}
                  <button onClick={handleSaveDraft} className="btn-secondary flex items-center gap-2">
                    下書き保存
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={publishing || assignments.length === 0}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {publishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    シフト確定・公開
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ---------------- 2. シフト表（確定表示） タブ ---------------- */}
      {subTab === 'table' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" /></div>
          ) : assignments.filter((a) => a.staff_id).length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar className="w-10 h-10 text-salon-beige-300 mx-auto mb-3" />
              <p className="text-sm text-salon-ink-700">この週の割り当て済みシフトはありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              {weekDates.map((date, i) => {
                const dateStr = formatDate(date);
                const dayAssignments = assignments.filter((a) => a.date === dateStr && a.staff_id);

                return (
                  <div key={dateStr} className="card p-4">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-salon-beige-100">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-xs font-bold">
                        {WEEKDAYS[i]}
                      </span>
                      <span className="text-sm font-bold text-salon-ink-800">{formatDateLabel(date)}</span>
                    </div>

                    {dayAssignments.length === 0 ? (
                      <p className="text-xs text-salon-beige-400 py-2">シフト割り当てなし</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-2">
                        {ROOMS.map((room) => {
                          const a = dayAssignments.find((x) => x.room === room);
                          if (!a || !a.staff_id) return null;

                          return (
                            <div
                              key={room}
                              className="flex items-center justify-between p-2.5 rounded-xl bg-salon-beige-50 border border-salon-beige-100"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-salon-mint-700 bg-salon-mint-50 px-2 py-0.5 rounded-md border border-salon-mint-200">
                                  {room}
                                </span>
                                <span className="text-sm font-bold text-salon-ink-800">{a.staff_name || '名称未設定'}</span>
                              </div>
                              <span className="text-xs font-medium text-salon-ink-600 bg-white px-2.5 py-1 rounded-lg border border-salon-beige-200">
                                {a.start_time || '--:--'} 〜 {a.end_time || '--:--'}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* エラーポップアップ */}
      {showErrorModal && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in"
          onClick={() => setShowErrorModal(false)}
        >
          <div 
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-salon-ink-800">シフト確定エラー</h3>
            </div>

            <div className="text-sm text-salon-ink-700 whitespace-pre-line leading-relaxed bg-red-50 p-3 rounded-xl border border-red-100">
              {error}
            </div>

            <button
              onClick={() => setShowErrorModal(false)}
              className="btn-primary w-full py-2.5 text-sm font-bold"
            >
              確認して修正する
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RoomAssignmentRow({
  room,
  assignment,
  profiles,
  date,
  onChange,
}: {
  room: Room;
  assignment: AssignmentResult | undefined;
  profiles: Profile[];
  date: string;
  onChange: (patch: Partial<AssignmentResult>) => void;
}) {
  const staffOptions = profiles.filter((p) => p.role === 'staff');

  const startTimeVal = assignment?.start_time ? assignment.start_time.slice(0, 5) : '12:00';
  const endTimeVal = assignment?.end_time ? assignment.end_time.slice(0, 5) : '18:00';

  return (
    <div className="bg-salon-beige-50 rounded-xl p-2.5 space-y-2">
      {/* 1行目: 部屋番号 ＋ スタッフ選択 */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-salon-mint-600 bg-salon-mint-100 px-2 py-1 rounded shrink-0">
          {room}号室
        </span>
        <select
          value={assignment?.staff_id || ''}
          onChange={(e) => {
            const staffId = e.target.value || null;
            const p = profiles.find((pp) => pp.id === staffId);
            onChange({
              staff_id: staffId,
              staff_name: p?.name || null,
              start_time: startTimeVal,
              end_time: endTimeVal,
            });
          }}
          className="input-field py-1.5 text-sm flex-1 min-w-0"
        >
          <option value="">空き</option>
          {staffOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {assignment?.staff_id && (
          <button
            onClick={() => onChange({ staff_id: null, staff_name: null, start_time: null, end_time: null })}
            className="p-1 text-salon-beige-400 hover:text-red-500 transition-colors shrink-0 ml-auto"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2行目: 時間設定（スタッフが割り当てられている場合のみ表示） */}
      {assignment?.staff_id && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-salon-beige-100/60">
          <span className="text-xs text-salon-ink-700 mr-auto font-medium">勤務時間:</span>
          <select
            value={startTimeVal}
            onChange={(e) => onChange({ start_time: e.target.value })}
            className="input-field py-1 text-sm w-24 text-center px-1"
          >
            {TIME_SLOTS_SHORT.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-salon-beige-400 text-xs">〜</span>
          <select
            value={endTimeVal}
            onChange={(e) => onChange({ end_time: e.target.value })}
            className="input-field py-1 text-sm w-24 text-center px-1"
          >
            {TIME_SLOTS_SHORT.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}

const TIME_SLOTS_SHORT: string[] = (() => {
  const slots: string[] = [];
  for (let h = 12; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  slots.push('00:00');
  return slots;
})();

// ============ Staff Management View ============
type StaffSubTab = 'list' | 'hours';

function StaffManageView() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null);
  const [error, setError] = useState('');

  // 💡 サブタブ管理と対象月管理の State
  const [subTab, setSubTab] = useState<StaffSubTab>('list');
  const [targetMonth, setTargetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyHours, setMonthlyHours] = useState<{ staff_id: string; name: string; totalHours: number }[]>([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchStaff();
    setStaff(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 💡 月間稼働時間の計算処理（集計）
  const loadMonthlyHours = useCallback(async () => {
    setHoursLoading(true);
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    const startDate = `${yearStr}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

    // 月間のシフト割り当てデータを取得
    const { data: assignData } = await supabase
      .from('shift_assignments')
      .select('*')
      .gte('assignment_date', startDate)
      .lte('assignment_date', endDate);

    const hoursMap: Record<string, number> = {};

    (assignData || []).forEach((a) => {
      if (a.staff_id && a.start_time && a.end_time) {
        const [sh, sm] = a.start_time.split(':').map(Number);
        const [eh, em] = a.end_time.split(':').map(Number);

        let startMinutes = sh * 60 + sm;
        let endMinutes = eh * 60 + em;
        if (endMinutes <= startMinutes) {
          endMinutes += 24 * 60; // 日を跨ぐ場合の考慮
        }

        const durationHours = (endMinutes - startMinutes) / 60;
        hoursMap[a.staff_id] = (hoursMap[a.staff_id] || 0) + durationHours;
      }
    });

    // スタッフごとにマッピングして降順ソート
    const result = staff
      .filter((s) => s.role === 'staff')
      .map((s) => ({
        staff_id: s.id,
        name: s.name,
        totalHours: hoursMap[s.id] || 0,
      }))
      .sort((a, b) => b.totalHours - a.totalHours);

    setMonthlyHours(result);
    setHoursLoading(false);
  }, [targetMonth, staff]);

  useEffect(() => {
    if (subTab === 'hours') {
      loadMonthlyHours();
    }
  }, [subTab, loadMonthlyHours]);

  return (
    <div>
      {/* 💡 メニュー切り替え用サブタブ & 戻るボタン */}
      <div className="flex items-center justify-between mb-4 bg-salon-beige-50 p-1.5 rounded-xl border border-salon-beige-100">
        <div className="flex gap-1 flex-1">
          <button
            onClick={() => setSubTab('list')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
              subTab === 'list'
                ? 'bg-white text-salon-ink-800 shadow-sm'
                : 'text-salon-beige-400 hover:text-salon-ink-800'
            }`}
          >
            スタッフ一覧
          </button>
          <button
            onClick={() => setSubTab('hours')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
              subTab === 'hours'
                ? 'bg-white text-salon-ink-800 shadow-sm'
                : 'text-salon-beige-400 hover:text-salon-ink-800'
            }`}
          >
            スタッフ稼働時間
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ----------------- 1. スタッフ一覧表示 ----------------- */}
      {subTab === 'list' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-salon-ink-800">登録スタッフ一覧</h2>
            <button onClick={() => setShowAdd(true)} className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm">
              <Plus className="w-4 h-4" /> 追加
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" /></div>
          ) : (
            <div className="space-y-3">
              {staff.map((s) => (
                <div key={s.id} className="card p-4">
                  {editingId === s.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="input-field"
                        placeholder="名前"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await updateStaffName(s.id, editName);
                            setEditingId(null);
                            load();
                          }}
                          className="btn-primary flex-1 py-2 text-sm"
                        >
                          保存
                        </button>
                        <button onClick={() => setEditingId(null)} className="btn-secondary py-2 px-4 text-sm">
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-salon-ink-800">{s.name}</p>
                          <p className="text-xs text-salon-beige-400">{s.email}</p>
                          {s.role === 'owner' && (
                            <span className="inline-block text-xs text-salon-mint-600 bg-salon-mint-50 px-2 py-0.5 rounded mt-1">オーナー</span>
                          )}
                        </div>
                        {s.role !== 'owner' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => { setEditingId(s.id); setEditName(s.name); }}
                              className="p-2 text-salon-ink-700 hover:bg-salon-beige-100 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setShowPasswordFor(s.id)}
                              className="p-2 text-salon-ink-700 hover:bg-salon-beige-100 rounded-lg transition-colors"
                            >
                              <KeyRound className="w-4 h-4" />
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm(`「${s.name}」を削除しますか？`)) {
                                  await deleteStaff(s.id);
                                  load();
                                }
                              }}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      {showPasswordFor === s.id && (
                        <PasswordResetForm
                          onSubmit={async (pw) => {
                            await updateStaffPassword(s.id, pw);
                            setShowPasswordFor(null);
                          }}
                          onCancel={() => setShowPasswordFor(null)}
                        />
                      )}
                    </>
                  )}
                </div>
              ))}
              {staff.length === 0 && (
                <div className="card p-8 text-center">
                  <Users className="w-10 h-10 text-salon-beige-300 mx-auto mb-3" />
                  <p className="text-sm text-salon-ink-700">スタッフがいません</p>
                  <p className="text-xs text-salon-beige-400 mt-1">「追加」ボタンから登録してください</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ----------------- 2. 月別スタッフ稼働時間リスト ----------------- */}
      {subTab === 'hours' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <input
              type="month"
              value={targetMonth}
              onChange={(e) => setTargetMonth(e.target.value)}
              className="input-field text-xs py-1.5 px-3 w-auto font-medium"
            />
          </div>

          <h2 className="text-base font-bold text-salon-ink-800 mb-3">月間合計稼働時間（多い順）</h2>

          {hoursLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" /></div>
          ) : (
            <div className="space-y-2.5">
              {monthlyHours.map((item, rank) => (
                <div key={item.staff_id} className="card p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                      rank === 0 ? 'bg-amber-100 text-amber-700' :
                      rank === 1 ? 'bg-slate-100 text-slate-700' :
                      rank === 2 ? 'bg-amber-800/10 text-amber-900' : 'bg-salon-beige-100 text-salon-beige-500'
                    }`}>
                      {rank + 1}
                    </span>
                    <span className="text-sm font-medium text-salon-ink-800">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-salon-mint-600">{item.totalHours}</span>
                    <span className="text-xs text-salon-beige-400 ml-1">時間</span>
                  </div>
                </div>
              ))}
              {monthlyHours.length === 0 && (
                <p className="text-sm text-salon-beige-400 text-center py-8">対象のデータがありません</p>
              )}
            </div>
          )}
        </>
      )}

      {showAdd && (
        <AddStaffModal
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function PasswordResetForm({ onSubmit, onCancel }: { onSubmit: (pw: string) => Promise<void>; onCancel: () => void }) {
  const [pw, setPw] = useState('');
  const [saving, setSaving] = useState(false);

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-salon-beige-100">
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        placeholder="新しいパスワード"
        className="input-field py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={async () => {
            if (pw.length < 6) return;
            setSaving(true);
            await onSubmit(pw);
            setSaving(false);
          }}
          disabled={saving || pw.length < 6}
          className="btn-primary flex-1 py-2 text-sm flex items-center justify-center gap-1"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          パスワード更新
        </button>
        <button onClick={onCancel} className="btn-secondary py-2 px-4 text-sm">キャンセル</button>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onCreated, onError }: { onClose: () => void; onCreated: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name || !email || !password) return;
    setSaving(true);
    try {
      await createStaff(email, password, name);
      onCreated();
    } catch (e) {
      onError(String(e instanceof Error ? e.message : e));
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50" onClick={onClose}>
      <div className="card p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-bold text-salon-ink-800 mb-4">スタッフ追加</h3>
        <div className="space-y-3">
          <div>
            <label className="label-text block mb-1">名前</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="山田花子" />
          </div>
          <div>
            <label className="label-text block mb-1">メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="staff@example.com" />
          </div>
          <div>
            <label className="label-text block mb-1">パスワード</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="6文字以上" />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">キャンセル</button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name || !email || password.length < 6}
            className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
