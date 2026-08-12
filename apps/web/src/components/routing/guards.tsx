import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui/spinner';

export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <PageLoader />;
  }
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

export function RedirectIfAuthed() {
  const { status } = useAuth();
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
