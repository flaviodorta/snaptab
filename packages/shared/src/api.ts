import { z } from 'zod';
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
});
export type ListReceiptsQuery = z.infer<typeof listReceiptsQuerySchema>;

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

export const apiErrorSchema = z.object({
  error: z.string(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
