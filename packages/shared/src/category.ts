import { z } from 'zod';

// União fechada de categorias (v2). Novas categorias entram aqui e o resto
// do sistema (api, web, agregados CAT#) deriva automaticamente.
export const CATEGORIES = [
  'Alimentação',
  'Mercado',
  'Transporte',
  'Saúde',
  'Lazer',
  'Outros',
] as const;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

// Fallback quando nenhuma regra de palavra-chave casa com o estabelecimento.
export const DEFAULT_CATEGORY: Category = 'Outros';

// Item de agregado CAT#<categoria>: mantido atomicamente a cada escrita de
// recibo (ADD), pra o dashboard ler totais sem varrer recibos.
export const categoryAggregateSchema = z.object({
  userId: z.string().min(1),
  category: categorySchema,
  totalCents: z.number().int(),
  receiptCount: z.number().int().nonnegative(),
});
export type CategoryAggregate = z.infer<typeof categoryAggregateSchema>;
