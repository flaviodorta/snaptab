import { describe, expect, it } from 'vitest';
import { parseMoneyToCents } from './money';

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
