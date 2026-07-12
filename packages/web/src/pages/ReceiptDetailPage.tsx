import { Link, useParams } from 'react-router-dom';
import { useReceipt } from '../api/receipts';
import { formatBRL, formatDate } from '../lib/format';

export function ReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const query = useReceipt(id ?? '');

  if (query.isLoading) return <p className="center-note">Carregando…</p>;
  if (query.isError) {
    return (
      <main className="page">
        <p className="error">Recibo não encontrado.</p>
        <Link to="/">← Voltar</Link>
      </main>
    );
  }
  if (!query.data) return null;

  const { receipt, imageUrl } = query.data;

  return (
    <main className="page">
      <Link to="/" className="back-link">
        ← Voltar
      </Link>
      <div className="detail">
        <div className="detail-fields">
          <h1>{receipt.merchant}</h1>
          {receipt.status === 'failed' && (
            <p className="badge-failed">
              O OCR não conseguiu ler este recibo — edição manual chega na v2.
            </p>
          )}
          <dl>
            <dt>Total</dt>
            <dd className="total-big">{formatBRL(receipt.totalCents)}</dd>
            <dt>Data da compra</dt>
            <dd>{formatDate(receipt.date)}</dd>
            <dt>Categoria</dt>
            <dd>{receipt.category}</dd>
            <dt>Enviado em</dt>
            <dd>{new Date(receipt.createdAt).toLocaleString('pt-BR')}</dd>
          </dl>
        </div>
        <figure className="detail-image">
          <img src={imageUrl} alt={`Recibo de ${receipt.merchant}`} />
        </figure>
      </div>
    </main>
  );
}
