import { describe, expect, it } from 'vitest';
import { hasActiveFilters, receiptsQueryString } from './query-string';
import { firstOfMonthIso, localIsoDate } from './format';

describe('receiptsQueryString', () => {
  it('vazio → string vazia', () => {
    expect(receiptsQueryString({})).toBe('');
  });

  it('monta filtros em ordem estável e encoda o cursor', () => {
    expect(
      receiptsQueryString({
        from: '2026-07-01',
        to: '2026-07-31',
        category: 'Saúde',
        cursor: 'a+b/c==',
      }),
    ).toBe('?from=2026-07-01&to=2026-07-31&category=Sa%C3%BAde&cursor=a%2Bb%2Fc%3D%3D');
  });
});

describe('hasActiveFilters', () => {
  it('detecta qualquer filtro ativo', () => {
    expect(hasActiveFilters({})).toBe(false);
    expect(hasActiveFilters({ from: '2026-07-01' })).toBe(true);
    expect(hasActiveFilters({ category: 'Lazer' })).toBe(true);
  });
});

describe('datas locais', () => {
  it('usa o fuso local, não UTC', () => {
    // 22h de 31/07 em São Paulo já é 01/08 em UTC — o local tem que valer.
    const date = new Date(2026, 6, 31, 22, 0, 0);
    expect(localIsoDate(date)).toBe('2026-07-31');
    expect(firstOfMonthIso(date)).toBe('2026-07-01');
  });
});
