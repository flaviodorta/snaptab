import { DEFAULT_CATEGORY, type Category } from './category';

// Regras de categorização por palavra-chave do estabelecimento.
// - Normaliza acentos e caixa antes de casar (FARMÁCIA == FARMACIA).
// - Palavras casam com boundary (\b) dos dois lados: "BAR" não casa em
//   "BARBEARIA" — variações desejadas viram keywords explícitas (ATACADAO).
// - A ORDEM importa: primeira regra que casa vence. Saúde vem antes de
//   Transporte pra "POSTO DE SAUDE" não virar combustível.
const RULES: ReadonlyArray<{ category: Category; keywords: readonly string[] }> = [
  {
    category: 'Saúde',
    keywords: ['FARMACIA', 'DROGARIA', 'HOSPITAL', 'CLINICA', 'LABORATORIO', 'SAUDE'],
  },
  {
    category: 'Mercado',
    keywords: [
      'SUPERMERCADO',
      'MERCADO',
      'MERCEARIA',
      'ATACADAO',
      'ATACADISTA',
      'HORTIFRUTI',
      'SACOLAO',
      'EMPORIO',
    ],
  },
  {
    category: 'Alimentação',
    keywords: [
      'PADARIA',
      'RESTAURANTE',
      'LANCHONETE',
      'PIZZARIA',
      'CONFEITARIA',
      'CHURRASCARIA',
      'HAMBURGUERIA',
      'CAFETERIA',
      'CAFE',
      'BAR',
      'IFOOD',
    ],
  },
  {
    category: 'Transporte',
    keywords: ['POSTO', 'COMBUSTIVEL', 'COMBUSTIVEIS', 'UBER', 'ESTACIONAMENTO', 'PEDAGIO'],
  },
  {
    category: 'Lazer',
    keywords: ['CINEMA', 'TEATRO', 'LIVRARIA', 'NETFLIX', 'SPOTIFY', 'INGRESSO', 'PARQUE', 'SHOW'],
  },
];

export function normalizeMerchant(merchant: string): string {
  return merchant
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // remove diacríticos
    .toUpperCase();
}

export function categorize(merchant: string): Category {
  const normalized = normalizeMerchant(merchant);
  for (const rule of RULES) {
    for (const keyword of rule.keywords) {
      if (new RegExp(`\\b${keyword}\\b`).test(normalized)) {
        return rule.category;
      }
    }
  }
  return DEFAULT_CATEGORY;
}
