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
