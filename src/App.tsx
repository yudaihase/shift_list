import { AuthProvider, useAuth } from '@/context/AuthContext';
import LoginScreen from '@/screens/LoginScreen';
import StaffScreen from '@/screens/StaffScreen';
import OwnerScreen from '@/screens/OwnerScreen';
import { Loader2 } from 'lucide-react';

function AppContent() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-salon-beige-50">
        <Loader2 className="w-8 h-8 animate-spin text-salon-mint-400" />
      </div>
    );
  }

  // 1. 未ログインならログイン画面
  if (!session) {
    return <LoginScreen />;
  }

  // 2. profile が取れている場合は role で判定
  if (profile?.role === 'owner') {
    return <OwnerScreen />;
  }
  if (profile?.role === 'staff') {
    return <StaffScreen />;
  }

  // 3. profile がまだ取得できていない場合のメールアドレスフォールバック判定
  const email = session.user.email;
  if (email === 'owner@test.com') {
    return <OwnerScreen />;
  }

  // デフォルトはスタッフ画面を表示
  return <StaffScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}