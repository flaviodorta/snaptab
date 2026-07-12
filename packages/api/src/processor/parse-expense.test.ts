import { describe, expect, it } from 'vitest';
import ilegivel from './__fixtures__/ilegivel.json';
import mercado from './__fixtures__/mercado.json';
import padaria from './__fixtures__/padaria.json';
import { parseDateToIso, parseExpense, UNKNOWN_MERCHANT } from './parse-expense';

// parseMoneyToCents mora em shared/ (testado lá) — usado também pelo web.

describe('parseDateToIso', () => {
  it('aceita formatos comuns de recibo BR', () => {
    expect(parseDateToIso('10/07/2026')).toBe('2026-07-10');
    expect(parseDateToIso('10/07/2026 14:32:18')).toBe('2026-07-10');
    expect(parseDateToIso('10-07-2026')).toBe('2026-07-10');
    expect(parseDateToIso('10/07/26')).toBe('2026-07-10');
    expect(parseDateToIso('2026-07-10')).toBe('2026-07-10');
    expect(parseDateToIso('Emissao: 08/07/2026 - via consumidor')).toBe('2026-07-08');
  });

  it('rejeita datas inexistentes ou texto sem data', () => {
    expect(parseDateToIso('31/02/2026')).toBeNull();
    expect(parseDateToIso('99/99/9999')).toBeNull();
    expect(parseDateToIso('sem data aqui')).toBeNull();
  });
});

describe('parseExpense (fixtures do AnalyzeExpense)', () => {
  it('extrai mercado: total BR com milhar, data com hora', () => {
    expect(parseExpense(mercado)).toEqual({
      merchant: 'SUPERMERCADO BOM PRECO LTDA',
      totalCents: 118745,
      date: '2026-07-10',
    });
  });

  it('extrai padaria: nome multilinha, AMOUNT_PAID como fallback de TOTAL', () => {
    expect(parseExpense(padaria)).toEqual({
      merchant: 'PADARIA E CONFEITARIA ESTRELA DO SUL',
      totalCents: 2350,
      date: '2026-07-08',
    });
  });

  it('recibo ilegível: tudo null e merchant desconhecido', () => {
    expect(parseExpense(ilegivel)).toEqual({
      merchant: UNKNOWN_MERCHANT,
      totalCents: null,
      date: null,
    });
  });

  it('input fora do shape do Textract não explode', () => {
    expect(parseExpense({ qualquer: 'coisa' }).totalCents).toBeNull();
    expect(parseExpense(null).merchant).toBe(UNKNOWN_MERCHANT);
  });
});
