import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js';
import { config } from '../config';

// Wrapper fino sobre o amazon-cognito-identity-js: promisifica os callbacks
// e esconde os detalhes do SDK do resto do app. SRP acontece aqui dentro;
// tokens ficam no localStorage e o getSession renova com o refresh token.
const pool = new CognitoUserPool({
  UserPoolId: config.userPoolId,
  ClientId: config.userPoolClientId,
});

function userFor(email: string): CognitoUser {
  return new CognitoUser({ Username: email, Pool: pool });
}

export function signUp(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email })];
    pool.signUp(email, password, attributes, [], (err) => (err ? reject(err) : resolve()));
  });
}

export function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userFor(email).confirmRegistration(code, true, (err) => (err ? reject(err) : resolve()));
  });
}

export function signIn(email: string, password: string): Promise<void> {
  return new Promise((resolve, reject) => {
    userFor(email).authenticateUser(
      new AuthenticationDetails({ Username: email, Password: password }),
      {
        onSuccess: () => resolve(),
        onFailure: (err: Error) => reject(err),
        // Fluxos que exigem interação extra (troca de senha forçada, MFA)
        // estão fora do escopo do v1.
        newPasswordRequired: () => reject(new Error('troca de senha obrigatória não suportada')),
      },
    );
  });
}

export function signOut(): void {
  pool.getCurrentUser()?.signOut();
}

export function getCurrentEmail(): string | null {
  return pool.getCurrentUser()?.getUsername() ?? null;
}

// null = sem sessão válida (e sem como renovar). getSession renova sozinho
// tokens expirados usando o refresh token guardado.
export function getIdToken(): Promise<string | null> {
  const user = pool.getCurrentUser();
  if (!user) return Promise.resolve(null);
  return new Promise((resolve) => {
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session?.isValid()) resolve(null);
      else resolve(session.getIdToken().getJwtToken());
    });
  });
}
