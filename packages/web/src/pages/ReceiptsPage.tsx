import { CATEGORIES } from '@snaptab/shared';
import { useState, useRef, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { useReceiptsPage } from '../api/receipts';
import { Topbar } from '../components/Topbar';
import { formatBRL, formatDate } from '../lib/format';
import type { ReceiptFilters } from '../lib/query-string';

export function ReceiptsPage() {
  const [filters, setFilters] = useState<ReceiptFilters>({});
  const { query, receipts, pendingCount, upload } = useReceiptsPage(filters);
  const fileInput = useRef<HTMLInputElement>(null);

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
  }

  function setFilter(patch: Partial<ReceiptFilters>) {
    setFilters((f) => {
      const next = { ...f, ...patch };
      // chave ausente (não string vazia) mantém a queryKey limpa
      for (const key of ['from', 'to', 'category'] as const) {
        if (!next[key]) delete next[key];
      }
      return next;
    });
  }

  return (
    <main className="page">
      <Topbar />

      <section className="upload-row">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onFileChosen}
        />
        <button onClick={() => fileInput.current?.click()} disabled={upload.isPending}>
          {upload.isPending ? 'Enviando…' : '+ Fotografar recibo'}
        </button>
        {upload.isError && <p className="error">{upload.error.message}</p>}
        {pendingCount > 0 && (
          <p className="processing">
            {pendingCount === 1
              ? '1 recibo processando…'
              : `${pendingCount} recibos processando…`}
          </p>
        )}
      </section>

      <div className="filters">
        <label>
          De
          <input
            type="date"
            value={filters.from ?? ''}
            onChange={(e) => setFilter({ from: e.target.value })}
          />
        </label>
        <label>
          Até
          <input
            type="date"
            value={filters.to ?? ''}
            onChange={(e) => setFilter({ to: e.target.value })}
          />
        </label>
        <label>
          Categoria
          <select
            value={filters.category ?? ''}
            onChange={(e) => setFilter({ category: e.target.value })}
          >
            <option value="">Todas</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        {(filters.from ?? filters.to ?? filters.category) && (
          <button className="ghost" onClick={() => setFilters({})}>
            Limpar
          </button>
        )}
      </div>

      {query.isLoading && <p className="center-note">Carregando recibos…</p>}
      {query.isError && <p className="error">Erro ao carregar: {query.error.message}</p>}

      {receipts.length === 0 && query.isSuccess && pendingCount === 0 && (
        <p className="center-note">
          {filters.from ?? filters.to ?? filters.category
            ? 'Nenhum recibo com esses filtros.'
            : 'Nenhum recibo ainda — fotografe o primeiro!'}
        </p>
      )}

      <ul className="receipt-list">
        {receipts.map((receipt) => (
          <li key={receipt.receiptId}>
            <Link className="receipt-card" to={`/receipts/${receipt.receiptId}`}>
              <div className="receipt-main">
                <span className="merchant">{receipt.merchant}</span>
                <span className="date">
                  {formatDate(receipt.date)}
                  {receipt.category !== 'Outros' && (
                    <span className="badge-category">{receipt.category}</span>
                  )}
                </span>
              </div>
              <div className="receipt-side">
                <span className="total">{formatBRL(receipt.totalCents)}</span>
                {receipt.status === 'failed' && <span className="badge-failed">OCR falhou</span>}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {query.hasNextPage && (
        <button
          className="ghost load-more"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
    </main>
  );
}
