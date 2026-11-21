import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  ackWireSchema,
  commandWireSchema,
  configWireSchema,
  eventWireSchema,
  statusWireSchema,
  telemetryWireSchema,
} from '../src/index.js';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'json-schema');
mkdirSync(outDir, { recursive: true });

const schemas = {
  status: statusWireSchema,
  telemetry: telemetryWireSchema,
  command: commandWireSchema,
  ack: ackWireSchema,
  event: eventWireSchema,
  config: configWireSchema,
};
for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: 'input' });
  writeFileSync(join(outDir, `${name}.schema.json`), JSON.stringify(json, null, 2) + '\n');
}
console.log(`wrote ${Object.keys(schemas).length} schemas to ${outDir}`);
