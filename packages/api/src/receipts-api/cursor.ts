import { z } from 'zod';

// Cursor opaco de paginação. Carrega só os sort keys (SK e, em queries pelo
// GSI1, o GSI1SK): os partition keys vêm SEMPRE do JWT na hora da query —
// um cursor forjado nunca pagina a lista de outro usuário.
const cursorSchema = z.object({
  sk: z.string().min(1),
  gsi1sk: z.string().min(1).optional(),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
