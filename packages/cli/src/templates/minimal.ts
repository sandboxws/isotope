import type { ScaffoldOptions, TemplateFile } from '../commands/new.js';
import { sharedFiles } from './shared.js';

export function getMinimalTemplates(opts: ScaffoldOptions): TemplateFile[] {
  return [
    ...sharedFiles(opts),
    {
      path: 'pipelines/main/index.tsx',
      content: `import { Pipeline, GeneratorSource, ConsoleSink, Schema, Field } from '@isotope/dsl';

const CounterSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    value: Field.STRING(),
    timestamp: Field.TIMESTAMP(3),
  },
});

export default (
  <Pipeline name="main">
    <GeneratorSource schema={CounterSchema} rowsPerSecond={1}>
      <ConsoleSink />
    </GeneratorSource>
  </Pipeline>
);
`,
    },
  ];
}
