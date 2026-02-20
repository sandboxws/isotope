package connectors

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/apache/arrow-go/v18/arrow/array"
	"github.com/apache/arrow-go/v18/arrow/memory"
	"github.com/twmb/franz-go/pkg/kgo"

	pb "github.com/sandboxws/isotope/runtime/internal/proto/isotope/v1"
	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// KafkaSource consumes records from a Kafka topic and produces Arrow RecordBatches.
type KafkaSource struct {
	topic            string
	bootstrapServers string
	format           string
	schema           *pb.Schema
	startupMode      string
	consumerGroup    string
	alloc            memory.Allocator
}

// NewKafkaSource creates a Kafka source connector.
func NewKafkaSource(topic, bootstrapServers, format string, schema *pb.Schema, startupMode, consumerGroup string) *KafkaSource {
	return &KafkaSource{
		topic:            topic,
		bootstrapServers: bootstrapServers,
		format:           format,
		schema:           schema,
		startupMode:      startupMode,
		consumerGroup:    consumerGroup,
	}
}

func (k *KafkaSource) Open(ctx *operator.Context) error {
	k.alloc = ctx.Alloc
	return nil
}

func (k *KafkaSource) Run(ctx *operator.Context, out chan<- arrow.Record) error {
	defer close(out)

	arrowSchema, err := protoSchemaToArrow(k.schema)
	if err != nil {
		return fmt.Errorf("kafka source: build schema: %w", err)
	}

	opts := []kgo.Opt{
		kgo.SeedBrokers(k.bootstrapServers),
		kgo.ConsumeTopics(k.topic),
	}

	if k.consumerGroup != "" {
		opts = append(opts, kgo.ConsumerGroup(k.consumerGroup))
	}

	switch k.startupMode {
	case "earliest-offset", "earliest":
		opts = append(opts, kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()))
	case "latest-offset", "latest":
		opts = append(opts, kgo.ConsumeResetOffset(kgo.NewOffset().AtEnd()))
	default:
		opts = append(opts, kgo.ConsumeResetOffset(kgo.NewOffset().AtStart()))
	}

	client, err := kgo.NewClient(opts...)
	if err != nil {
		return fmt.Errorf("kafka source: create client: %w", err)
	}
	defer client.Close()

	batchSize := defaultBatchSize
	var buffer []map[string]interface{}

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		fetches := client.PollFetches(context.Background())
		if errs := fetches.Errors(); len(errs) > 0 {
			for _, e := range errs {
				ctx.Logger.Error("kafka fetch error", "topic", e.Topic, "partition", e.Partition, "error", e.Err)
			}
			continue
		}

		fetches.EachRecord(func(rec *kgo.Record) {
			switch k.format {
			case "json":
				var row map[string]interface{}
				if err := json.Unmarshal(rec.Value, &row); err != nil {
					ctx.Logger.Error("kafka json decode error", "error", err)
					return
				}
				buffer = append(buffer, row)
			default:
				ctx.Logger.Error("unsupported format", "format", k.format)
			}
		})

		// Emit batches.
		for len(buffer) >= batchSize {
			chunk := buffer[:batchSize]
			buffer = buffer[batchSize:]

			batch, err := jsonRowsToRecord(k.alloc, arrowSchema, chunk)
			if err != nil {
				ctx.Logger.Error("kafka build batch error", "error", err)
				continue
			}

			select {
			case out <- batch:
				ctx.Metrics.BatchesProcessed.Add(1)
				ctx.Metrics.RowsProcessed.Add(int64(batchSize))
			case <-ctx.Done():
				batch.Release()
				return nil
			}
		}
	}
}

func (k *KafkaSource) Close() error { return nil }

// jsonRowsToRecord converts JSON row maps to an Arrow RecordBatch.
func jsonRowsToRecord(alloc memory.Allocator, schema *arrow.Schema, rows []map[string]interface{}) (arrow.Record, error) {
	numCols := schema.NumFields()
	builders := make([]array.Builder, numCols)
	for i := 0; i < numCols; i++ {
		builders[i] = array.NewBuilder(alloc, schema.Field(i).Type)
	}
	defer func() {
		for _, b := range builders {
			b.Release()
		}
	}()

	for _, row := range rows {
		for i := 0; i < numCols; i++ {
			f := schema.Field(i)
			val, exists := row[f.Name]
			if !exists || val == nil {
				builders[i].AppendNull()
				continue
			}
			appendJSONValue(builders[i], f.Type, val)
		}
	}

	arrays := make([]arrow.Array, numCols)
	for i, b := range builders {
		arrays[i] = b.NewArray()
	}

	rec := array.NewRecord(schema, arrays, int64(len(rows)))
	for _, a := range arrays {
		a.Release()
	}
	return rec, nil
}

func appendJSONValue(bldr array.Builder, dt arrow.DataType, val interface{}) {
	switch b := bldr.(type) {
	case *array.Int64Builder:
		switch v := val.(type) {
		case float64:
			b.Append(int64(v))
		case json.Number:
			n, _ := v.Int64()
			b.Append(n)
		default:
			b.AppendNull()
		}
	case *array.Float64Builder:
		switch v := val.(type) {
		case float64:
			b.Append(v)
		case json.Number:
			n, _ := v.Float64()
			b.Append(n)
		default:
			b.AppendNull()
		}
	case *array.StringBuilder:
		if s, ok := val.(string); ok {
			b.Append(s)
		} else {
			b.Append(fmt.Sprintf("%v", val))
		}
	case *array.BooleanBuilder:
		if v, ok := val.(bool); ok {
			b.Append(v)
		} else {
			b.AppendNull()
		}
	default:
		bldr.AppendNull()
	}
}
