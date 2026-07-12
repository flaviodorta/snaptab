import { parseMoneyToCents, textractExpenseSchema } from '@snaptab/shared';

export const UNKNOWN_MERCHANT = 'Desconhecido';

export interface ParsedExpense {
  merchant: string;
  // null = não extraído. Quem decide o fallback (e o status) é o handler.
  totalCents: number | null;
  date: string | null; // ISO YYYY-MM-DD
}

// Extrai a primeira data reconhecível do texto (recibos BR costumam trazer
// "10/07/2026 14:32:18"). Dia/mês na ordem brasileira; valida data real.
export function parseDateToIso(text: string): string | null {
  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso && iso[1] && iso[2] && iso[3]) {
    return validateYmd(iso[1], iso[2], iso[3]);
  }
  const br = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})/);
  if (br && br[1] && br[2] && br[3]) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return validateYmd(year, br[2], br[1]);
  }
  return null;
}

function validateYmd(y: string, m: string, d: string): string | null {
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  // Date.UTC "rola" datas inválidas (31/02 → 03/03); o roundtrip detecta isso.
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== yy ||
    date.getUTCMonth() !== mm - 1 ||
    date.getUTCDate() !== dd
  ) {
    return null;
  }
  return `${String(yy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Saída bruta do Textract (unknown) → campos do domínio. Puro e sem AWS.
export function parseExpense(raw: unknown): ParsedExpense {
  const parsed = textractExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return { merchant: UNKNOWN_MERCHANT, totalCents: null, date: null };
  }

  const fields = (parsed.data.ExpenseDocuments ?? []).flatMap((doc) => doc.SummaryFields ?? []);
  const valueOf = (type: string): string | undefined =>
    fields.find((f) => f.Type?.Text === type)?.ValueDetection?.Text;

  const merchant =
    valueOf('VENDOR_NAME')?.replace(/\s+/g, ' ').trim() || UNKNOWN_MERCHANT;
  const totalText = valueOf('TOTAL') ?? valueOf('AMOUNT_PAID');
  const dateText = valueOf('INVOICE_RECEIPT_DATE');

  return {
    merchant,
    totalCents: totalText ? parseMoneyToCents(totalText) : null,
    date: dateText ? parseDateToIso(dateText) : null,
  };
}
