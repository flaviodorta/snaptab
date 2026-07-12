import type { z } from 'zod';
import { getIdToken } from '../auth/cognito';
import { config } from '../config';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Único caminho de acesso à API: injeta o JWT e valida a resposta com o
// schema de shared/ antes de entregar pro app (borda validada dos dois lados).
export async function apiFetch<Schema extends z.ZodType>(
  path: string,
  schema: Schema,
  init?: RequestInit,
): Promise<z.infer<Schema>> {
  const token = await getIdToken();
  if (!token) {
    throw new ApiError(401, 'sessão expirada — faça login de novo');
  }

  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: { ...init?.headers, authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `erro ${response.status}`;
    throw new ApiError(response.status, message);
  }

  return schema.parse(await response.json()) as z.infer<Schema>;
}
