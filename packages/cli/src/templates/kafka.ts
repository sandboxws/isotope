import type { ScaffoldOptions, TemplateFile } from '../commands/new.js';
import { sharedFiles } from './shared.js';

export function getKafkaTemplates(opts: ScaffoldOptions): TemplateFile[] {
  return [
    ...sharedFiles(opts),
    {
      path: 'pipelines/main/index.tsx',
      content: `import { Pipeline, KafkaSource, KafkaSink, Filter, Map, Schema, Field } from '@isotope/dsl';

const EventSchema = Schema({
  fields: {
    id: Field.BIGINT(),
    userId: Field.STRING(),
    eventType: Field.STRING(),
    payload: Field.STRING(),
    timestamp: Field.TIMESTAMP(3),
  },
});

export default (
  <Pipeline name="main" mode="streaming">
    <KafkaSource
      topic="events"
      schema={EventSchema}
      bootstrapServers="localhost:9092"
      consumerGroup="main-pipeline"
    >
      <Filter condition="eventType <> 'internal'">
        <Map select={{ id: 'id', userId: 'userId', eventType: 'eventType', ts: 'timestamp' }}>
          <KafkaSink
            topic="filtered-events"
            bootstrapServers="localhost:9092"
          />
        </Map>
      </Filter>
    </KafkaSource>
  </Pipeline>
);
`,
    },
  ];
}
