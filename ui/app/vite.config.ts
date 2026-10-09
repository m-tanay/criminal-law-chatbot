import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import { handleChat } from "./server/chatProxy.mjs";

// Dev-only middleware so the browser hits THIS app's /api/chat, never n8n directly.
function chatProxyPlugin(): PluginOption {
  return {
    name: "chat-proxy",
    configureServer(server) {
      server.middlewares.use("/api/chat", (req, res) => {
        handleChat(req, res).catch(() => {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "proxy_crash" }));
        });
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: process.env.APP_BASE || "/",
  plugins: [react(), chatProxyPlugin()],
  server: {
    host: "127.0.0.1",
    port: 5190,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: 5190,
  },
});
