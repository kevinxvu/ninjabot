package server

import (
	"context"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"sync"

	"github.com/rodrigo-brito/ninjabot/plot"
	"github.com/rodrigo-brito/ninjabot/ui"
)

type Server struct {
	mu          sync.Mutex
	running     bool
	chart       *plot.Chart
	templates   *template.Template
	summaryJSON json.RawMessage
}

func NewServer(chart *plot.Chart) (*Server, error) {
	templates, err := template.ParseFS(ui.Files, "template/form.html", "template/chart.html")
	if err != nil {
		return nil, fmt.Errorf("parse templates: %w", err)
	}

	return &Server{chart: chart, templates: templates}, nil
}

func (s *Server) Start(ctx context.Context, port int) error {
	mux := SetupRouter(s)

	httpServer := &http.Server{
		Addr:    fmt.Sprintf(":%d", port),
		Handler: mux,
	}

	go func() {
		<-ctx.Done()
		_ = httpServer.Shutdown(context.Background())
	}()

	fmt.Printf("UI → http://localhost:%d\n", port)
	if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}
