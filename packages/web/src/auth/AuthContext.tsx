import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as cognito from './cognito';

interface AuthContextValue {
  email: string | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    // Sessão persistida no localStorage sobrevive a reload — mas só conta
    // se o token ainda é válido/renovável.
    void cognito.getIdToken().then((token) => {
      setEmail(token ? cognito.getCurrentEmail() : null);
      setInitializing(false);
    });
  }, []);

  const signIn = useCallback(async (emailInput: string, password: string) => {
    await cognito.signIn(emailInput, password);
    setEmail(cognito.getCurrentEmail());
  }, []);

  const signOut = useCallback(() => {
    cognito.signOut();
    setEmail(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      email,
      initializing,
      signIn,
      signUp: cognito.signUp,
      confirmSignUp: cognito.confirmSignUp,
      signOut,
    }),
    [email, initializing, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
