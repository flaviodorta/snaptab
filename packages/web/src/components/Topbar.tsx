import { useQueryClient } from '@tanstack/react-query';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Topbar() {
  const { email, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function onLogout() {
    signOut();
    queryClient.clear(); // nada de dado de um usuário vazar pro próximo
    navigate('/login');
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1>Snaptab</h1>
        <nav className="topnav">
          <NavLink to="/" end>
            Recibos
          </NavLink>
          <NavLink to="/dashboard">Dashboard</NavLink>
        </nav>
      </div>
      <div className="topbar-right">
        <span className="user-email">{email}</span>
        <button className="ghost" onClick={onLogout}>
          Sair
        </button>
      </div>
    </header>
  );
}
