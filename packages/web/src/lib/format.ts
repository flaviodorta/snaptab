const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(totalCents: number): string {
  return brl.format(totalCents / 100);
}

// date é YYYY-MM-DD; montar com T00:00:00 evita o clássico "um dia a menos"
// de interpretar meia-noite UTC no fuso local.
export function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('pt-BR');
}
