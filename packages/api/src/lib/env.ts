// Config só via variável de ambiente (CLAUDE.md §7). Falta de config é erro de
// deploy — falhar alto na primeira leitura, nunca seguir com valor vazio.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}
