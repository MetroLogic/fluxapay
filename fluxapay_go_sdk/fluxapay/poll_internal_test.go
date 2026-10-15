package fluxapay

import (
	"testing"
	"time"
)

func TestNextPollIntervalBackoff(t *testing.T) {
	interval := 2 * time.Second
	limit := 10 * time.Second
	want := []time.Duration{3 * time.Second, 4500 * time.Millisecond, 6750 * time.Millisecond, 10 * time.Second, 10 * time.Second}
	for i, w := range want {
		interval = nextPollInterval(interval, limit, 1.5)
		if interval != w {
			t.Fatalf("step %d: interval = %v, want %v", i, interval, w)
		}
	}
}

func TestNextPollIntervalFixed(t *testing.T) {
	if got := nextPollInterval(time.Second, time.Minute, 1); got != time.Second {
		t.Fatalf("got %v, want 1s with multiplier 1", got)
	}
}

func TestPollOptionsIgnoreInvalidValues(t *testing.T) {
	cfg := defaultPollConfig()
	for _, o := range []PollOption{
		WithPollInterval(0),
		WithMaxPollInterval(-time.Second),
		WithPollBackoff(0.5),
		WithPollTimeout(0),
		WithSuccessStatuses(),
		WithFailureStatuses(),
	} {
		o(cfg)
	}
	if cfg.interval != defaultPollInterval || cfg.maxInterval != defaultMaxPollInterval || cfg.backoff != defaultPollBackoff || cfg.timeout != 0 {
		t.Fatalf("invalid options changed config: %+v", cfg)
	}
	if !cfg.success["confirmed"] || !cfg.failure["expired"] {
		t.Fatalf("default statuses lost: %+v", cfg)
	}
}
