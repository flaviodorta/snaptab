import { z } from 'zod';

// Cursor opaco de paginação. Só carrega o SK: o PK vem SEMPRE do JWT na hora
// da query — um cursor forjado nunca pagina a lista de outro usuário.
const cursorSchema = z.object({ sk: z.string().min(1) });

export function encodeCursor(sk: string): string {
  return Buffer.from(JSON.stringify({ sk }), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): string | null {
  try {
    const raw: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const parsed = cursorSchema.safeParse(raw);
    return parsed.success ? parsed.data.sk : null;
  } catch {
    return null;
  }
}
