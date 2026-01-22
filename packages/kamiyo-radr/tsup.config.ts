import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'eliza/index': 'src/eliza/index.ts',
    'langchain/index': 'src/langchain/index.ts',
  },
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: [
    '@kamiyo/sdk',
    '@kamiyo/solana-privacy',
    '@langchain/core',
    'zod',
  ],
});
