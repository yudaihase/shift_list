import React, { useState, useEffect, useCallback } from 'react';
import {
  supabase,
  Profile,
  ShiftRequest,
  ROOMS,
  Room,
  WEEKDAYS,
  formatDate,
  getWeekStart,
  getWeekDates,
  formatDateLabel,
  formatWeekLabel,
} from '@/lib/supabase';
import { saveAssignments, AssignmentResult, fetchEvaluations } from '@/lib/ownerApi';
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Wand2,
  Send,
  CheckCircle,
  AlertCircle,
  Calendar,
  Car,
  X,
} from 'lucide-react';

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  fixed_room?: Room | null;
  fixed_parking?: string | null;
};

// -------------------------------------------------------------
// Auto-assign: スタッフの固定部屋・固定駐車場を優先して割り当てる
// -------------------------------------------------------------
export function autoAssign(
  requests: ShiftRequest[],
  profiles: (Profile & { fixed_room?: string | null; fixed_parking?: string | null })[],
  dateStrings: string[],
  evaluations: Array<{ staff_id: string; rank?: number; average_score?: number }> = []
): AssignmentResult[] {
  // 評価順のマップを作成
  const rankMap = new Map<string, number>();
  evaluations.forEach((item, index) => {
    if (item.staff_id) {
      rankMap.set(item.staff_id, item.rank ?? index + 1);
    }
  });

  // スタッフを評価ランク順にソート
  const staffPool = profiles
    .filter((profile) => profile.role === 'staff')
    .sort((a, b) => {
      const aRank = rankMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rankMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return aRank - bRank;
    });

  const results: AssignmentResult[] = [];

  dateStrings.forEach((date) => {
    // 当日の出勤希望者（休みを除く）
    const dayRequests = requests.filter(
      (request) => request.request_date === date && !request.is_off
    );

    const requestedStaffIds = dayRequests
      .map((request) => request.staff_id)
      .filter((id): id is string => !!id);

    // 当日出勤するスタッフ一覧（評価順）
    const activeStaff = staffPool.filter(
      (profile) => requestedStaffIds.includes(profile.id) || !requestedStaffIds.length
    );

    const assignedStaffIds = new Set<string>();
    const roomMap = new Map<Room, { staff: (typeof activeStaff)[0]; req?: ShiftRequest }>();

    // -----------------------------------------------------------------
    // ステップ1: 固定部屋が設定されているスタッフを優先してその部屋に割り当て
    // -----------------------------------------------------------------
    for (const staff of activeStaff) {
      if (staff.fixed_room && ROOMS.includes(staff.fixed_room as Room)) {
        const targetRoom = staff.fixed_room as Room;
        // その部屋がまだ空いている場合のみ固定割り当て
        if (!roomMap.has(targetRoom)) {
          const req = dayRequests.find((r) => r.staff_id === staff.id);
          roomMap.set(targetRoom, { staff, req });
          assignedStaffIds.add(staff.id);
        }
      }
    }

    // -----------------------------------------------------------------
    // ステップ2: 固定部屋がない（または埋まっていた）スタッフを残りの部屋に評価順で割り当て
    // -----------------------------------------------------------------
    const unassignedStaff = activeStaff.filter((s) => !assignedStaffIds.has(s.id));
    let staffIdx = 0;

    for (const room of ROOMS) {
      if (roomMap.has(room)) continue; // すでに固定で埋まっている部屋はスキップ

      if (staffIdx < unassignedStaff.length) {
        const staff = unassignedStaff[staffIdx];
        const req = dayRequests.find((r) => r.staff_id === staff.id);
        roomMap.set(room, { staff, req });
        assignedStaffIds.add(staff.id);
        staffIdx++;
      }
    }

    // -----------------------------------------------------------------
    // ステップ3: 全部屋の結果を配列に整形
    // -----------------------------------------------------------------
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
          parking: staff.fixed_parking || null, // 固定駐車場があればセット
        });
      }
    }
  });

  return results;
}

// 駐車場オプションの定義
const PARKING_OPTIONS = ['5', '15', '石田'];

// 時間スロットの定義
const TIME_SLOTS_SHORT: string[] = (() => {
  const slots: string[] = [];
  for (let h = 12; h <= 23; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`);
    slots.push(`${String(h).padStart(2, '0')}:30`);
  }
  slots.push('00:00');
  return slots;
})();

// 時間の重複チェック用ヘルパー関数
function findOverlaps(requests: ShiftRequest[]): ShiftRequest[] {
  const overlaps: ShiftRequest[] = [];
  for (let i = 0; i < requests.length; i++) {
    for (let j = i + 1; j < requests.length; j++) {
      const r1 = requests[i];
      const r2 = requests[j];
      if (!r1.start_time || !r1.end_time || !r2.start_time || !r2.end_time) continue;

      // 時間帯の重複判定
      if (r1.start_time < r2.end_time && r1.end_time > r2.start_time) {
        if (!overlaps.some((x) => x.id === r1.id)) overlaps.push(r1);
        if (!overlaps.some((x) => x.id === r2.id)) overlaps.push(r2);
      }
    }
  }
  return overlaps;
}

type AssignSubTab = 'create' | 'table';

export function AssignView() {
  const [weekStart, setWeekStart] = useState(getWeekStart(new Date()));
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // 作成用（下書き）と確定表示用のステート
  const [editingAssignments, setEditingAssignments] = useState<AssignmentResult[]>([]);
  const [publishedAssignments, setPublishedAssignments] = useState<AssignmentResult[]>([]);

  const [loading, setLoading] = useState(true);
  const [autoRunning, setAutoRunning] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [showErrorModal, setShowErrorModal] = useState(false);

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

    const { data: assignData } = await supabase
      .from('shift_assignments')
      .select('*')
      .gte('assignment_date', startDateStr)
      .lte('assignment_date', endDateStr);

    if (assignData && assignData.length > 0) {
      // 全データを編集用（下書き）として読み込み
      const allAssignments: AssignmentResult[] = (assignData as any[]).map((a) => {
        const profile = profilesData?.find((p) => p.id === a.staff_id);
        return {
          date: a.assignment_date,
          room: a.room as Room,
          staff_id: a.staff_id,
          staff_name: profile?.name || null,
          start_time: a.start_time ? a.start_time.slice(0, 5) : null,
          end_time: a.end_time ? a.end_time.slice(0, 5) : null,
          parking: a.parking || null,
        };
      });
      setEditingAssignments(allAssignments);

      // status === 'published' (確定済み) のデータのみを確定タブ用ステートにセット
      const publishedOnly: AssignmentResult[] = (assignData as any[])
        .filter((a) => a.status === 'published')
        .map((a) => {
          const profile = profilesData?.find((p) => p.id === a.staff_id);
          return {
            date: a.assignment_date,
            room: a.room as Room,
            staff_id: a.staff_id,
            staff_name: profile?.name || null,
            start_time: a.start_time ? a.start_time.slice(0, 5) : null,
            end_time: a.end_time ? a.end_time.slice(0, 5) : null,
            parking: a.parking || null,
          };
        });
      setPublishedAssignments(publishedOnly);

      if (publishedOnly.length > 0) {
        setPublished(true);
      }
    } else {
      setEditingAssignments([]);
      setPublishedAssignments([]);
    }

    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftWeek = (delta: number) => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + delta * 7);
    setWeekStart(getWeekStart(d));
  };

  const handleAutoAssign = async () => {
  setAutoRunning(true);
  setError('');
  try {
    // 1. スタッフ評価データ（合計スコア）を取得
    const evaluations = await fetchEvaluations();

    // 2. DBから最新の profiles (fixed_room, fixed_parking を含む) を取得
    const { data: latestProfiles, error: profileError } = await supabase
      .from('profiles')
      .select('*');

    if (profileError) throw new Error(profileError.message);

    // Stateの profiles ではなく、DBから直接取得した latestProfiles を渡す
    const targetProfiles = latestProfiles && latestProfiles.length > 0 ? latestProfiles : profiles;

    // 3. 評価データおよび固定部屋・駐車場情報を含めて自動割り当てを実行
    const results = autoAssign(
      requests,
      targetProfiles,
      dateStrings,
      evaluations
    ) as AssignmentResult[];
    
    setEditingAssignments(results);
    await saveAssignments(results, 'draft');
  } catch (e) {
    setError(String(e instanceof Error ? e.message : e));
  }
  setAutoRunning(false);
};

  const handlePublish = async () => {
    if (editingAssignments.length === 0) return;

    const duplicates: string[] = [];
    const dateStaffMap = new Map<string, Set<string>>();

    for (const a of editingAssignments) {
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
      await saveAssignments(editingAssignments, 'published');
      setPublishedAssignments([...editingAssignments]);
      setPublished(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setShowErrorModal(true);
    }
    setPublishing(false);
  };

  const updateAssignment = (date: string, room: Room, patch: Partial<AssignmentResult>) => {
    setEditingAssignments((prev) => {
      const existing = prev.find((a) => a.date === date && a.room === room);
      if (existing) {
        return prev.map((a) => (a.date === date && a.room === room ? { ...a, ...patch } : a));
      }
      return [
        ...prev,
        {
          date,
          room,
          staff_id: null,
          staff_name: null,
          start_time: null,
          end_time: null,
          parking: null,
          ...patch,
        },
      ];
    });
    setPublished(false);
  };

  const handleSaveDraft = async () => {
    try {
      await saveAssignments(editingAssignments, 'draft');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  return (
    <div>
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

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => shiftWeek(-1)}
          className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-salon-ink-700" />
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-salon-ink-800">{formatWeekLabel(weekStart)}</p>
        </div>
        <button
          onClick={() => shiftWeek(1)}
          className="p-2 rounded-lg hover:bg-salon-beige-100 transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-salon-ink-700" />
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. シフト作成 タブ */}
      {subTab === 'create' && (
        <>
          <button
            onClick={handleAutoAssign}
            disabled={autoRunning || loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
          >
            {autoRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            シフト自動作成
          </button>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
            </div>
          ) : editingAssignments.length === 0 ? (
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
                  const dayAssignments = editingAssignments.filter((a) => a.date === dateStr);
                  const dayRequests = requests.filter(
                    (r) => r.request_date === dateStr && !r.is_off
                  );

                  const overlapList = findOverlaps(dayRequests);
                  const hasOverlap = overlapList.length > 0 || dayRequests.length > ROOMS.length;

                  return (
                    <div key={dateStr} className="card p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-sm font-bold">
                          {WEEKDAYS[i]}
                        </span>
                        <span className="text-sm font-medium text-salon-ink-800">
                          {formatDateLabel(date)}
                        </span>
                      </div>

                      {/* 重複ありリスト */}
                      {hasOverlap && (
                        <div className="mb-3 bg-amber-50 rounded-xl p-3">
                          <p className="text-xs text-amber-700 mb-1.5 font-medium">
                            希望シフト（重複あり）:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {dayRequests.map((r) => {
                              const p = profiles.find((pp) => pp.id === r.staff_id);
                              return (
                                <span
                                  key={r.id}
                                  className="text-xs text-amber-700 bg-white px-2 py-1 rounded-lg border border-amber-200"
                                >
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
                                  <div
                                    key={r.id}
                                    className="text-xs text-blue-900 bg-white p-2 rounded-lg border border-blue-200"
                                  >
                                    <span className="mr-2 text-blue-800">
                                      {p?.name || '不明'}:
                                    </span>
                                    <span>{r.note}</span>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* 部屋の割り当て行 */}
                      <div className="space-y-2">
                        {ROOMS.map((room) => {
                          const a = dayAssignments.find((x) => x.room === room);
                          return (
                            <RoomAssignmentRow
                              key={room}
                              room={room}
                              assignment={a}
                              profiles={profiles}
                              onChange={(patch) => updateAssignment(dateStr, room, patch)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

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
                    disabled={publishing || editingAssignments.length === 0}
                    className="btn-primary flex-1 flex items-center justify-center gap-2"
                  >
                    {publishing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    シフト確定・公開
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 2. シフト表（確定表示） タブ */}
      {subTab === 'table' && (
        <div>
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
            </div>
          ) : publishedAssignments.filter((a) => a.staff_id).length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar className="w-10 h-10 text-salon-beige-300 mx-auto mb-3" />
              <p className="text-sm text-salon-ink-700">この週の確定シフトはありません</p>
            </div>
          ) : (
            <div className="space-y-4">
              {weekDates.map((date, i) => {
                const dateStr = formatDate(date);
                const dayAssignments = publishedAssignments.filter(
                  (a) => a.date === dateStr && a.staff_id
                );

                return (
                  <div key={dateStr} className="card p-4">
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-salon-beige-100">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-salon-mint-100 text-salon-mint-600 text-xs font-bold">
                        {WEEKDAYS[i]}
                      </span>
                      <span className="text-sm font-bold text-salon-ink-800">
                        {formatDateLabel(date)}
                      </span>
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
                                  {room}号室
                                </span>
                                <span className="text-sm font-bold text-salon-ink-800">
                                  {a.staff_name || '名称未設定'}
                                </span>

                                {a.parking && (
                                  <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                                    <Car className="w-3 h-3" />
                                    {a.parking}
                                  </span>
                                )}
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

// 部屋の割り当て行コンポーネント
function RoomAssignmentRow({
  room,
  assignment,
  profiles,
  onChange,
}: {
  room: Room;
  assignment: AssignmentResult | undefined;
  profiles: Profile[];
  onChange: (patch: Partial<AssignmentResult>) => void;
}) {
  const staffOptions = profiles.filter((p) => p.role === 'staff');

  const startTimeVal = assignment?.start_time ? assignment.start_time.slice(0, 5) : '12:00';
  const endTimeVal = assignment?.end_time ? assignment.end_time.slice(0, 5) : '18:00';

  return (
    <div className="bg-salon-beige-50 rounded-xl p-2.5 space-y-2">
      {/* 1行目: 部屋番号 ＋ スタッフ選択 ＋ 駐車場選択 */}
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
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* 駐車場選択（スタッフ選択時のみ有効） */}
        {assignment?.staff_id && (
          <select
            value={assignment?.parking || ''}
            onChange={(e) => onChange({ parking: e.target.value || null })}
            className="input-field py-1.5 text-xs w-20 shrink-0 text-blue-700 bg-blue-50/50 border-blue-200"
          >
            <option value="">駐車場なし</option>
            {PARKING_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}

        {assignment?.staff_id && (
          <button
            onClick={() =>
              onChange({
                staff_id: null,
                staff_name: null,
                start_time: null,
                end_time: null,
                parking: null,
              })
            }
            className="p-1 text-salon-beige-400 hover:text-red-500 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 2行目: 勤務時間設定 */}
      {assignment?.staff_id && (
        <div className="flex items-center justify-end gap-2 pt-1 border-t border-salon-beige-100/60">
          <span className="text-xs text-salon-ink-700 mr-auto font-medium">勤務時間:</span>
          <select
            value={startTimeVal}
            onChange={(e) => onChange({ start_time: e.target.value })}
            className="input-field py-1 text-sm w-24 text-center px-1"
          >
            {TIME_SLOTS_SHORT.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <span className="text-salon-beige-400 text-xs">〜</span>
          <select
            value={endTimeVal}
            onChange={(e) => onChange({ end_time: e.target.value })}
            className="input-field py-1 text-sm w-24 text-center px-1"
          >
            {TIME_SLOTS_SHORT.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}