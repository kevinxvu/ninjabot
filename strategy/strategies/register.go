package strategies

import (
	"github.com/rodrigo-brito/ninjabot/internal/registry"
	"github.com/rodrigo-brito/ninjabot/strategy"
)

// init registers all built-in strategies into the global strategy registry.
// Importing this package (or strategy/strategies) is enough to make these
// strategies available via registry.Build.
func init() {
	registry.Register("emacross", func(cfg registry.StrategyConfig) strategy.Strategy {
		return NewCrossEMA(cfg.Timeframe, cfg.FastPeriod, cfg.SlowPeriod)
	})

	registry.Register("turtle", func(cfg registry.StrategyConfig) strategy.Strategy {
		return &Turtle{}
	})
}
