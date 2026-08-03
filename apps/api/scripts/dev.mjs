import { spawn } from 'node:child_process';

import * as esbuild from 'esbuild';

import { buildOptions } from './esbuild-options.mjs';

let child = null;

function restart() {
  if (child) {
    child.kill();
  }
  child = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'inherit',
    env: process.env,
  });
}

const ctx = await esbuild.context({
  ...buildOptions,
  plugins: [
    ...buildOptions.plugins,
    {
      name: 'restart-on-rebuild',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) {
            restart();
          }
        });
      },
    },
  ],
});

await ctx.watch();

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    if (child) {
      child.kill();
    }
    void ctx.dispose().finally(() => process.exit(0));
  });
}
