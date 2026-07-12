import type { Category } from './category';
import { RECEIPT_ID_REGEX } from './receipt';

// Helpers puros para as chaves da tabela snaptab-main (ver CLAUDE.md §5).
// Toda montagem de PK/SK/GSI passa por aqui — nunca interpolar na mão.

export function userPk(userId: string): string {
  return `USER#${userId}`;
}

export function receiptSk(receiptId: string): string {
  return `RECEIPT#${receiptId}`;
}

export const RECEIPT_SK_PREFIX = 'RECEIPT#';

export function categorySk(category: Category): string {
  return `CAT#${category}`;
}

export const CATEGORY_SK_PREFIX = 'CAT#';

export function dateGsi1Sk(isoDate: string): string {
  return `DATE#${isoDate}`;
}

// Object key no S3: <userId>/<receiptId>. Também é a chave de idempotência do
// processor — reprocessar a mesma mensagem SQS regrava o mesmo item.
export function receiptObjectKey(userId: string, receiptId: string): string {
  return `${userId}/${receiptId}`;
}

export function parseReceiptObjectKey(
  key: string,
): { userId: string; receiptId: string } | null {
  const parts = key.split('/');
  if (parts.length !== 2) return null;
  const [userId, receiptId] = parts;
  if (!userId || !receiptId || !RECEIPT_ID_REGEX.test(receiptId)) return null;
  return { userId, receiptId };
}
