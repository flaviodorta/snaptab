import { CATEGORIES, parseMoneyToCents, type Category, type Receipt } from '@snaptab/shared';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useReceipt, useUpdateReceipt } from '../api/receipts';
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
        <ReceiptFields receipt={receipt} />
        <figure className="detail-image">
          <img src={imageUrl} alt={`Recibo de ${receipt.merchant}`} />
        </figure>
      </div>
    </main>
  );
}

function ReceiptFields({ receipt }: { receipt: Receipt }) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateReceipt(receipt.receiptId);

  if (editing) {
    return (
      <EditForm
        receipt={receipt}
        busy={update.isPending}
        error={update.error?.message ?? null}
        onCancel={() => setEditing(false)}
        onSave={(patch) => {
          update.mutate(patch, { onSuccess: () => setEditing(false) });
        }}
      />
    );
  }

  return (
    <div className="detail-fields">
      <h1>{receipt.merchant}</h1>
      {receipt.status === 'failed' && (
        <p className="badge-failed">O OCR não conseguiu ler este recibo — corrija os dados.</p>
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
      <button className="ghost" onClick={() => setEditing(true)}>
        Editar
      </button>
    </div>
  );
}

interface EditPatch {
  merchant?: string;
  totalCents?: number;
  date?: string;
  category?: Category;
}

function EditForm(props: {
  receipt: Receipt;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (patch: EditPatch) => void;
}) {
  const { receipt, busy, error, onCancel, onSave } = props;
  const [merchant, setMerchant] = useState(receipt.merchant);
  const [total, setTotal] = useState((receipt.totalCents / 100).toFixed(2).replace('.', ','));
  const [date, setDate] = useState(receipt.date);
  const [category, setCategory] = useState<Category>(receipt.category);
  const [formError, setFormError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const totalCents = parseMoneyToCents(total);
    if (totalCents === null) {
      setFormError('Valor inválido — use algo como 69,49.');
      return;
    }
    if (!merchant.trim()) {
      setFormError('Estabelecimento não pode ficar vazio.');
      return;
    }
    setFormError(null);
    // Manda só o que mudou — o PATCH é parcial por contrato.
    const patch: EditPatch = {};
    if (merchant.trim() !== receipt.merchant) patch.merchant = merchant.trim();
    if (totalCents !== receipt.totalCents) patch.totalCents = totalCents;
    if (date !== receipt.date) patch.date = date;
    if (category !== receipt.category) patch.category = category;
    if (Object.keys(patch).length === 0) {
      onCancel();
      return;
    }
    onSave(patch);
  }

  return (
    <form className="detail-fields edit-form" onSubmit={onSubmit}>
      <h1>Editar recibo</h1>
      <label>
        Estabelecimento
        <input value={merchant} onChange={(e) => setMerchant(e.target.value)} />
      </label>
      <label>
        Total (R$)
        <input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
      </label>
      <label>
        Data da compra
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </label>
      <label>
        Categoria
        <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
      {(formError ?? error) && <p className="error">{formError ?? error}</p>}
      <div className="edit-actions">
        <button type="submit" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button type="button" className="ghost" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
