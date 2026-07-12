import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { email, initializing } = useAuth();
  const location = useLocation();

  if (initializing) {
    return <p className="center-note">Carregando…</p>;
  }
  if (!email) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  return <>{children}</>;
}
