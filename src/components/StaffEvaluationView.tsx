import React, { useState, useEffect } from 'react';
import { fetchEvaluations, saveEvaluation } from '@/lib/ownerApi';
import { EvaluationWithProfile } from '@/lib/supabase';
import { Loader2, Award, Star, Save, Check, Trophy } from 'lucide-react';

export function StaffEvaluationView() {
  const [evaluations, setEvaluations] = useState<EvaluationWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedSuccessId, setSavedSuccessId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchEvaluations();
      // 💡 取得データの総合スコアを単純加算 (勤務態度 + 指名度) に補正
      const updatedData = data.map((item: EvaluationWithProfile) => ({
        ...item,
        average_score: (Number(item.work_attitude) || 0) + (Number(item.nomination_score) || 0),
      }));
      setEvaluations(updatedData);
    } catch (e) {
      setError('評価データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleInputChange = (
    staffId: string,
    field: 'work_attitude' | 'nomination_score' | 'notes',
    value: string
  ) => {
    setEvaluations((prev) =>
      prev.map((item) => {
        if (item.staff_id !== staffId) return item;

        if (field === 'notes') {
          return { ...item, notes: value };
        }

        // 空文字（Backspace等で消した瞬間）の場合は一時的に空文字を許容
        if (value === '') {
          const updated = { ...item, [field]: '' as any };
          const w = field === 'work_attitude' ? 0 : Number(item.work_attitude) || 0;
          const n = field === 'nomination_score' ? 0 : Number(item.nomination_score) || 0;
          // 💡 単純加算（上限200）
          updated.average_score = w + n;
          return updated;
        }

        // 数値変換と 0〜100 の上限設定
        const parsed = parseInt(value, 10);
        const numVal = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed));

        const updated = { ...item, [field]: numVal };
        const w = field === 'work_attitude' ? numVal : Number(item.work_attitude) || 0;
        const n = field === 'nomination_score' ? numVal : Number(item.nomination_score) || 0;
        // 💡 単純加算（上限200）
        updated.average_score = w + n;

        return updated;
      })
    );
  };

  const handleSave = async (item: EvaluationWithProfile) => {
    setSavingId(item.staff_id);
    setError('');
    try {
      await saveEvaluation({
        staff_id: item.staff_id,
        work_attitude: Number(item.work_attitude) || 0,
        nomination_score: Number(item.nomination_score) || 0,
        notes: item.notes,
      });

      setSavedSuccessId(item.staff_id);
      setTimeout(() => setSavedSuccessId(null), 2000);

      // 保存後に順位を再計算するため再取得
      await loadData();
    } catch (e) {
      setError('保存に失敗しました');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-salon-mint-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {evaluations.map((item) => {
          const isTop3 = (item.rank || 99) <= 3;

          return (
            <div
              key={item.staff_id}
              className={`card p-4 transition-all border ${
                item.rank === 1
                  ? 'border-amber-300 bg-amber-50/30'
                  : item.rank === 2
                  ? 'border-slate-300 bg-slate-50/30'
                  : item.rank === 3
                  ? 'border-amber-600/30 bg-amber-900/5'
                  : 'border-salon-beige-100'
              }`}
            >
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-salon-beige-100">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                      item.rank === 1
                        ? 'bg-amber-400 text-white'
                        : item.rank === 2
                        ? 'bg-slate-300 text-slate-700'
                        : item.rank === 3
                        ? 'bg-amber-700 text-white'
                        : 'bg-salon-beige-100 text-salon-ink-600'
                    }`}
                  >
                    {isTop3 ? <Trophy className="w-3.5 h-3.5" /> : `${item.rank}位`}
                  </span>
                  <span className="text-sm font-bold text-salon-ink-800">
                    {item.staff_name}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs text-salon-beige-400 block">合計スコア</span>
                  <span className="text-base font-black text-salon-mint-600">
                    {item.average_score}{' '}
                    <span className="text-xs font-normal text-gray-400">/ 200 pt</span>
                  </span>
                </div>
              </div>

              {/* 評価入力欄 */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-xs text-salon-ink-600 font-medium flex items-center gap-1 mb-1">
                    <Award className="w-3.5 h-3.5 text-salon-mint-500" />
                    勤務態度 (上限100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.work_attitude}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      handleInputChange(item.staff_id, 'work_attitude', e.target.value)
                    }
                    className="w-full text-sm p-2 rounded-lg border border-salon-beige-200 focus:outline-none focus:border-salon-mint-400"
                  />
                </div>

                <div>
                  <label className="text-xs text-salon-ink-600 font-medium flex items-center gap-1 mb-1">
                    <Star className="w-3.5 h-3.5 text-amber-500" />
                    指名度 (上限100)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={item.nomination_score}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) =>
                      handleInputChange(
                        item.staff_id,
                        'nomination_score',
                        e.target.value
                      )
                    }
                    className="w-full text-sm p-2 rounded-lg border border-salon-beige-200 focus:outline-none focus:border-salon-mint-400"
                  />
                </div>
              </div>

              {/* オーナー用メモ */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="評価メモ・所感（オーナーのみ閲覧可）"
                  value={item.notes || ''}
                  onChange={(e) =>
                    handleInputChange(item.staff_id, 'notes', e.target.value)
                  }
                  className="w-full text-xs p-2 rounded-lg border border-salon-beige-200 bg-salon-beige-50/50 focus:outline-none focus:border-salon-mint-400"
                />
              </div>

              {/* 保存ボタン */}
              <div className="flex justify-end">
                <button
                  onClick={() => handleSave(item)}
                  disabled={savingId === item.staff_id}
                  className="btn-primary py-1.5 px-4 text-xs flex items-center gap-1.5"
                >
                  {savingId === item.staff_id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : savedSuccessId === item.staff_id ? (
                    <Check className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {savedSuccessId === item.staff_id ? '保存完了' : '評価を更新'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}