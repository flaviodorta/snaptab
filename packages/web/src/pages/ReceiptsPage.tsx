import { useRef, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useReceiptsPage } from '../api/receipts';
import { useAuth } from '../auth/AuthContext';
import { formatBRL, formatDate } from '../lib/format';

export function ReceiptsPage() {
  const { email, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { query, receipts, pendingCount, upload } = useReceiptsPage();
  const fileInput = useRef<HTMLInputElement>(null);

  function onFileChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload.mutate(file);
    e.target.value = ''; // permite re-selecionar o mesmo arquivo
  }

  function onLogout() {
    signOut();
    queryClient.clear(); // nada de dado de um usuário vazar pro próximo
    navigate('/login');
  }

  return (
    <main className="page">
      <header className="topbar">
        <h1>Snaptab</h1>
        <div className="topbar-right">
          <span className="user-email">{email}</span>
          <button className="ghost" onClick={onLogout}>
            Sair
          </button>
        </div>
      </header>

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

      {query.isLoading && <p className="center-note">Carregando recibos…</p>}
      {query.isError && <p className="error">Erro ao carregar: {query.error.message}</p>}

      {receipts.length === 0 && query.isSuccess && pendingCount === 0 && (
        <p className="center-note">Nenhum recibo ainda — fotografe o primeiro!</p>
      )}

      <ul className="receipt-list">
        {receipts.map((receipt) => (
          <li key={receipt.receiptId}>
            <Link className="receipt-card" to={`/receipts/${receipt.receiptId}`}>
              <div className="receipt-main">
                <span className="merchant">{receipt.merchant}</span>
                <span className="date">{formatDate(receipt.date)}</span>
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
