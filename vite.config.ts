import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { resolveAwsTestConfig } from "./scripts/aws-test-config.mjs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const aws = resolveAwsTestConfig(loadEnv(mode, process.cwd(), 'VITE_'));
  const backendStamp: Plugin | null = aws ? {
    name: 'aws-test-backend-stamp',
    generateBundle() {
      this.emitFile({type:'asset',fileName:'backend-profile.json',source:JSON.stringify({
        target:'aws-test',backendOrigin:aws.url,scope:'application-read-preview',publicCutover:false,
      },null,2)});
    },
  } : null;
  return ({
  define: {
    'import.meta.env.VITE_BACKEND_TARGET': JSON.stringify(aws ? 'aws-test' : 'legacy'),
    ...(aws ? {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(aws.url),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(aws.anonKey),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(aws.anonKey),
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify('aws-test'),
    } : {}),
  },
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [react(), backendStamp].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: aws ? 'dist-aws-test' : 'dist',
    rollupOptions: {
      output: {
        // Asset file names with content hash for CDN caching
        assetFileNames: (assetInfo) => {
          if (!assetInfo.name) return `assets/[name].[hash][extname]`;
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          if (/png|jpe?g|svg|gif|tiff|bmp|ico|webp|avif/i.test(ext)) {
            return `assets/images/[name].[hash][extname]`;
          } else if (/woff|woff2|ttf|eot/i.test(ext)) {
            return `assets/fonts/[name].[hash][extname]`;
          }
          return `assets/[name].[hash][extname]`;
        },
        chunkFileNames: 'assets/js/[name].[hash].js',
        entryFileNames: 'assets/js/[name].[hash].js',
        manualChunks: {
          // Core React stack
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI Components (Radix UI)
          'vendor-ui': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-tabs',
            '@radix-ui/react-select',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip'
          ],
          // Charts
          'vendor-chart': ['recharts'],
          // Icons
          'vendor-icons': ['lucide-react'],
          // Query & State
          'vendor-query': ['@tanstack/react-query'],
          // Backend
          'vendor-supabase': ['@supabase/supabase-js'],
          // Forms
          'vendor-forms': ['react-hook-form', '@hookform/resolvers', 'zod']
        },
      },
    },
    // CSS Code Splitting für bessere Performance
    cssCodeSplit: true,
    // Chunk Size Warnings erhöhen für vendor bundles
    chunkSizeWarningLimit: 1000,
    // Source Maps nur in Development
    sourcemap: mode === 'development',
    // Minify für Production
    minify: mode === 'production' || mode === 'aws-test' ? 'esbuild' : false,
    // Target moderne Browser für kleinere Bundles
    target: 'es2020',
    // Asset inlining threshold (reduce HTTP requests)
    assetsInlineLimit: 4096,
  },
  // Optimierung für Production
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
});
