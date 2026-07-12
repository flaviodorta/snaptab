import { formatBRL, formatDayMonth } from '../lib/format';

interface Point {
  date: string;
  totalCents: number;
}

// Colunas de série única ancoradas na baseline, ponta arredondada só no topo
// (o lado do dado). Valor exato no hover via tooltip nativo por marca.
export function EvolutionChart({ evolution }: { evolution: Point[] }) {
  if (evolution.length === 0) {
    return <p className="center-note">Sem gastos no período.</p>;
  }
  const max = Math.max(...evolution.map((p) => p.totalCents));
  // Com muitos dias, rotula o eixo esparsamente pra não colidir.
  const labelEvery = Math.ceil(evolution.length / 8);

  return (
    <div className="evolution">
      <div className="evo-columns" role="img" aria-label="Gastos por dia no período">
        {evolution.map((p) => (
          <div className="evo-col" key={p.date}>
            <div
              className="evo-fill"
              style={{ height: `${max > 0 ? Math.max((p.totalCents / max) * 100, 2) : 2}%` }}
              title={`${formatDayMonth(p.date)}: ${formatBRL(p.totalCents)}`}
            />
          </div>
        ))}
      </div>
      <div className="evo-axis">
        {evolution.map((p, i) => (
          <span className="evo-tick" key={p.date}>
            {i % labelEvery === 0 ? formatDayMonth(p.date) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
