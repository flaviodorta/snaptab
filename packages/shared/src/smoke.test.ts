// Teste descartável: só prova que o vitest roda TypeScript no workspace.
// Substituído por testes reais de schema na Fase 1.
import { describe, expect, it } from 'vitest';

describe('toolchain', () => {
  it('executa TypeScript estrito no vitest', () => {
    const sum = (a: number, b: number): number => a + b;
    expect(sum(2, 2)).toBe(4);
  });
});
