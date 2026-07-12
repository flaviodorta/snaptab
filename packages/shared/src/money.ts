// Converte texto de valor monetário em centavos. Aceita formato BR e US:
// "R$ 1.234,56" → 123456 | "1,234.56" → 123456 | "187" → 18700.
// Regra: o último separador é decimal se for seguido de 1–2 dígitos;
// seguido de 3 (ex.: "1.234") é separador de milhar.
// Usado pelo processor (saída do Textract) e pelo web (input do usuário).
export function parseMoneyToCents(text: string): number | null {
  const cleaned = text.replace(/[^\d.,]/g, '');
  if (!/\d/.test(cleaned)) return null;

  const sep = Math.max(cleaned.lastIndexOf(','), cleaned.lastIndexOf('.'));
  let intRaw = cleaned;
  let fracRaw = '';
  if (sep !== -1) {
    const tail = cleaned.slice(sep + 1);
    if (tail.length >= 1 && tail.length <= 2) {
      intRaw = cleaned.slice(0, sep);
      fracRaw = tail;
    }
  }

  const intDigits = intRaw.replace(/\D/g, '');
  if (!intDigits && !fracRaw) return null;
  return Number(intDigits || '0') * 100 + Number(fracRaw.padEnd(2, '0') || '0');
}
