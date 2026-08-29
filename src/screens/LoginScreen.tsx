import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { usernameToEmail } from '@/lib/ownerApi';
import { Loader2, AlertCircle } from 'lucide-react';

export default function LoginScreen() {
  const [mode, setMode] = useState<'staff' | 'owner'>('staff');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // ユーザーIDをダミーメール形式（例: staff5@internal.local）に変換
      const email = usernameToEmail(username);

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError('ユーザーIDまたはパスワードが正しくありません');
      }
    } catch (err: any) {
      setError(err.message || 'ログイン処理中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gradient-to-b from-salon-beige-50 to-salon-mint-50 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-xl font-bold text-salon-ink-800">シフト確認・提出</h1>
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
              <label className="label-text block mb-1.5">ユーザーID</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ユーザーIDを入力"
                className="input-field"
                required
                autoComplete="username"
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

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'owner' ? 'オーナーとしてログイン' : 'スタッフとしてログイン'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}