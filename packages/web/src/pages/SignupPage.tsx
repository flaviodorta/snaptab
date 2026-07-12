import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

// Duas etapas: cadastro → código de confirmação enviado por email pelo
// Cognito. Confirmou? Faz login direto e cai na lista.
export function SignupPage() {
  const { signUp, confirmSignUp, signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUp(email, password);
      setStep('confirm');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no cadastro.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmSignUp(email, code);
      await signIn(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  }

  if (step === 'confirm') {
    return (
      <main className="auth-card">
        <h1>Confirme seu email</h1>
        <p className="subtitle">Enviamos um código pra {email}</p>
        <form onSubmit={(e) => void onConfirm(e)}>
          <label>
            Código de confirmação
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? 'Confirmando…' : 'Confirmar e entrar'}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="auth-card">
      <h1>Criar conta</h1>
      <p className="subtitle">Snaptab — despesas por foto</p>
      <form onSubmit={(e) => void onSignUp(e)}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </label>
        <label>
          Senha
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="hint">Mínimo 8 caracteres, com maiúscula, minúscula, número e símbolo.</p>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Criando…' : 'Criar conta'}
        </button>
      </form>
      <p className="switch-auth">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </main>
  );
}
