import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Loopback on purpose: a dev server has no business answering the network,
    // and "localhost" can resolve to IPv6 first, which nothing else expects.
    host: '127.0.0.1',
    port: 5173,
    /*
     * reference/ is the upstream project this one is modelled on. It sits
     * inside the project root, so the file scanner and the watcher have to be
     * told to leave it alone: without this, every start crawls its
     * dependencies and reports them missing.
     *
     * Polling, because this machine's filesystem does not deliver change
     * events to the watcher: without it the dev server keeps serving the
     * module it transformed the first time it was asked, and an edit appears
     * to do nothing at all until the server is restarted.
     */
    watch: { ignored: ['**/reference/**'], usePolling: true, interval: 300 },
  },
  optimizeDeps: { entries: ['index.html'] },
});
