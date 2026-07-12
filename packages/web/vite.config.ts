import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js referencia `global` (herança de Node).
  define: { global: 'globalThis' },
});
