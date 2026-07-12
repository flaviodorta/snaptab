import { useState } from 'react';
import { useSummary } from '../api/receipts';
import { CategoryBars } from '../components/CategoryBars';
import { EvolutionChart } from '../components/EvolutionChart';
import { Topbar } from '../components/Topbar';
import { firstOfMonthIso, formatBRL, localIsoDate } from '../lib/format';

export function DashboardPage() {
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(localIsoDate());
  const query = useSummary(from, to);

  return (
    <main className="page">
      <Topbar />

      <div className="filters">
        <label>
          De
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {query.isLoading && <p className="center-note">Carregando…</p>}
      {query.isError && <p className="error">Erro ao carregar: {query.error.message}</p>}

      {query.data && (
        <>
          <div className="stat-row">
            <div className="stat-tile">
              <span className="stat-label">Total no período</span>
              <span className="stat-value">{formatBRL(query.data.period.totalCents)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Recibos</span>
              <span className="stat-value">{query.data.period.receiptCount}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Maior categoria (geral)</span>
              <span className="stat-value stat-value-sm">
                {query.data.categories[0]?.category ?? '—'}
              </span>
            </div>
          </div>

          <section className="panel">
            <h2>Evolução no período</h2>
            <EvolutionChart evolution={query.data.evolution} />
          </section>

          <section className="panel">
            <h2>Total por categoria (desde o início)</h2>
            <CategoryBars categories={query.data.categories} />
          </section>
        </>
      )}
    </main>
  );
}
