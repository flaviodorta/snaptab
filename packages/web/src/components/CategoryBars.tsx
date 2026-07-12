import type { CategoryAggregate } from '@snaptab/shared';
import { formatBRL } from '../lib/format';

// Barras horizontais de série única: a identidade está no rótulo da linha
// (não em cor), o valor em cor de texto — a barra só carrega magnitude.
export function CategoryBars({ categories }: { categories: CategoryAggregate[] }) {
  if (categories.length === 0) {
    return <p className="center-note">Sem gastos categorizados ainda.</p>;
  }
  const max = Math.max(...categories.map((c) => c.totalCents));

  return (
    <ul className="category-bars">
      {categories.map((c) => (
        <li key={c.category}>
          <span className="cat-label">{c.category}</span>
          <span className="cat-track">
            <span
              className="cat-fill"
              style={{ width: `${max > 0 ? (c.totalCents / max) * 100 : 0}%` }}
              title={`${c.receiptCount} ${c.receiptCount === 1 ? 'recibo' : 'recibos'}`}
            />
          </span>
          <span className="cat-value">{formatBRL(c.totalCents)}</span>
        </li>
      ))}
    </ul>
  );
}
