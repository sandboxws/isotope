package engine

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const defaultShutdownTimeout = 30 * time.Second

// RunWithGracefulShutdown starts the engine and handles SIGTERM/SIGINT for graceful shutdown.
// It blocks until the engine completes or the shutdown timeout expires.
func RunWithGracefulShutdown(ctx context.Context, engine *Engine, timeout time.Duration) error {
	if timeout == 0 {
		timeout = defaultShutdownTimeout
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// Listen for OS signals.
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGTERM, syscall.SIGINT)

	// Run the engine in a separate goroutine.
	errCh := make(chan error, 1)
	go func() {
		errCh <- engine.Run(ctx)
	}()

	// Wait for signal or engine completion.
	select {
	case sig := <-sigCh:
		slog.Info("received shutdown signal", "signal", sig)
		engine.Stop()

		// Wait for graceful drain with timeout.
		select {
		case err := <-errCh:
			return err
		case <-time.After(timeout):
			slog.Warn("shutdown timeout expired, forcing exit", "timeout", timeout)
			cancel()
			return <-errCh
		}

	case err := <-errCh:
		return err
	}
}
