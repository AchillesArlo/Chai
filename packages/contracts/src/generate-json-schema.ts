import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { CanonicalCommandSchema, CanonicalEventSchema } from './index';

const outputDirectory = join(process.cwd(), 'schemas');

await mkdir(outputDirectory, { recursive: true });

await Promise.all([
  writeFile(
    join(outputDirectory, 'canonical-command.schema.json'),
    `${JSON.stringify(z.toJSONSchema(CanonicalCommandSchema), null, 2)}\n`,
    'utf8',
  ),
  writeFile(
    join(outputDirectory, 'canonical-event.schema.json'),
    `${JSON.stringify(z.toJSONSchema(CanonicalEventSchema), null, 2)}\n`,
    'utf8',
  ),
]);
