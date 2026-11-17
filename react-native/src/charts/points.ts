import type { ChartPoint, PlottedData } from "./data";

/** The point the person is touching or a screen reader stepped to. */
export interface ChartSelection {
  /** The x of the point the touch snapped to. */
  readonly x: number;
  /** Each series' point nearest `x`, in series order; a series with no points has none. */
  readonly points: readonly ChartSelectedPoint[];
  /** Where `x` is among every x of the data. */
  readonly index: number;
}

export interface ChartSelectedPoint {
  readonly seriesId: string;
  readonly seriesName: string;
  readonly point: ChartPoint;
}

/** The index of the value in `sorted` nearest `target`, the earlier on a tie, or `undefined` when there are none. */
export function nearestIndex(sorted: readonly number[], target: number): number | undefined {
  if (sorted.length === 0) return undefined;
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((sorted[middle] ?? 0) < target) low = middle + 1;
    else high = middle;
  }
  // `low` is the first value at or after the target; the one before it may be nearer.
  if (low === sorted.length) return low - 1;
  const before = sorted[low - 1];
  const after = sorted[low] ?? 0;
  if (before !== undefined && target - before <= after - target) return low - 1;
  return low;
}

export function selectionAt(data: PlottedData, index: number): ChartSelection | undefined {
  const x = data.xValues[index];
  if (x === undefined) return undefined;
  const points = data.series.flatMap((series) => {
    const nearest = nearestIndex(
      series.points.map((point) => point.x),
      x,
    );
    const point = nearest === undefined ? undefined : series.points[nearest];
    return point === undefined ? [] : [{ seriesId: series.id, seriesName: series.name, point }];
  });
  return { x, points, index };
}

/**
 * The selection at the x nearest `x`: across every series, the earlier point on a tie. For a gesture handler that
 * already has an x (Victory Native's press state, say); the hook's `scrub` does this and ticks.
 */
export function selectionNearest(data: PlottedData, x: number): ChartSelection | undefined {
  const index = nearestIndex(data.xValues, x);
  return index === undefined ? undefined : selectionAt(data, index);
}
