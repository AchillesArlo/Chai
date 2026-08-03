// esbuild does not and will not support `emitDecoratorMetadata`
// (https://github.com/evanw/esbuild/issues/257 - confirmed permanent by the
// maintainer). NestJS's DI container and class-validator's ValidationPipe
// both rely on that metadata to resolve constructor parameter types at
// runtime. Without it, DI silently resolves `undefined` and DTO validation
// silently no-ops instead of failing loudly (BUG-ESBUILD-1/2).
//
// This plugin pre-transforms every `.ts` file esbuild loads through SWC
// (which does support `emitDecoratorMetadata`) before esbuild strips types
// and bundles. It leaves esbuild's bundling, aliasing, and externalization
// untouched - only the decorator-metadata step is delegated to SWC.
import { readFile } from 'node:fs/promises';

import { transform } from '@swc/core';

/** @returns {import('esbuild').Plugin} */
export function swcDecoratorMetadataPlugin() {
  return {
    name: 'swc-decorator-metadata',
    setup(build) {
      build.onLoad({ filter: /\.ts$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        const result = await transform(source, {
          filename: args.path,
          jsc: {
            parser: { syntax: 'typescript', decorators: true },
            transform: {
              decoratorMetadata: true,
              legacyDecorator: true,
            },
            target: 'es2022',
            keepClassNames: true,
          },
          sourceMaps: false,
        });
        return { contents: result.code, loader: 'js' };
      });
    },
  };
}
