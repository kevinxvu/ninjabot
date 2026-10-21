import { lazy, Suspense } from 'react';
import type { PlotParams } from 'react-plotly.js';
import { Spinner } from '@/components/common/Spinner';

// Plotly is ~3MB, so it is loaded on demand and kept out of the main bundle.
// The factory + dist-min build avoids bundling the full plotly.js source.
// Both packages are CommonJS. In the production build the default import can be the
// whole `exports` object (`{ default: fn }`) rather than the function, so unwrap it.
function interopDefault<T>(mod: T | { default: T }): T {
  return mod && typeof mod === 'object' && 'default' in mod ? mod.default : mod;
}

const LazyPlot = lazy(async () => {
  const [plotlyModule, factoryModule] = await Promise.all([
    import('plotly.js-dist-min'),
    import('react-plotly.js/factory'),
  ]);
  const Plotly = interopDefault(plotlyModule.default);
  const createPlotlyComponent = interopDefault(factoryModule.default);
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
