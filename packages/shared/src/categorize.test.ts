import { describe, expect, it } from 'vitest';
import { categorize } from './categorize';

describe('categorize', () => {
  it('classifica estabelecimentos comuns', () => {
    expect(categorize('MERCADO SAO JOSE LTDA')).toBe('Mercado');
    expect(categorize('SUPERMERCADO BOM PRECO LTDA')).toBe('Mercado');
    expect(categorize('PADARIA ESTRELA DO SUL')).toBe('Alimentação');
    expect(categorize('AUTO POSTO IPIRANGA')).toBe('Transporte');
    expect(categorize('CINEMARK SHOPPING')).toBe('Outros'); // CINEMARK ≠ \bCINEMA\b
    expect(categorize('CINEMA CENTRAL')).toBe('Lazer');
  });

  it('normaliza acentos e caixa', () => {
    expect(categorize('Farmácia São Paulo')).toBe('Saúde');
    expect(categorize('restaurante da esquina')).toBe('Alimentação');
  });

  it('ordem das regras: POSTO DE SAUDE é Saúde, não Transporte', () => {
    expect(categorize('POSTO DE SAUDE MUNICIPAL')).toBe('Saúde');
  });

  it('word boundary: BAR não casa dentro de BARBEARIA', () => {
    expect(categorize('BARBEARIA DO CHICO')).toBe('Outros');
    expect(categorize('BAR DO ZE')).toBe('Alimentação');
  });

  it('fallback: sem regra → Outros', () => {
    expect(categorize('Desconhecido')).toBe('Outros');
    expect(categorize('LOJA DE FERRAGENS TITO')).toBe('Outros');
  });
});
