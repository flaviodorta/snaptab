import { z } from 'zod';

// Shape mínimo da resposta do AnalyzeExpense — só o que o parser consome.
// Campos extras (Confidence, Geometry, LineItemGroups...) são descartados.
// Tudo opcional de propósito: recibo ilegível vem com SummaryFields vazio ou
// sem os campos esperados, e isso NÃO é erro de schema — é total não extraído.
export const textractExpenseSchema = z.object({
  ExpenseDocuments: z
    .array(
      z.object({
        SummaryFields: z
          .array(
            z.object({
              Type: z.object({ Text: z.string().optional() }).optional(),
              ValueDetection: z.object({ Text: z.string().optional() }).optional(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
});
export type TextractExpense = z.infer<typeof textractExpenseSchema>;
