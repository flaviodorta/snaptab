import {
  listReceiptsResponseSchema,
  receiptDetailResponseSchema,
  summaryResponseSchema,
  uploadUrlRequestSchema,
  uploadUrlResponseSchema,
  type Receipt,
} from '@snaptab/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { hasActiveFilters, receiptsQueryString, type ReceiptFilters } from '../lib/query-string';
import { apiFetch } from './client';

const RECEIPTS_KEY = ['receipts'];

function useReceiptsInfinite(filters: ReceiptFilters, polling: boolean) {
  return useInfiniteQuery({
    queryKey: [...RECEIPTS_KEY, filters],
    queryFn: ({ pageParam }) =>
      apiFetch(
        `/receipts${receiptsQueryString({ ...filters, cursor: pageParam })}`,
        listReceiptsResponseSchema,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: polling ? 3000 : false,
  });
}

export function useSummary(from: string, to: string) {
  return useQuery({
    queryKey: ['summary', from, to],
    queryFn: () =>
      apiFetch(`/summary?from=${from}&to=${to}`, summaryResponseSchema),
  });
}

export function useReceipt(receiptId: string) {
  return useQuery({
    queryKey: [...RECEIPTS_KEY, receiptId],
    queryFn: () => apiFetch(`/receipts/${receiptId}`, receiptDetailResponseSchema),
  });
}

function useUploadReceipt(onUploaded: (receiptId: string) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File): Promise<string> => {
      const contentType = uploadUrlRequestSchema.shape.contentType.safeParse(file.type);
      if (!contentType.success) {
        throw new Error('Formato não suportado — use JPEG, PNG ou WebP.');
      }
      const { uploadUrl, receiptId } = await apiFetch('/receipts/upload-url', uploadUrlResponseSchema, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contentType: contentType.data }),
      });
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': contentType.data },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`Falha ao subir a imagem (HTTP ${put.status}).`);
      }
      return receiptId;
    },
    onSuccess: (receiptId) => {
      onUploaded(receiptId);
      void queryClient.invalidateQueries({ queryKey: RECEIPTS_KEY });
    },
  });
}

// Estado completo da tela de recibos: lista paginada + uploads "processando".
// Enquanto houver recibo pendente (upload feito, processor ainda não gravou),
// a lista fica em polling de 3s; quando o id aparece, sai do conjunto pendente.
// Com filtros ativos o recibo novo pode nunca aparecer na lista filtrada,
// então o rastreio de pendência só roda na visão sem filtros.
export function useReceiptsPage(filters: ReceiptFilters = {}) {
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const query = useReceiptsInfinite(filters, pendingIds.length > 0);

  const receipts: Receipt[] = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  useEffect(() => {
    if (pendingIds.length === 0) return;
    const present = new Set(receipts.map((r) => r.receiptId));
    const stillPending = pendingIds.filter((id) => !present.has(id));
    if (stillPending.length !== pendingIds.length) setPendingIds(stillPending);
  }, [receipts, pendingIds]);

  const upload = useUploadReceipt((receiptId) => {
    if (!hasActiveFilters(filters)) setPendingIds((ids) => [...ids, receiptId]);
  });

  return { query, receipts, pendingCount: pendingIds.length, upload };
}
