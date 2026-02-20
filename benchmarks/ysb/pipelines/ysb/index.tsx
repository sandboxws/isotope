/**
 * Yahoo Streaming Benchmark (YSB) — Isotope implementation.
 *
 * Pipeline: KafkaSource → Filter(event_type = 'view') → Map(ad_id, event_time)
 *           → TumbleWindow(10s) → Aggregate(COUNT(*) GROUP BY ad_id) → KafkaSink
 */
import {
  Pipeline,
  KafkaSource,
  KafkaSink,
  Filter,
  Map,
  TumbleWindow,
  Aggregate,
  Schema,
  Field,
} from '@isotope/dsl';

// ── Ad-event input schema ───────────────────────────────────────────

const AdEventSchema = Schema({
  fields: {
    ad_id: Field.STRING(),
    ad_type: Field.STRING(),
    event_type: Field.STRING(),
    event_time: Field.BIGINT(),
    ip_address: Field.STRING(),
  },
});

// ── YSB Pipeline ────────────────────────────────────────────────────

export default (
  <Pipeline name="ysb" parallelism={4} mode="streaming">
    <KafkaSource
      topic="ad-events"
      bootstrapServers="kafka:9092"
      format="json"
      schema={AdEventSchema}
      startupMode="latest-offset"
      consumerGroup="ysb-benchmark"
    >
      <Filter condition="event_type = 'view'">
        <Map select={{ ad_id: 'ad_id', event_time: 'event_time' }}>
          <TumbleWindow size="10 SECOND" on="event_time">
            <Aggregate
              groupBy={['ad_id']}
              select={{ view_count: 'COUNT(*)' }}
            >
              <KafkaSink
                topic="ysb-output"
                bootstrapServers="kafka:9092"
                format="json"
                keyBy={['ad_id']}
              />
            </Aggregate>
          </TumbleWindow>
        </Map>
      </Filter>
    </KafkaSource>
  </Pipeline>
);
