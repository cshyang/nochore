import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  server: {
    port: 3000,
    // Bind to all local interfaces (both 127.0.0.1 and [::1]).
    // Node 18+ defaults to IPv6-first when resolving "localhost", which
    // can leave 127.0.0.1 unbound and cause ERR_CONNECTION_REFUSED in
    // browsers that cache an IPv4 resolution. host:true listens on
    // 0.0.0.0 and ::, covering both.
    host: true,
  },
  plugins: [
    tsConfigPaths(),
    tanstackStart(),
    // React's vite plugin must come after Start's vite plugin
    viteReact(),
  ],
});
