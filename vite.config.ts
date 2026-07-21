import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      ignored: [
        '**/dist/**',
        '**/dist-ssr/**',
        '**/node_modules/**',
        '**/.git/**',
        '**/.agent-tmp/**',
        '**/.agent-files/**',
      ],
    },
  },
})
