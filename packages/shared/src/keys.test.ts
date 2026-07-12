import { describe, expect, it } from 'vitest';
import {
  categorySk,
  dateGsi1Sk,
  parseReceiptObjectKey,
  receiptObjectKey,
  receiptSk,
  userPk,
} from './keys';

const ULID = '01J8ZQ7C3M9WXYZABCDEF01234';

describe('montagem de chaves DynamoDB', () => {
  it('gera os formatos do single-table design', () => {
    expect(userPk('user-123')).toBe('USER#user-123');
    expect(receiptSk(ULID)).toBe(`RECEIPT#${ULID}`);
    expect(categorySk('Mercado')).toBe('CAT#Mercado');
    expect(dateGsi1Sk('2026-07-10')).toBe('DATE#2026-07-10');
  });
});

describe('receiptObjectKey / parseReceiptObjectKey', () => {
  it('faz roundtrip montar → parsear', () => {
    const key = receiptObjectKey('user-123', ULID);
    expect(key).toBe(`user-123/${ULID}`);
    expect(parseReceiptObjectKey(key)).toEqual({ userId: 'user-123', receiptId: ULID });
  });

  it('retorna null para chaves fora do formato', () => {
    for (const key of [
      'sem-barra',
      `/${ULID}`, // userId vazio
      'user-123/', // receiptId vazio
      `user-123/${ULID}/extra`, // segmento a mais
      'user-123/nao-e-um-ulid', // receiptId inválido
    ]) {
      expect(parseReceiptObjectKey(key)).toBeNull();
    }
  });
});
