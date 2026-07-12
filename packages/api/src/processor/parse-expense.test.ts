import { describe, expect, it } from 'vitest';
import ilegivel from './__fixtures__/ilegivel.json';
import mercado from './__fixtures__/mercado.json';
import padaria from './__fixtures__/padaria.json';
import { parseDateToIso, parseExpense, parseMoneyToCents, UNKNOWN_MERCHANT } from './parse-expense';

describe('parseMoneyToCents', () => {
  it('converte formatos BR e US pra centavos', () => {
    expect(parseMoneyToCents('R$ 187,45')).toBe(18745);
    expect(parseMoneyToCents('R$ 1.234,56')).toBe(123456);
    expect(parseMoneyToCents('1,234.56')).toBe(123456);
    expect(parseMoneyToCents('123.45')).toBe(12345);
    expect(parseMoneyToCents('12,5')).toBe(1250);
    expect(parseMoneyToCents('187')).toBe(18700);
    expect(parseMoneyToCents('1.234')).toBe(123400); // separador de milhar
  });

  it('retorna null sem dígitos', () => {
    expect(parseMoneyToCents('R$ --')).toBeNull();
    expect(parseMoneyToCents('')).toBeNull();
  });
});

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
