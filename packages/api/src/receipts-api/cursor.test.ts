import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor de paginação', () => {
  it('faz roundtrip encode → decode (tabela e GSI1)', () => {
    const plain = { sk: 'RECEIPT#01J8ZQ7C3M9WXYZABCDEF01234' };
    expect(decodeCursor(encodeCursor(plain))).toEqual(plain);

    const gsi = { sk: 'RECEIPT#01J8ZQ7C3M9WXYZABCDEF01234', gsi1sk: 'DATE#2026-07-10' };
    expect(decodeCursor(encodeCursor(gsi))).toEqual(gsi);
  });

  it('retorna null pra cursor forjado ou corrompido', () => {
    for (const cursor of [
      'não-é-base64url!!!',
      Buffer.from('texto solto').toString('base64url'),
      Buffer.from('{"outraCoisa":1}').toString('base64url'),
      Buffer.from('{"sk":""}').toString('base64url'),
      '',
    ]) {
      expect(decodeCursor(cursor)).toBeNull();
    }
  });
});
