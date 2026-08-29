import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  fetchStaff,
  updateStaffName,
  updateStaffPassword,
  deleteStaff,
  createStaff,
  StaffMember,
} from '@/lib/ownerApi';
import { StaffEvaluationView } from './StaffEvaluationView';
import {
  AlertCircle,
  Plus,
  Loader2,
  Edit2,
  KeyRound,
  Trash2,
  Users,
  Settings,
} from 'lucide-react';

type StaffSubTab = 'list' | 'hours' | 'evaluation';

// 部屋と駐車場のマスター定義
const ROOM_OPTIONS = ['101', '401', '601', '602'];
const PARKING_OPTIONS = ['5', '15', '石田'];

export function StaffManageView() {
  const [staff, setStaff] = useState<(StaffMember & { fixed_room?: string | null; fixed_parking?: string | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showPasswordFor, setShowPasswordFor] = useState<string | null>(null);
  const [settingStaffId, setSettingStaffId] = useState<string | null>(null);
  const [error, setError] = useState('');

  // サブタブ管理と対象月管理の State
  const [subTab, setSubTab] = useState<StaffSubTab>('list');
  const [targetMonth, setTargetMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyHours, setMonthlyHours] = useState<
    { staff_id: string; name: string; totalHours: number }[]
  >([]);
  const [hoursLoading, setHoursLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // Supabaseから固定データを含むスタッフ情報を取得
    const { data } = await supabase.from('profiles').select('*');
    if (data) {
      setStaff(data);
    } else {
      const legacyData = await fetchStaff();
      setStaff(legacyData);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 固定配置の保存処理
  const handleSaveFixedAssignments = async (
    staffId: string,
    fixedRoom: string | null,
    fixedParking: string | null
  ) => {
    const { error } = await supabase
      .from('profiles')
      .update({
        fixed_room: fixedRoom || null,
        fixed_parking: fixedParking || null,
      })
      .eq('id', staffId);

    if (error) {
      setError(error.message);
    } else {
      setSettingStaffId(null);
      load();
    }
  };

  // 月間稼働時間の計算処理（集計）
  const loadMonthlyHours = useCallback(async () => {
    setHoursLoading(true);
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);

    const startDate = `${yearStr}-${monthStr}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${yearStr}-${monthStr}-${String(lastDay).padStart(2, '0')}`;

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
          endMinutes += 24 * 60;
        }

        const durationHours = (endMinutes - startMinutes) / 60;
        hoursMap[a.staff_id] = (hoursMap[a.staff_id] || 0) + durationHours;
      }
    });

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
      {/* メニュー切り替え用サブタブ */}
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
          <button
            onClick={() => setSubTab('evaluation')}
            className={`flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all ${
              subTab === 'evaluation'
                ? 'bg-white text-salon-ink-800 shadow-sm'
                : 'text-salon-beige-400 hover:text-salon-ink-800'
            }`}
          >
            スタッフ評価
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 1. スタッフ一覧表示 */}
      {subTab === 'list' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-salon-ink-800">登録スタッフ一覧</h2>
            <button
              onClick={() => setShowAdd(true)}
              className="btn-secondary flex items-center gap-1.5 py-2 px-3 text-sm"
            >
              <Plus className="w-4 h-4" /> 追加
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
            </div>
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
                        <button
                          onClick={() => setEditingId(null)}
                          className="btn-secondary py-2 px-4 text-sm"
                        >
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
                          
                          {/* 固定設定の表示ラベル */}
                          {s.role !== 'owner' && (s.fixed_room || s.fixed_parking) && (
                            <div className="flex gap-1.5 mt-1.5">
                              {s.fixed_room && (
                                <span className="text-[10px] bg-salon-beige-100 text-salon-ink-700 px-2 py-0.5 rounded-full">
                                  固定部屋: {s.fixed_room}
                                </span>
                              )}
                              {s.fixed_parking && (
                                <span className="text-[10px] bg-salon-beige-100 text-salon-ink-700 px-2 py-0.5 rounded-full">
                                  固定駐車場: {s.fixed_parking}
                                </span>
                              )}
                            </div>
                          )}

                          {s.role === 'owner' && (
                            <span className="inline-block text-xs text-salon-mint-600 bg-salon-mint-50 px-2 py-0.5 rounded mt-1">
                              オーナー
                            </span>
                          )}
                        </div>
                        {s.role !== 'owner' && (
                          <div className="flex gap-1">
                            {/* 固定設定ボタン */}
                            <button
                              onClick={() => setSettingStaffId(s.id)}
                              title="固定部屋・駐車場設定"
                              className="p-2 text-salon-ink-700 hover:bg-salon-beige-100 rounded-lg transition-colors"
                            >
                              <Settings className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingId(s.id);
                                setEditName(s.name);
                              }}
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
                  <p className="text-xs text-salon-beige-400 mt-1">
                    「追加」ボタンから登録してください
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 2. 月別スタッフ稼働時間リスト */}
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

          <h2 className="text-base font-bold text-salon-ink-800 mb-3">
            月間合計稼働時間（多い順）
          </h2>

          {hoursLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
            </div>
          ) : (
            <div className="space-y-2.5">
              {monthlyHours.map((item, rank) => (
                <div
                  key={item.staff_id}
                  className="card p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${
                        rank === 0
                          ? 'bg-amber-100 text-amber-700'
                          : rank === 1
                          ? 'bg-slate-100 text-slate-700'
                          : rank === 2
                          ? 'bg-amber-800/10 text-amber-900'
                          : 'bg-salon-beige-100 text-salon-beige-500'
                      }`}
                    >
                      {rank + 1}
                    </span>
                    <span className="text-sm font-medium text-salon-ink-800">
                      {item.name}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-base font-bold text-salon-mint-600">
                      {item.totalHours}
                    </span>
                    <span className="text-xs text-salon-beige-400 ml-1">時間</span>
                  </div>
                </div>
              ))}
              {monthlyHours.length === 0 && (
                <p className="text-sm text-salon-beige-400 text-center py-8">
                  対象のデータがありません
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* 3. スタッフ評価・ランキング */}
      {subTab === 'evaluation' && (
        <div className="mt-6">
          <h2 className="text-base font-bold text-salon-ink-800 mb-3">
            スタッフ評価・ランキング
          </h2>
          <StaffEvaluationView />
        </div>
      )}

      {showAdd && (
        <AddStaffModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            load();
          }}
          onError={setError}
        />
      )}

      {/* 固定配置設定モーダル */}
      {settingStaffId && (
        <FixedAssignmentModal
          staffMember={staff.find((s) => s.id === settingStaffId)!}
          allStaff={staff}
          onClose={() => setSettingStaffId(null)}
          onSave={handleSaveFixedAssignments}
        />
      )}
    </div>
  );
}

{/* 固定配置設定モーダルコンポーネント */}
function FixedAssignmentModal({
  staffMember,
  allStaff,
  onClose,
  onSave,
}: {
  staffMember: StaffMember & { fixed_room?: string | null; fixed_parking?: string | null };
  allStaff: (StaffMember & { fixed_room?: string | null; fixed_parking?: string | null })[];
  onClose: () => void;
  onSave: (staffId: string, room: string | null, parking: string | null) => Promise<void>;
}) {
  const [selectedRoom, setSelectedRoom] = useState<string>(staffMember.fixed_room || '');
  const [selectedParking, setSelectedParking] = useState<string>(staffMember.fixed_parking || '');
  const [saving, setSaving] = useState(false);

  // 自分以外のスタッフが既に使用している部屋・駐車場のリストを取得
  const occupiedRooms = allStaff
    .filter((s) => s.id !== staffMember.id && s.fixed_room)
    .map((s) => s.fixed_room);

  const occupiedParkings = allStaff
    .filter((s) => s.id !== staffMember.id && s.fixed_parking)
    .map((s) => s.fixed_parking);

  const handleSave = async () => {
    setSaving(true);
    await onSave(staffMember.id, selectedRoom || null, selectedParking || null);
    setSaving(false);
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-salon-ink-800 mb-1">
          固定割当設定
        </h3>
        <p className="text-xs text-salon-beige-400 mb-4">{staffMember.name} さんの固定配置</p>

        <div className="space-y-4">
          <div>
            <label className="label-text block mb-1">固定部屋</label>
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">指定なし</option>
              {ROOM_OPTIONS.map((room) => {
                const isOccupied = occupiedRooms.includes(room);
                return (
                  <option key={room} value={room} disabled={isOccupied}>
                    {room} {isOccupied ? '(使用中)' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          <div>
            <label className="label-text block mb-1">固定駐車場</label>
            <select
              value={selectedParking}
              onChange={(e) => setSelectedParking(e.target.value)}
              className="input-field text-sm"
            >
              <option value="">指定なし</option>
              {PARKING_OPTIONS.map((parking) => {
                const isOccupied = occupiedParkings.includes(parking);
                return (
                  <option key={parking} value={parking} disabled={isOccupied}>
                    {parking} {isOccupied ? '(使用中)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        <div className="flex gap-2 mt-6">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary flex-1 py-2.5 text-sm flex items-center justify-center gap-1"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (pw: string) => Promise<void>;
  onCancel: () => void;
}) {
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
        <button onClick={onCancel} className="btn-secondary py-2 px-4 text-sm">
          キャンセル
        </button>
      </div>
    </div>
  );
}

function AddStaffModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => void;
  onError: (e: string) => void;
}) {
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
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center px-4 z-50"
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-salon-ink-800 mb-4">スタッフ追加</h3>
        <div className="space-y-3">
          <div>
            <label className="label-text block mb-1">名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field"
              placeholder="山田花子"
            />
          </div>
          <div>
            <label className="label-text block mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field"
              placeholder="staff@example.com"
            />
          </div>
          <div>
            <label className="label-text block mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-field"
              placeholder="6文字以上"
            />
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="btn-secondary flex-1 py-2.5 text-sm">
            キャンセル
          </button>
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