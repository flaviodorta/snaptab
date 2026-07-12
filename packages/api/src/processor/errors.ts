// Contrato de erro do processor (CLAUDE.md §7):
// - IrrecoverableError → ack consciente: a mensagem NUNCA vai processar
//   (TestEvent, key fora do formato, objeto deletado). Logar e seguir.
// - Qualquer outro throw → recuperável: a mensagem volta pra fila e, após
//   maxReceiveCount tentativas, cai na DLQ.
export class IrrecoverableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'IrrecoverableError';
  }
}
