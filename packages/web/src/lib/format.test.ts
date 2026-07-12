import { describe, expect, it } from 'vitest';
import { formatBRL, formatDate } from './format';

describe('formatBRL', () => {
  it('formata centavos como moeda brasileira', () => {
    // Intl usa espaço não separável entre R$ e o número.
    expect(formatBRL(6949)).toBe('R$ 69,49');
    expect(formatBRL(118745)).toBe('R$ 1.187,45');
    expect(formatBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatDate', () => {
  it('formata ISO como dd/mm/aaaa sem deslizar um dia', () => {
    expect(formatDate('2026-07-08')).toBe('08/07/2026');
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });
});
