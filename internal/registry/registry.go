package registry

import (
	"fmt"

	"github.com/rodrigo-brito/ninjabot/strategy"
)

// StrategyConfig holds generic construction parameters shared across strategies.
type StrategyConfig struct {
	Timeframe  string
	FastPeriod int
	SlowPeriod int
}

// Factory is a constructor function that builds a Strategy from a StrategyConfig.
type Factory func(cfg StrategyConfig) strategy.Strategy

var globalRegistry = map[string]Factory{}

// Register adds a Strategy factory under the given name.
// Calling Register with the same name twice overwrites the previous entry.
func Register(name string, factory Factory) {
	globalRegistry[name] = factory
}

// Build constructs a Strategy by name using the provided config.
// Returns an error if no factory is registered for that name.
func Build(name string, cfg StrategyConfig) (strategy.Strategy, error) {
	factory, ok := globalRegistry[name]
	if !ok {
		return nil, fmt.Errorf("unknown strategy %q; registered strategies: %v", name, Registered())
	}
	return factory(cfg), nil
}

// Registered returns the names of all registered strategies.
func Registered() []string {
	names := make([]string, 0, len(globalRegistry))
	for name := range globalRegistry {
		names = append(names, name)
	}
	return names
}
