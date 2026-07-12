import { z } from 'zod';

// Validação na borda também pra config: build sem env definida falha alto
// na primeira tela, não com erro críptico no meio do fluxo.
const configSchema = z.object({
  apiUrl: z.url(),
  userPoolId: z.string().min(1),
  userPoolClientId: z.string().min(1),
});

export const config = configSchema.parse({
  apiUrl: import.meta.env.VITE_API_URL,
  userPoolId: import.meta.env.VITE_USER_POOL_ID,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
});
