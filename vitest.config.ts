import { defineConfig, configDefaults } from 'vitest/config';
import { compileModule } from 'svelte/compiler';
import type { Plugin } from 'vite';

// Compile `*.svelte.ts` rune modules in CLIENT mode for the `runes` project.
//
// In the `node` project these modules are not compiled at all: importing one throws
// `ReferenceError: $state is not defined`. Compiling in CLIENT mode is deliberate — a server-mode compile
// turns `$state` into an inert plain value, so reactivity assertions would pass vacuously (including
// against the very bug a test is meant to guard), and the app ships the client runtime. Scope is
// deliberately narrow: rune MODULES only — components are never unit-mounted.
const svelteRuneModules = (): Plugin => ({
  name: 'axis-svelte-rune-modules',
  // 'post' so Vite's esbuild has already stripped the TypeScript — `compileModule` parses JS only.
  enforce: 'post',
  transform(code, id) {
    if (!/\.svelte\.[jt]s$/.test(id.split('?')[0]!)) return;
    const { js } = compileModule(code, { generate: 'client', dev: true, filename: id });
    return { code: js.code, map: js.map };
  }
});

// Standalone from vite.config.ts on purpose: the app's Vite config loads the SvelteKit plugin, which we
// don't want in unit tests. Two projects:
//
//   node  — the bulk of the suite: plain TS units (transports, OTA compat, pure workbench logic) with
//           mocked native plugins. Node environment, no DOM, no Svelte compilation.
//   runes — `*.runes.test.ts`, for the rune-based stores. Adds the transform above plus
//           `resolve.conditions: ['browser']` so `svelte` resolves to the client runtime. Both are
//           scoped to this project so they can't change how the node suite builds or resolves.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['src/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'src/**/*.runes.test.ts'],
          environment: 'node'
        }
      },
      {
        plugins: [svelteRuneModules()],
        resolve: { conditions: ['browser'] },
        test: {
          name: 'runes',
          include: ['src/**/*.runes.test.ts'],
          environment: 'node'
        }
      }
    ]
  }
});
