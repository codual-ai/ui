import type { ChartPoint, ChartSeries, PlottedData } from "./data";

/** Which value compares a period with the one before: the last value (a price, a weight) or the total (steps). */
export type ChartComparisonMeasure = "last" | "total";

/** A period compared with the one before it, by the app's measure. */
export interface ChartComparison {
  /** The previous period's measure. */
  readonly previous: number;
  /** This period's measure minus the previous one's. */
  readonly change: number;
  /** The change as a fraction of the previous measure, or `undefined` when that is 0. */
  readonly relativeChange: number | undefined;
}

/** A series' figures, for a screen reader and for the app's own callouts. */
export interface ChartSeriesSummary {
  readonly seriesId: string;
  readonly name: string;
  readonly first: ChartPoint;
  readonly last: ChartPoint;
  /** The lowest and highest points, the earliest when two tie. */
  readonly low: ChartPoint;
  readonly high: ChartPoint;
  readonly total: number;
  /** `last.y - first.y`. */
  readonly change: number;
  /** The change as a fraction of the first value (0.2 for 20%), or `undefined` when the first value is 0. */
  readonly relativeChange: number | undefined;
  readonly comparison: ChartComparison | undefined;
}

const total = (series: ChartSeries): number => series.points.reduce((sum, point) => sum + point.y, 0);

const relative = (change: number, base: number): number | undefined =>
  base === 0 ? undefined : change / Math.abs(base);

function measured(series: ChartSeries, measure: ChartComparisonMeasure): number | undefined {
  const last = series.points.at(-1);
  if (last === undefined) return undefined;
  return measure === "last" ? last.y : total(series);
}

function comparison(
  current: ChartSeries,
  previous: ChartSeries | undefined,
  measure: ChartComparisonMeasure,
): ChartComparison | undefined {
  const now = measured(current, measure);
  const before = previous === undefined ? undefined : measured(previous, measure);
  if (now === undefined || before === undefined) return undefined;
  return { previous: before, change: now - before, relativeChange: relative(now - before, before) };
}

function summary(
  series: ChartSeries,
  previous: ChartSeries | undefined,
  measure: ChartComparisonMeasure,
): ChartSeriesSummary | undefined {
  const first = series.points[0];
  const last = series.points.at(-1);
  if (first === undefined || last === undefined) return undefined;
  // Strict comparisons keep the first of equal values.
  const low = series.points.reduce((lowest, point) => (point.y < lowest.y ? point : lowest));
  const high = series.points.reduce((highest, point) => (point.y > highest.y ? point : highest));
  return {
    seriesId: series.id,
    name: series.name,
    first,
    last,
    low,
    high,
    total: total(series),
    change: last.y - first.y,
    relativeChange: relative(last.y - first.y, first.y),
    comparison: comparison(series, previous, measure),
  };
}

export function summaries(data: PlottedData, measure: ChartComparisonMeasure): readonly ChartSeriesSummary[] {
  return data.series.flatMap((series) => {
    const previous = data.previousPeriod.find((each) => each.id === series.id);
    return summary(series, previous, measure) ?? [];
  });
}
