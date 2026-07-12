import { z } from 'zod';
import { categorySchema } from './category';

// receiptId é um ULID: lexicograficamente ordenado por tempo de criação, o que
// faz o SK `RECEIPT#<id>` sair do DynamoDB já em ordem cronológica — a listagem
// "mais recentes primeiro" é a query com ScanIndexForward=false, sem sort na app.
export const RECEIPT_ID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;
export const receiptIdSchema = z.string().regex(RECEIPT_ID_REGEX, 'esperado um ULID');

// Só o processor escreve itens: 'processed' no caminho feliz, 'failed' quando o
// erro é irrecuperável de propósito (ack consciente) mas o usuário precisa ver
// que o recibo não saiu. Enquanto não existe item, o web mostra "processando".
export const receiptStatusSchema = z.enum(['processed', 'failed']);
export type ReceiptStatus = z.infer<typeof receiptStatusSchema>;

export const receiptSchema = z.object({
  receiptId: receiptIdSchema,
  userId: z.string().min(1),
  s3Key: z.string().min(1),
  merchant: z.string().min(1),
  // Valor em centavos (inteiro) — dinheiro nunca em float.
  totalCents: z.number().int().nonnegative(),
  // Data da compra extraída do recibo (YYYY-MM-DD); alimenta o GSI1SK DATE#.
  date: z.iso.date(),
  category: categorySchema,
  status: receiptStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type Receipt = z.infer<typeof receiptSchema>;
