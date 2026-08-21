import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Scissors, Loader2, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';

export default function LoginScreen() {
  const [mode, setMode] = useState<'staff' | 'owner'>('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(`ログインに失敗しました: ${error.message}`);
      }
    } catch (err: any) {
      setError(err.message || 'ログイン処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // 画面上で直接Supabaseにテストユーザーを作成する処理
  const handleSeed = async () => {
    setSeeding(true);
    setSeedResult('');
    setError('');

    const testUsers = [
      { email: 'owner@test.com', name: 'オーナー代表', role: 'owner' },
      { email: 'staff1@test.com', name: 'スタッフ1', role: 'staff' },
      { email: 'staff2@test.com', name: 'スタッフ2', role: 'staff' },
    ];

    try {
      for (const u of testUsers) {
        // 1. Supabase Auth にユーザーを作成
        const { data: authData, error: signUpError } = await supabase.auth.signUp({
          email: u.email,
          password: 'test123456',
        });

        if (signUpError && !signUpError.message.includes('already registered')) {
          console.warn(`SignUp warning for ${u.email}:`, signUpError.message);
        }

        const userId = authData?.user?.id;
        if (userId) {
          // 2. profiles テーブルにもロール情報を登録
          await supabase.from('profiles').upsert({
            id: userId,
            name: u.name,
            role: u.role,
          });
        }
      }

      setSeedResult('テストアカウントを作成しました！下のアカウントボタンを押してログインしてください。');
    } catch (e: any) {
      setError(`セットアップ失敗: ${e.message || String(e)}`);
    } finally {
      setSeeding(false);
    }
  };

  const fillAccount = (em: string) => {
    setEmail(em);
    setPassword('test123456');
    setMode(em === 'owner@test.com' ? 'owner' : 'staff');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-salon-beige-50 to-salon-mint-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-salon-mint-100 mb-4">
            <Scissors className="w-8 h-8 text-salon-mint-600" />
          </div>
          <h1 className="text-xl font-bold text-salon-ink-800">エステサロン</h1>
          <p className="text-sm text-salon-ink-700 mt-1">シフト管理システム</p>
        </div>

        <div className="card p-6">
          <div className="flex gap-2 mb-6 p-1 bg-salon-beige-100 rounded-xl">
            <button
              type="button"
              onClick={() => setMode('staff')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'staff'
                  ? 'bg-white text-salon-mint-600 shadow-sm'
                  : 'text-salon-ink-700'
              }`}
            >
              スタッフログイン
            </button>
            <button
              type="button"
              onClick={() => setMode('owner')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
                mode === 'owner'
                  ? 'bg-white text-salon-mint-600 shadow-sm'
                  : 'text-salon-ink-700'
              }`}
            >
              オーナーログイン
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label-text block mb-1.5">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="salon@example.com"
                className="input-field"
                required
                autoComplete="email"
              />
            </div>
            <div>
              <label className="label-text block mb-1.5">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'owner' ? 'オーナーとしてログイン' : 'スタッフとしてログイン'}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-salon-beige-100">
            <button
              onClick={handleSeed}
              disabled={seeding}
              className="w-full flex items-center justify-center gap-2 text-sm text-salon-mint-600 bg-salon-mint-50 rounded-xl py-2.5 transition-all active:scale-95 hover:bg-salon-mint-100"
            >
              {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              テストデータを初期化
            </button>
            {seedResult && (
              <div className="flex items-start gap-2 text-sm text-salon-mint-600 bg-salon-mint-50 rounded-xl px-4 py-3 mt-2">
                <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{seedResult}</span>
              </div>
            )}
            <div className="mt-3 space-y-1.5">
              <p className="text-xs text-salon-beige-400 text-center">テストアカウント（タップで入力）</p>
              <div className="flex flex-col gap-1.5">
                <button onClick={() => fillAccount('owner@test.com')} className="text-xs text-salon-ink-700 bg-salon-beige-50 rounded-lg py-2 px-3 text-left hover:bg-salon-beige-100 transition-colors">
                  オーナー: owner@test.com / test123456
                </button>
                <button onClick={() => fillAccount('staff1@test.com')} className="text-xs text-salon-ink-700 bg-salon-beige-50 rounded-lg py-2 px-3 text-left hover:bg-salon-beige-100 transition-colors">
                  スタッフ1: staff1@test.com / test123456
                </button>
                <button onClick={() => fillAccount('staff2@test.com')} className="text-xs text-salon-ink-700 bg-salon-beige-50 rounded-lg py-2 px-3 text-left hover:bg-salon-beige-100 transition-colors">
                  スタッフ2: staff2@test.com / test123456
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}