import { describe, expect, it } from 'vitest';
import { receiptSchema } from './receipt';

// ULID válido de exemplo (26 chars, Crockford base32).
const ULID = '01J8ZQ7C3M9WXYZABCDEF01234';

const validReceipt = {
  receiptId: ULID,
  userId: 'user-123',
  s3Key: `user-123/${ULID}`,
  merchant: 'Padaria do Zé',
  totalCents: 4250,
  date: '2026-07-10',
  category: 'Alimentação',
  status: 'processed',
  createdAt: '2026-07-10T14:32:00.000Z',
  updatedAt: '2026-07-10T14:32:00.000Z',
};

describe('receiptSchema', () => {
  it('aceita um recibo válido', () => {
    const parsed = receiptSchema.parse(validReceipt);
    expect(parsed.totalCents).toBe(4250);
    expect(parsed.category).toBe('Alimentação');
  });

  it('rejeita total negativo', () => {
    expect(receiptSchema.safeParse({ ...validReceipt, totalCents: -1 }).success).toBe(false);
  });

  it('rejeita total em float (dinheiro é em centavos inteiros)', () => {
    expect(receiptSchema.safeParse({ ...validReceipt, totalCents: 42.5 }).success).toBe(false);
  });

  it('rejeita data fora do formato YYYY-MM-DD', () => {
    for (const date of ['10/07/2026', '2026-13-01', '2026-07-10T14:00:00Z', '']) {
      expect(receiptSchema.safeParse({ ...validReceipt, date }).success).toBe(false);
    }
  });

  it('rejeita categoria fora da união fechada', () => {
    expect(receiptSchema.safeParse({ ...validReceipt, category: 'Viagem' }).success).toBe(false);
  });

  it('rejeita receiptId que não é ULID', () => {
    for (const receiptId of ['abc', ULID.toLowerCase(), `${ULID}X`]) {
      expect(receiptSchema.safeParse({ ...validReceipt, receiptId }).success).toBe(false);
    }
  });

  it('rejeita campo obrigatório ausente', () => {
    const { merchant: _merchant, ...semMerchant } = validReceipt;
    expect(receiptSchema.safeParse(semMerchant).success).toBe(false);
  });
});
