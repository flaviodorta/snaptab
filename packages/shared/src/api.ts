import { z } from 'zod';
import { categoryAggregateSchema, categorySchema } from './category';
import { receiptIdSchema, receiptSchema } from './receipt';

// Schemas das bordas HTTP: todo body/resposta da API é validado por eles.
// userId NUNCA vem no body — é extraído das claims do JWT no handler.

export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const uploadUrlRequestSchema = z.object({
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  receiptId: receiptIdSchema,
  uploadUrl: z.url(),
  expiresInSeconds: z.number().int().positive(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const listReceiptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
  // Filtros v2: intervalo de datas usa o GSI1; categoria filtra dentro da
  // partição do usuário (FilterExpression — nunca Scan).
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  category: categorySchema.optional(),
});
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;

export const summaryQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type SummaryQuery = z.infer<typeof summaryQuerySchema>;

export const summaryResponseSchema = z.object({
  // Totais all-time por categoria, direto dos itens CAT# (sem varrer recibos).
  categories: z.array(categoryAggregateSchema),
  // Janela pedida (default: mês corrente) somada a partir do GSI1.
  period: z.object({
    from: z.iso.date(),
    to: z.iso.date(),
    totalCents: z.number().int(),
    receiptCount: z.number().int().nonnegative(),
  }),
  evolution: z.array(z.object({ date: z.iso.date(), totalCents: z.number().int() })),
});
export type SummaryResponse = z.infer<typeof summaryResponseSchema>;

export const listReceiptsResponseSchema = z.object({
  items: z.array(receiptSchema),
  // Cursor opaco (LastEvaluatedKey encodado) — ausente na última página.
  nextCursor: z.string().optional(),
});
export type ListReceiptsResponse = z.infer<typeof listReceiptsResponseSchema>;

export const receiptDetailResponseSchema = z.object({
  receipt: receiptSchema,
  // Presigned GET da imagem original no S3.
  imageUrl: z.url(),
});
export type ReceiptDetailResponse = z.infer<typeof receiptDetailResponseSchema>;

// Correção manual (v2): campos que o usuário pode consertar quando o OCR erra.
// Qualquer edição marca o recibo como 'processed' — o dado passou por revisão
// humana, que é mais confiável que o OCR.
export const updateReceiptRequestSchema = z
  .object({
    merchant: z.string().min(1).optional(),
    totalCents: z.number().int().nonnegative().optional(),
    date: z.iso.date().optional(),
    category: categorySchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((v) => v !== undefined), {
    message: 'pelo menos um campo editável é obrigatório',
  });
export type UpdateReceiptRequest = z.infer<typeof updateReceiptRequestSchema>;

export const updateReceiptResponseSchema = z.object({
  receipt: receiptSchema,
});
export type UpdateReceiptResponse = z.infer<typeof updateReceiptResponseSchema>;

export const apiErrorSchema = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
