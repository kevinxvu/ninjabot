import { lazy, Suspense } from 'react';
import type { PlotParams } from 'react-plotly.js';
import { Spinner } from '@/components/common/Spinner';

// Plotly is ~3MB, so it is loaded on demand and kept out of the main bundle.
// The factory + dist-min build avoids bundling the full plotly.js source.
const LazyPlot = lazy(async () => {
  const [{ default: Plotly }, { default: createPlotlyComponent }] = await Promise.all([
    import('plotly.js-dist-min'),
    import('react-plotly.js/factory'),
  ]);
  return { default: createPlotlyComponent(Plotly) };
});

export type { PlotParams };

export function Plot(props: PlotParams) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center" style={{ height: props.layout.height ?? 300 }}>
          <Spinner className="size-8" />
        </div>
      }
    >
      <LazyPlot useResizeHandler {...props} />
    </Suspense>
  );
}
