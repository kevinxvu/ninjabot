package handler

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/rodrigo-brito/ninjabot/exchange"
	"github.com/rodrigo-brito/ninjabot/model"
	"github.com/rodrigo-brito/ninjabot/server/telegram"
	"github.com/rodrigo-brito/ninjabot/storage"
	"github.com/rodrigo-brito/ninjabot/tools/log"
)

const alertSendTimeout = 20 * time.Second

// telegramSender delivers one Telegram message; *telegram.Client implements it.
type telegramSender interface {
	SendMessage(ctx context.Context, token string, msg telegram.Message) error
}

// SignalAlerter sends Telegram alerts for realtime signal sessions. Alerts
// only describe what the strategy did on the session's paper wallet; they never
// place real orders.
type SignalAlerter struct {
	settings storage.TelegramAlertSettingsStorage
	sessions storage.Storage
	sender   telegramSender
}

// NewSignalAlerter returns an alerter, or nil when db cannot store settings.
func NewSignalAlerter(db storage.Storage, sender telegramSender) *SignalAlerter {
	settings, ok := db.(storage.TelegramAlertSettingsStorage)
	if !ok {
		return nil
	}
	return &SignalAlerter{settings: settings, sessions: db, sender: sender}
}

// activeSettings returns the settings when alerts are enabled and deliverable.
func (a *SignalAlerter) activeSettings() (*model.TelegramAlertSettings, bool) {
	settings, err := a.settings.GetTelegramAlertSettings()
	if err != nil {
		log.Errorf("telegram alerts: load settings: %v", err)
		return nil, false
	}
	return settings, settings.Enabled && settings.Configured()
}

func (a *SignalAlerter) send(settings *model.TelegramAlertSettings, text string) error {
	ctx, cancel := context.WithTimeout(context.Background(), alertSendTimeout)
	defer cancel()
	return a.sender.SendMessage(ctx, settings.BotToken, telegram.Message{
		ChatID: settings.ChatID,
		Text:   text,
		Silent: settings.Silent,
	})
}

// sendOrderAlert sends the alert for a filled session order, if the session
// and the global settings allow it.
func (a *SignalAlerter) sendOrderAlert(sessionID string, order model.Order) {
	if order.Status != model.OrderStatusTypeFilled {
		return
	}
	settings, ok := a.activeSettings()
	if !ok {
		return
	}
	if (order.Side == model.SideTypeBuy && !settings.NotifyBuy) || (order.Side == model.SideTypeSell && !settings.NotifySell) {
		return
	}

	// Read the flag at send time so toggling alerts applies to running bots.
	session, err := a.sessions.GetSessionByID(sessionID)
	if err != nil {
		log.Errorf("telegram alerts: load session %s: %v", sessionID, err)
		return
	}
	if !session.TelegramAlerts {
		return
	}

	if err := a.send(settings, formatOrderAlert(session, order)); err != nil {
		log.Errorf("telegram alerts: session %s order %d: %v", sessionID, order.ID, err)
	}
}

// SessionEvent sends a start/resume/stop alert in the background.
func (a *SignalAlerter) SessionEvent(session *model.Session, eventType model.SessionEventType) {
	if a == nil || !session.TelegramAlerts {
		return
	}
	snapshot := *session
	go a.sendSessionEvent(&snapshot, eventType, time.Now())
}

func (a *SignalAlerter) sendSessionEvent(session *model.Session, eventType model.SessionEventType, at time.Time) {
	settings, ok := a.activeSettings()
	if !ok || !settings.NotifySessionEvents {
		return
	}
	if err := a.send(settings, formatSessionEventAlert(session, eventType, at)); err != nil {
		log.Errorf("telegram alerts: session %s %s event: %v", session.ID, eventType, err)
	}
}

// SendTest sends a test message with the given (possibly unsaved) settings.
func (a *SignalAlerter) SendTest(ctx context.Context, settings *model.TelegramAlertSettings) error {
	text := "✅ <b>Ninjabot Telegram alerts are connected</b>\n\n" +
		"Realtime signal sessions with Telegram alerts enabled will notify this chat on each BUY/SELL signal.\n" +
		"<i>Signals only: no real orders are placed.</i>"
	return a.sender.SendMessage(ctx, settings.BotToken, telegram.Message{
		ChatID: settings.ChatID,
		Text:   text,
		Silent: settings.Silent,
	})
}

// OrderNotifier returns the order subscriber of one session's bot.
func (a *SignalAlerter) OrderNotifier(sessionID string) *TelegramOrderNotifier {
	return &TelegramOrderNotifier{alerter: a, sessionID: sessionID}
}

// TelegramOrderNotifier forwards a session's orders to its SignalAlerter.
type TelegramOrderNotifier struct {
	alerter   *SignalAlerter
	sessionID string
}

// OnOrder sends the alert in the background so the order feed never waits
// on Telegram.
func (n *TelegramOrderNotifier) OnOrder(order model.Order) {
	if order.Status != model.OrderStatusTypeFilled {
		return
	}
	go n.alerter.sendOrderAlert(n.sessionID, order)
}

func formatOrderAlert(session *model.Session, order model.Order) string {
	asset, quote := exchange.SplitAssetQuote(order.Pair)
	icon, side := "🟢", "BUY"
	if order.Side == model.SideTypeSell {
		icon, side = "🔴", "SELL"
	}
	when := order.UpdatedAt
	if when.IsZero() {
		when = order.CreatedAt
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s <b>%s SIGNAL · %s</b>\n\n", icon, side, esc(order.Pair))
	fmt.Fprintf(&b, "<b>Price:</b> %s %s\n", formatAlertNumber(order.Price), esc(quote))
	fmt.Fprintf(&b, "<b>Quantity:</b> %s %s\n", formatAlertNumber(order.Quantity), esc(asset))
	fmt.Fprintf(&b, "<b>Value:</b> %s %s\n", strconv.FormatFloat(order.Price*order.Quantity, 'f', 2, 64), esc(quote))
	if order.Side == model.SideTypeSell && order.Profit != 0 {
		fmt.Fprintf(&b, "<b>Trade result:</b> %+.2f%%", order.Profit*100)
		if order.ProfitValue != 0 {
			fmt.Fprintf(&b, " (%+.2f %s)", order.ProfitValue, esc(quote))
		}
		b.WriteString("\n")
	}
	fmt.Fprintf(&b, "<b>Order type:</b> %s\n", esc(string(order.Type)))
	b.WriteString("\n")
	writeSessionLines(&b, session)
	fmt.Fprintf(&b, "<b>Time:</b> %s\n\n", when.Format("2006-01-02 15:04:05 MST"))
	b.WriteString("<i>Signal only: no real order was placed.</i>")
	return b.String()
}

func formatSessionEventAlert(session *model.Session, eventType model.SessionEventType, at time.Time) string {
	title := "▶️ <b>Signal session started</b>"
	switch eventType {
	case model.SessionEventTypeResume:
		title = "▶️ <b>Signal session resumed</b>"
	case model.SessionEventTypeStop:
		title = "⏹ <b>Signal session stopped</b>"
	}

	var b strings.Builder
	fmt.Fprintf(&b, "%s\n\n", title)
	fmt.Fprintf(&b, "<b>Pair:</b> %s\n", esc(session.Pair))
	writeSessionLines(&b, session)
	fmt.Fprintf(&b, "<b>Time:</b> %s", at.Format("2006-01-02 15:04:05 MST"))
	return b.String()
}

func writeSessionLines(b *strings.Builder, session *model.Session) {
	strategyName := session.Strategy
	if session.Strategy == "emacross" && session.FastPeriod > 0 && session.SlowPeriod > 0 {
		strategyName = fmt.Sprintf("%s (%d/%d)", session.Strategy, session.FastPeriod, session.SlowPeriod)
	}
	fmt.Fprintf(b, "<b>Strategy:</b> %s · %s\n", esc(strategyName), esc(session.Timeframe))
	fmt.Fprintf(b, "<b>Session:</b> <code>%s</code>\n", esc(shortSessionID(session.ID)))
}

func shortSessionID(id string) string {
	if len(id) > 8 {
		return id[:8]
	}
	return id
}

// formatAlertNumber prints up to 8 decimals without trailing zeros.
func formatAlertNumber(v float64) string {
	s := strconv.FormatFloat(v, 'f', 8, 64)
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

func esc(s string) string {
	return telegram.EscapeHTML(s)
}
