export interface ReceiptFilters {
  from?: string;
  to?: string;
  category?: string;
}

// Monta a query string da API em ordem estável (bom pra queryKey e cache).
export function receiptsQueryString(params: ReceiptFilters & { cursor?: string }): string {
  const qs = new URLSearchParams();
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.category) qs.set('category', params.category);
  if (params.cursor) qs.set('cursor', params.cursor);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export function hasActiveFilters(filters: ReceiptFilters): boolean {
  return Boolean(filters.from ?? filters.to ?? filters.category);
}
