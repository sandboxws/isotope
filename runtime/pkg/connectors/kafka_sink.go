package connectors

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/apache/arrow-go/v18/arrow"
	"github.com/twmb/franz-go/pkg/kgo"

	"github.com/sandboxws/isotope/runtime/pkg/operator"
)

// KafkaSink serializes Arrow RecordBatches and produces them to a Kafka topic.
type KafkaSink struct {
	topic            string
	bootstrapServers string
	format           string
	keyBy            []string
	client           *kgo.Client
}

// NewKafkaSink creates a Kafka sink connector.
func NewKafkaSink(topic, bootstrapServers, format string, keyBy []string) *KafkaSink {
	return &KafkaSink{
		topic:            topic,
		bootstrapServers: bootstrapServers,
		format:           format,
		keyBy:            keyBy,
	}
}

func (k *KafkaSink) Open(_ *operator.Context) error {
	client, err := kgo.NewClient(
		kgo.SeedBrokers(k.bootstrapServers),
		kgo.DefaultProduceTopic(k.topic),
	)
	if err != nil {
		return fmt.Errorf("kafka sink: create client: %w", err)
	}
	k.client = client
	return nil
}

func (k *KafkaSink) WriteBatch(batch arrow.Record) error {
	numRows := int(batch.NumRows())
	schema := batch.Schema()

	for row := 0; row < numRows; row++ {
		// Build JSON record.
		record := make(map[string]interface{}, schema.NumFields())
		for col := 0; col < schema.NumFields(); col++ {
			f := schema.Field(col)
			arr := batch.Column(col)
			if arr.IsNull(row) {
				record[f.Name] = nil
			} else {
				record[f.Name] = extractJSONValue(arr, row)
			}
		}

		value, err := json.Marshal(record)
		if err != nil {
			return fmt.Errorf("kafka sink: marshal row %d: %w", row, err)
		}

		rec := &kgo.Record{
			Value: value,
		}

		// Set key for partitioning.
		if len(k.keyBy) > 0 {
			keyParts := make(map[string]interface{}, len(k.keyBy))
			for _, keyCol := range k.keyBy {
				if v, ok := record[keyCol]; ok {
					keyParts[keyCol] = v
				}
			}
			keyBytes, _ := json.Marshal(keyParts)
			rec.Key = keyBytes
		}

		k.client.Produce(context.Background(), rec, nil)
	}

	// Flush to ensure delivery.
	if err := k.client.Flush(context.Background()); err != nil {
		return fmt.Errorf("kafka sink: flush: %w", err)
	}
	return nil
}

func (k *KafkaSink) Close() error {
	if k.client != nil {
		k.client.Close()
	}
	return nil
}

func extractJSONValue(arr arrow.Array, row int) interface{} {
	return formatValue(arr, row)
}
