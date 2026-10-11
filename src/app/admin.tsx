import { Redirect } from 'expo-router';
import AdminApp from '@/components/admin/admin-app';
import { useAuth } from '@/contexts/auth-context';
export default function AdminScreen() {
  const { role, isReady } = useAuth();
  if (!isReady) return null;
  if (role !== 'admin') return <Redirect href="/login" />;
  return <AdminApp />;
}
