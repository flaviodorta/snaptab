const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(totalCents: number): string {
  return brl.format(totalCents / 100);
}

// date é YYYY-MM-DD; montar com T00:00:00 evita o clássico "um dia a menos"
// de interpretar meia-noite UTC no fuso local.
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR');
}

export function formatDayMonth(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

// Data local do usuário (não UTC): às 22h em São Paulo ainda é hoje.
export function localIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function firstOfMonthIso(date = new Date()): string {
  return `${localIsoDate(date).slice(0, 8)}01`;
}
