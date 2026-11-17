import type { ChartSelection } from "./points";
import type { ChartComparison, ChartSeriesSummary } from "./summary";

export interface ChartChangeText {
  readonly name: string;
  readonly first: string;
  readonly firstX: string;
  readonly last: string;
  readonly lastX: string;
  readonly direction: "up" | "down" | "unchanged";
  /** The size of the change, a percentage when there is one; unused when unchanged. */
  readonly amount: string;
}

/** The sentences a screen reader hears; pass your own to translate them. */
export interface ChartLabels {
  readonly title: (title: string) => string;
  readonly change: (text: ChartChangeText) => string;
  readonly lowAndHigh: (text: {
    readonly low: string;
    readonly lowX: string;
    readonly high: string;
    readonly highX: string;
  }) => string;
  readonly comparison: (text: {
    readonly direction: "higher" | "lower" | "same";
    readonly amount: string;
  }) => string;
  readonly updating: string;
  /** One series' point: "3 Nov, 1.20". */
  readonly point: (x: string, value: string) => string;
  /** Several series' values at one x: "3 Nov: Price 1.20, Volume 300". */
  readonly points: (
    x: string,
    values: readonly { readonly name: string; readonly value: string }[],
  ) => string;
}

export const defaultChartLabels: ChartLabels = {
  title: (title) => `${title}.`,
  change: ({ name, first, firstX, last, lastX, direction, amount }) => {
    const from = `${name}: from ${first} (${firstX}) to ${last} (${lastX})`;
    return direction === "unchanged" ? `${from}, unchanged.` : `${from}, ${direction} ${amount}.`;
  },
  lowAndHigh: ({ low, lowX, high, highX }) => `Low ${low} (${lowX}), high ${high} (${highX}).`,
  comparison: ({ direction, amount }) =>
    direction === "same"
      ? "The same as the previous period."
      : `${amount} ${direction} than the previous period.`,
  updating: "Updating.",
  point: (x, value) => `${x}, ${value}`,
  points: (x, values) => `${x}: ${values.map(({ name, value }) => `${name} ${value}`).join(", ")}`,
};

/** How a chart writes its values for people: the app's formatters, or numbers in the person's locale. */
export interface ChartFormat {
  readonly formatX: (x: number) => string;
  readonly formatY: (y: number) => string;
  readonly percent: (fraction: number) => string;
}

/** What the x values are: numbers, or times as epoch milliseconds, read out as dates and times. */
export type ChartXKind = "number" | "time";

export function chartFormat(options: {
  readonly formatX?: ((x: number) => string) | undefined;
  readonly formatY?: ((y: number) => string) | undefined;
  readonly xKind?: ChartXKind | undefined;
  readonly locale?: string | undefined;
}): ChartFormat {
  const numbers = new Intl.NumberFormat(options.locale);
  const percents = new Intl.NumberFormat(options.locale, { style: "percent", maximumFractionDigits: 1 });
  const times = new Intl.DateTimeFormat(options.locale, { dateStyle: "medium", timeStyle: "short" });
  const defaultX =
    options.xKind === "time" ? (x: number) => times.format(x) : (x: number) => numbers.format(x);
  return {
    formatX: options.formatX ?? defaultX,
    formatY: options.formatY ?? ((y) => numbers.format(y)),
    percent: (fraction) => percents.format(fraction),
  };
}

/** The size of a change, without its sign: a percentage when there is one, or else the amount. */
function amount(change: number, relative: number | undefined, format: ChartFormat): string {
  return relative === undefined ? format.formatY(Math.abs(change)) : format.percent(Math.abs(relative));
}

function direction<T>(change: number, up: T, down: T, same: T): T {
  if (change > 0) return up;
  return change < 0 ? down : same;
}

function seriesSentences(summary: ChartSeriesSummary, labels: ChartLabels, format: ChartFormat): string[] {
  const { formatX, formatY } = format;
  const sentences = [
    labels.change({
      name: summary.name,
      first: formatY(summary.first.y),
      firstX: formatX(summary.first.x),
      last: formatY(summary.last.y),
      lastX: formatX(summary.last.x),
      direction: direction(summary.change, "up", "down", "unchanged"),
      amount: amount(summary.change, summary.relativeChange, format),
    }),
    labels.lowAndHigh({
      low: formatY(summary.low.y),
      lowX: formatX(summary.low.x),
      high: formatY(summary.high.y),
      highX: formatX(summary.high.x),
    }),
  ];
  if (summary.comparison !== undefined)
    sentences.push(comparisonSentence(summary.comparison, labels, format));
  return sentences;
}

function comparisonSentence(comparison: ChartComparison, labels: ChartLabels, format: ChartFormat): string {
  return labels.comparison({
    direction: direction(comparison.change, "higher", "lower", "same"),
    amount: amount(comparison.change, comparison.relativeChange, format),
  });
}

/** The title, then each series' change, low and high, and comparison, as a screen reader hears it. */
export function spokenSummary(
  title: string,
  seriesSummaries: readonly ChartSeriesSummary[],
  isStale: boolean,
  labels: ChartLabels,
  format: ChartFormat,
): string {
  const sentences = [
    labels.title(title),
    ...seriesSummaries.flatMap((each) => seriesSentences(each, labels, format)),
  ];
  if (isStale) sentences.push(labels.updating);
  return sentences.join(" ");
}

/** The selected point's text: its x and each series' value, with the series' name when there are several. */
export function pointText(
  selection: ChartSelection,
  seriesCount: number,
  labels: ChartLabels,
  format: ChartFormat,
): string {
  const [only] = selection.points;
  if (seriesCount === 1 && only !== undefined) {
    return labels.point(format.formatX(only.point.x), format.formatY(only.point.y));
  }
  const values = selection.points.map((each) => ({
    name: each.seriesName,
    value: format.formatY(each.point.y),
  }));
  return labels.points(format.formatX(selection.x), values);
}
