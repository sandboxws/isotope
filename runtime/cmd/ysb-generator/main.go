// Command ysb-generator produces synthetic ad-event data to a Kafka topic
// at a configurable event rate for the Yahoo Streaming Benchmark.
//
// Schema: { ad_id string, ad_type string, event_type string, event_time int64, ip_address string }
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"os"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/twmb/franz-go/pkg/kgo"
)

// AdEvent is the YSB ad-event schema.
type AdEvent struct {
	AdID      string `json:"ad_id"`
	AdType    string `json:"ad_type"`
	EventType string `json:"event_type"`
	EventTime int64  `json:"event_time"`
	IPAddress string `json:"ip_address"`
}

var (
	adTypes    = []string{"banner", "modal", "sidebar", "footer", "native"}
	eventTypes = []string{"view", "click", "purchase"}
	// Weight view events heavily (as in real ad systems).
	eventWeights = []int{80, 15, 5}
)

func main() {
	brokers := flag.String("brokers", "localhost:9092", "Kafka bootstrap servers")
	topic := flag.String("topic", "ad-events", "Kafka topic to produce to")
	rate := flag.Int64("rate", 100000, "Events per second")
	numCampaigns := flag.Int("campaigns", 100, "Number of distinct campaigns (ad_ids)")
	duration := flag.Duration("duration", 0, "Duration to run (0=infinite)")
	flag.Parse()

	slog.Info("starting YSB generator",
		"brokers", *brokers,
		"topic", *topic,
		"rate", *rate,
		"campaigns", *numCampaigns,
	)

	client, err := kgo.NewClient(
		kgo.SeedBrokers(*brokers),
		kgo.DefaultProduceTopic(*topic),
		kgo.ProducerBatchMaxBytes(1024*1024),    // 1MB batches
		kgo.MaxBufferedRecords(100_000),          // Buffer up to 100K
		kgo.ProducerLinger(10*time.Millisecond),  // Batch for 10ms
	)
	if err != nil {
		slog.Error("failed to create Kafka client", "error", err)
		os.Exit(1)
	}
	defer client.Close()

	// Pre-generate campaign IDs.
	campaigns := make([]string, *numCampaigns)
	for i := range campaigns {
		campaigns[i] = fmt.Sprintf("campaign_%04d", i)
	}

	// Pre-compute cumulative weights for event type selection.
	cumWeights := make([]int, len(eventWeights))
	cumWeights[0] = eventWeights[0]
	for i := 1; i < len(eventWeights); i++ {
		cumWeights[i] = cumWeights[i-1] + eventWeights[i]
	}
	totalWeight := cumWeights[len(cumWeights)-1]

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		slog.Info("shutting down generator...")
		cancel()
	}()

	// Apply duration limit if set.
	if *duration > 0 {
		ctx, cancel = context.WithTimeout(ctx, *duration)
		defer cancel()
	}

	var totalSent atomic.Int64

	// Report throughput every second.
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		var lastCount int64
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				current := totalSent.Load()
				delta := current - lastCount
				lastCount = current
				slog.Info("generator throughput", "events/sec", delta, "total", current)
			}
		}
	}()

	// Produce events at the target rate.
	batchSize := 1000
	interval := time.Duration(float64(time.Second) * float64(batchSize) / float64(*rate))
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	rng := rand.New(rand.NewPCG(42, 0))

	for {
		select {
		case <-ctx.Done():
			// Flush remaining.
			if err := client.Flush(context.Background()); err != nil {
				slog.Warn("flush error", "error", err)
			}
			total := totalSent.Load()
			slog.Info("generator stopped", "total_events", total)
			return
		case <-ticker.C:
			now := time.Now().UnixMilli()
			for i := 0; i < batchSize; i++ {
				// Pick event type by weighted random.
				w := rng.IntN(totalWeight)
				eventIdx := 0
				for j, cw := range cumWeights {
					if w < cw {
						eventIdx = j
						break
					}
				}

				event := AdEvent{
					AdID:      campaigns[rng.IntN(len(campaigns))],
					AdType:    adTypes[rng.IntN(len(adTypes))],
					EventType: eventTypes[eventIdx],
					EventTime: now + int64(i), // Slightly stagger event times
					IPAddress: fmt.Sprintf("%d.%d.%d.%d", rng.IntN(256), rng.IntN(256), rng.IntN(256), rng.IntN(256)),
				}

				value, _ := json.Marshal(event)
				client.Produce(ctx, &kgo.Record{
					Key:   []byte(event.AdID),
					Value: value,
				}, nil)
			}
			totalSent.Add(int64(batchSize))
		}
	}
}
