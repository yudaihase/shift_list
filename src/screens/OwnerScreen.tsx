import { useState, useEffect, useCallback } from 'react';
import { supabase, Profile, ShiftRequest, WEEKDAYS, getWeekStart, getWeekDates, formatDate, formatDateLabel, formatWeekLabel } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
AssignmentResult as BaseAssignmentResult
} from '@/lib/ownerApi';
import {
  Users, Calendar, LogOut, Loader2, Wand2,
  CheckCircle, ChevronLeft, ChevronRight, Clock,
} from 'lucide-react';
import { AssignView } from '@/components/AssignView';
import { StaffManageView } from '@/components/StaffManageView';

// 駐車場型 & 選択肢（ベタ書き）
export type ParkingOption = '5' | '15' | '石田';
export const PARKING_OPTIONS: ParkingOption[] = ['5', '15', '石田'];

// AssignmentResult 型を拡張
export type AssignmentResult = BaseAssignmentResult & {
  parking?: string | null;
};

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
            </div>
          </div>

          <h3 className="text-sm font-medium text-salon-ink-800 mb-2">日別希望一覧</h3>
          <div className="space-y-3">
            {weekDates.map((date, i) => {
              const dateStr = formatDate(date);
              const dayRequests = requests.filter((r) => r.request_date === dateStr);
              if (dayRequests.length === 0) return null;

              return (
                <div key={dateStr} className="card p-4">
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

// ============ Assign View ============
export { AssignView };

// ============ Staff Management View ============
export { StaffManageView };