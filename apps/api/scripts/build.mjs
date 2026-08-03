import * as esbuild from 'esbuild';

import { buildOptions } from './esbuild-options.mjs';

await esbuild.build(buildOptions);
