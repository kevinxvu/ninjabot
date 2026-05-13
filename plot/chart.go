package plot

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/strategy"

	"github.com/StudioSol/set"
)

type Chart struct {
	sync.Mutex
	debug           bool
	candles         map[string][]Candle
	dataframe       map[string]*model.Dataframe
	ordersIDsByPair map[string]*set.LinkedHashSetINT64
	orderByID       map[int64]model.Order
	indicators      []Indicator
	paperWallet     *exchange.PaperWallet
	strategy        strategy.Strategy
	lastUpdate      time.Time
}

type Candle struct {
	Time   time.Time     `json:"time"`
	Open   float64       `json:"open"`
	Close  float64       `json:"close"`
	High   float64       `json:"high"`
	Low    float64       `json:"low"`
	Volume float64       `json:"volume"`
	Orders []model.Order `json:"orders"`
}

type Shape struct {
	StartX time.Time `json:"x0"`
	EndX   time.Time `json:"x1"`
	StartY float64   `json:"y0"`
	EndY   float64   `json:"y1"`
	Color  string    `json:"color"`
}

type assetValue struct {
	Time  time.Time `json:"time"`
	Value float64   `json:"value"`
}

type indicatorMetric struct {
	Name   string      `json:"name"`
	Time   []time.Time `json:"time"`
	Values []float64   `json:"value"`
	Color  string      `json:"color"`
	Style  string      `json:"style"`
}

type plotIndicator struct {
	Name    string            `json:"name"`
	Overlay bool              `json:"overlay"`
	Metrics []indicatorMetric `json:"metrics"`
	Warmup  int               `json:"-"`
}

type drawdown struct {
	Value string    `json:"value"`
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

type Indicator interface {
	Name() string
	Overlay() bool
	Warmup() int
	Metrics() []IndicatorMetric
	Load(dataframe *model.Dataframe)
}

type IndicatorMetric struct {
	Name   string
	Color  string
	Style  string
	Values model.Series[float64]
	Time   []time.Time
}

func (c *Chart) OnOrder(order model.Order) {
	c.Lock()
	defer c.Unlock()

	c.ordersIDsByPair[order.Pair].Add(order.ID)
	c.orderByID[order.ID] = order
}

func (c *Chart) OnCandle(candle model.Candle) {
	c.Lock()
	defer c.Unlock()

	lastIndex := len(c.candles[candle.Pair]) - 1
	if candle.Complete && (len(c.candles[candle.Pair]) == 0 ||
		candle.Time.After(c.candles[candle.Pair][lastIndex].Time)) {

		c.candles[candle.Pair] = append(c.candles[candle.Pair], Candle{
			Time:   candle.Time,
			Open:   candle.Open,
			Close:  candle.Close,
			High:   candle.High,
			Low:    candle.Low,
			Volume: candle.Volume,
			Orders: make([]model.Order, 0),
		})

		if c.dataframe[candle.Pair] == nil {
			c.dataframe[candle.Pair] = &model.Dataframe{
				Pair:     candle.Pair,
				Metadata: make(map[string]model.Series[float64]),
			}
			c.ordersIDsByPair[candle.Pair] = set.NewLinkedHashSetINT64()
		}

		c.dataframe[candle.Pair].Close = append(c.dataframe[candle.Pair].Close, candle.Close)
		c.dataframe[candle.Pair].Open = append(c.dataframe[candle.Pair].Open, candle.Open)
		c.dataframe[candle.Pair].High = append(c.dataframe[candle.Pair].High, candle.High)
		c.dataframe[candle.Pair].Low = append(c.dataframe[candle.Pair].Low, candle.Low)
		c.dataframe[candle.Pair].Volume = append(c.dataframe[candle.Pair].Volume, candle.Volume)
		c.dataframe[candle.Pair].Time = append(c.dataframe[candle.Pair].Time, candle.Time)
		c.dataframe[candle.Pair].LastUpdate = candle.Time
		for k, v := range candle.Metadata {
			c.dataframe[candle.Pair].Metadata[k] = append(c.dataframe[candle.Pair].Metadata[k], v)
		}
		c.lastUpdate = time.Now()
	}
}

func (c *Chart) equityValuesByPair(pair string) (asset []assetValue, quote []assetValue) {
	assetValues := make([]assetValue, 0)
	equityValues := make([]assetValue, 0)

	if c.paperWallet != nil {
		asset, _ := exchange.SplitAssetQuote(pair)
		for _, value := range c.paperWallet.AssetValues(asset) {
			assetValues = append(assetValues, assetValue{
				Time:  value.Time,
				Value: value.Value,
			})
		}

		for _, value := range c.paperWallet.EquityValues() {
			equityValues = append(equityValues, assetValue{
				Time:  value.Time,
				Value: value.Value,
			})
		}
	}

	return assetValues, equityValues
}

func (c *Chart) EquityValuesByPair(pair string) ([]assetValue, []assetValue) {
	return c.equityValuesByPair(pair)
}

func (c *Chart) IndicatorsByPair(pair string) []plotIndicator {
	indicators := make([]plotIndicator, 0)
	for _, i := range c.indicators {
		i.Load(c.dataframe[pair])
		indicator := plotIndicator{
			Name:    i.Name(),
			Overlay: i.Overlay(),
			Warmup:  i.Warmup(),
			Metrics: make([]indicatorMetric, 0),
		}

		for _, metric := range i.Metrics() {
			indicator.Metrics = append(indicator.Metrics, indicatorMetric{
				Name:   metric.Name,
				Values: metric.Values,
				Time:   metric.Time,
				Color:  metric.Color,
				Style:  metric.Style,
			})
		}

		indicators = append(indicators, indicator)
	}

	if c.strategy != nil {
		warmup := c.strategy.WarmupPeriod()
		strategyIndicators := c.strategy.Indicators(c.dataframe[pair])
		for _, i := range strategyIndicators {
			indicator := plotIndicator{
				Name:    i.GroupName,
				Overlay: i.Overlay,
				Warmup:  i.Warmup,
				Metrics: make([]indicatorMetric, 0),
			}

			for _, metric := range i.Metrics {
				if len(metric.Values) < warmup {
					continue
				}

				indicator.Metrics = append(indicator.Metrics, indicatorMetric{
					Time:   i.Time[i.Warmup:],
					Values: metric.Values[i.Warmup:],
					Name:   metric.Name,
					Color:  metric.Color,
					Style:  string(metric.Style),
				})
			}
			indicators = append(indicators, indicator)
		}
	}

	return indicators
}

func (c *Chart) CandlesByPair(pair string) []Candle {
	candles := make([]Candle, len(c.candles[pair]))
	orderSet := c.ordersIDsByPair[pair]
	if orderSet == nil {
		return candles
	}

	orderCheck := make(map[int64]bool)
	for id := range orderSet.Iter() {
		orderCheck[id] = true
	}

	for i := range c.candles[pair] {
		candles[i] = c.candles[pair][i]
		for id := range orderSet.Iter() {
			order := c.orderByID[id]

			if i < len(c.candles[pair])-1 &&
				(order.UpdatedAt.After(c.candles[pair][i].Time) &&
					order.UpdatedAt.Before(c.candles[pair][i+1].Time)) ||
				order.UpdatedAt.Equal(c.candles[pair][i].Time) {

				delete(orderCheck, id)
				candles[i].Orders = append(candles[i].Orders, order)
			}
		}
	}

	for id := range orderCheck {
		order := c.orderByID[id]
		if order.UpdatedAt.After(c.candles[pair][len(c.candles)-1].Time) {
			c.candles[pair][len(c.candles)-1].Orders = append(c.candles[pair][len(c.candles)-1].Orders, order)
		}
	}

	return candles
}

func (c *Chart) ShapesByPair(pair string) []Shape {
	shapes := make([]Shape, 0)
	if c.ordersIDsByPair[pair] == nil {
		return shapes
	}
	for id := range c.ordersIDsByPair[pair].Iter() {
		order := c.orderByID[id]

		if order.Type != model.OrderTypeStopLoss &&
			order.Type != model.OrderTypeLimitMaker {
			continue
		}

		shape := Shape{
			StartX: order.CreatedAt,
			EndX:   order.UpdatedAt,
			StartY: order.RefPrice,
			EndY:   order.Price,
			Color:  "rgba(0, 255, 0, 0.3)",
		}

		if order.Type == model.OrderTypeStopLoss {
			shape.Color = "rgba(255, 0, 0, 0.3)"
		}

		shapes = append(shapes, shape)
	}

	return shapes
}

func (c *Chart) OrderStringByPair(pair string) [][]string {
	orders := make([][]string, 0)
	if c.ordersIDsByPair[pair] == nil {
		return orders
	}
	for id := range c.ordersIDsByPair[pair].Iter() {
		o := c.orderByID[id]
		var profit string
		if o.Profit != 0 {
			profit = fmt.Sprintf("%.2f", o.Profit)
		}
		orderString := fmt.Sprintf("%s,%s,%s,%d,%s,%f,%f,%.2f,%s",
			o.CreatedAt, o.Status, o.Side, o.ID, o.Type, o.Quantity, o.Price, o.Quantity*o.Price, profit)
		order := strings.Split(orderString, ",")
		orders = append(orders, order)
	}
	return orders
}

func (c *Chart) LastUpdate() time.Time {
	c.Lock()
	defer c.Unlock()
	return c.lastUpdate
}

func (c *Chart) Candles() map[string][]Candle {
	c.Lock()
	defer c.Unlock()
	return c.candles
}

func (c *Chart) PaperWallet() *exchange.PaperWallet {
	c.Lock()
	defer c.Unlock()
	return c.paperWallet
}

// Reset clears all accumulated candle, order and dataframe data so the chart
// can be reused for a new backtest run without restarting the server.
func (c *Chart) Reset() {
	c.Lock()
	defer c.Unlock()
	c.candles = make(map[string][]Candle)
	c.dataframe = make(map[string]*model.Dataframe)
	c.ordersIDsByPair = make(map[string]*set.LinkedHashSetINT64)
	c.orderByID = make(map[int64]model.Order)
	c.strategy = nil
	c.paperWallet = nil
	c.lastUpdate = time.Time{}
}

// SetStrategy updates the strategy used to compute chart indicators.
func (c *Chart) SetStrategy(s strategy.Strategy) {
	c.Lock()
	defer c.Unlock()
	c.strategy = s
}

// SetPaperWallet updates the paper wallet used for equity and drawdown data.
func (c *Chart) SetPaperWallet(w *exchange.PaperWallet) {
	c.Lock()
	defer c.Unlock()
	c.paperWallet = w
}

type Option func(*Chart)

func WithStrategyIndicators(strategy strategy.Strategy) Option {
	return func(chart *Chart) {
		chart.strategy = strategy
	}
}

func WithPaperWallet(paperWallet *exchange.PaperWallet) Option {
	return func(chart *Chart) {
		chart.paperWallet = paperWallet
	}
}

// WithDebug starts chart without compress
func WithDebug() Option {
	return func(chart *Chart) {
		chart.debug = true
	}
}

func WithCustomIndicators(indicators ...Indicator) Option {
	return func(chart *Chart) {
		chart.indicators = indicators
	}
}

func NewChart(options ...Option) (*Chart, error) {
	chart := &Chart{
		candles:         make(map[string][]Candle),
		dataframe:       make(map[string]*model.Dataframe),
		ordersIDsByPair: make(map[string]*set.LinkedHashSetINT64),
		orderByID:       make(map[int64]model.Order),
	}

	for _, option := range options {
		option(chart)
	}

	return chart, nil
}
