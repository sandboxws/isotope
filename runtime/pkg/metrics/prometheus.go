// Package metrics provides Prometheus instrumentation for the Isotope runtime.
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// RowsProcessed counts total rows processed by each operator.
	RowsProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "isotope_rows_processed_total",
		Help: "Total number of rows processed by operator",
	}, []string{"operator_id", "operator_name"})

	// BatchesProcessed counts total batches processed by each operator.
	BatchesProcessed = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "isotope_batches_processed_total",
		Help: "Total number of batches processed by operator",
	}, []string{"operator_id", "operator_name"})

	// BatchLatency tracks per-batch processing latency.
	BatchLatency = promauto.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "isotope_batch_latency_seconds",
		Help:    "Latency of batch processing in seconds",
		Buckets: []float64{0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0},
	}, []string{"operator_id", "operator_name"})

	// Errors counts errors by operator.
	Errors = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "isotope_errors_total",
		Help: "Total number of errors by operator",
	}, []string{"operator_id", "operator_name"})

	// GCPauseSummary tracks GC pause durations.
	GCPauseSummary = promauto.NewSummary(prometheus.SummaryOpts{
		Name:       "isotope_gc_pause_seconds",
		Help:       "GC pause duration in seconds",
		Objectives: map[float64]float64{0.5: 0.05, 0.9: 0.01, 0.99: 0.001},
	})
)

// ServeMetrics starts an HTTP server on the given address to serve
// Prometheus metrics at /metrics.
func ServeMetrics(addr string) *http.Server {
	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())
	server := &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	go server.ListenAndServe()
	return server
}
