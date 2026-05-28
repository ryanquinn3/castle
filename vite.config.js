import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const tiledPlugin = () => {
    return {
        name: 'tiled-tileset-plugin',
        resolveId: {
            order: 'pre',
            handler(sourceId, importer, _options) {
                if (!sourceId.endsWith(".tsx")) return;
                if (importer && importer.endsWith(".tmx")) {
                    return { id: 'tileset:' + sourceId, external: 'relative' }
                }
            }
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [tiledPlugin(), react()],
    // currently excalibur plugins are commonjs
    // this forces vite to keep things from bundling ESM together with commonjs
    optimizeDeps: {
        exclude: ["excalibur"],
    },
    build: {
        assetsInlineLimit: 0, // excalibur cannot handle inlined xml in prod mode
        sourcemap: true,
        // Vite uses rollup currently for prod builds so a separate config is needed
        // to keep vite from bundling ESM together with commonjs
        rollupOptions: {
            output: {
                format: 'umd'
            }
        }
    }
});
