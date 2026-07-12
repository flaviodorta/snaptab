// Logs estruturados (JSON por linha): CloudWatch Logs Insights consegue
// filtrar por campo (level, msg, receiptId...) sem regex frágil.
export function logInfo(msg: string, fields?: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'info', msg, ...fields }));
}

export function logWarn(msg: string, fields?: Record<string, unknown>): void {
  console.warn(JSON.stringify({ level: 'warn', msg, ...fields }));
}

export function logError(msg: string, err: unknown, fields?: Record<string, unknown>): void {
  const error =
    err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: String(err) };
  console.error(JSON.stringify({ level: 'error', msg, error, ...fields }));
}
