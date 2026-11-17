/** A point of a series. `x` is a number: a time as epoch milliseconds, say, as Victory Native takes. */
export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

/** One line or set of bars. `id` matches a series with its previous-period series; `name` is read out. */
export interface ChartSeries {
  readonly id: string;
  readonly name: string;
  readonly points: readonly ChartPoint[];
}

/**
 * What a range's load returns: the series and, when the previous period is compared, that period's series with
 * the same IDs, aligned to this period's x values by the app.
 */
export interface ChartData {
  readonly series: readonly ChartSeries[];
  readonly previousPeriod?: readonly ChartSeries[];
}

/** What a chart's load is for: the selected range, and whether the previous period is compared. */
export interface ChartQuery<Range> {
  readonly range: Range;
  readonly comparesToPreviousPeriod: boolean;
}

/** A load's data with its series in x order and without gaps, and every x a selection can snap to. */
export interface PlottedData {
  readonly series: readonly ChartSeries[];
  readonly previousPeriod: readonly ChartSeries[];
  /** Every x any series has a point at, in order, once each. */
  readonly xValues: readonly number[];
}

/** Its points in x order, without gaps (values that aren't finite). */
function plotted(series: ChartSeries): ChartSeries {
  const points = series.points.filter((point) => Number.isFinite(point.y)).sort((a, b) => a.x - b.x);
  return { ...series, points };
}

export function plot(data: ChartData): PlottedData {
  const series = data.series.map(plotted);
  const xValues = [...new Set(series.flatMap((each) => each.points.map((point) => point.x)))].sort(
    (a, b) => a - b,
  );
  return { series, previousPeriod: (data.previousPeriod ?? []).map(plotted), xValues };
}
