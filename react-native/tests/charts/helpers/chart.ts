import { act, renderHook } from "@testing-library/react-native";
import type { ChartData, ChartQuery, ChartSeries, PlottedData } from "../../../src/charts/data";
import { type ChartInteractionOptions, useChartInteraction } from "../../../src/charts/use-chart-interaction";
import type { ScreenState } from "../../../src/screen-states/machine";

interface Call {
  readonly query: ChartQuery<string>;
  readonly signal: AbortSignal;
  readonly resolve: (data: ChartData) => void;
  readonly reject: (error: unknown) => void;
}

/** A chart load whose calls wait until the test answers them, in any order, even after their signal aborts. */
export class ChartLoader {
  readonly calls: Call[] = [];
  private readonly answered = new Set<number>();

  readonly load = (query: ChartQuery<string>, signal: AbortSignal): Promise<ChartData> =>
    new Promise((resolve, reject) => {
      this.calls.push({ query, signal, resolve, reject });
    });

  get ranges(): string[] {
    return this.calls.map((call) => call.query.range);
  }

  /** Answers call `call` (by default the latest), and lets the chart update. */
  async succeed(data: ChartData, call?: number): Promise<void> {
    const answer = this.take(call);
    await act(async () => answer.resolve(data));
  }

  async fail(error: unknown, call?: number): Promise<void> {
    const answer = this.take(call);
    await act(async () => answer.reject(error));
  }

  private take(call: number | undefined): Call {
    const index = call ?? this.calls.length - 1;
    const answer = this.calls[index];
    if (answer === undefined || this.answered.has(index)) throw new Error(`call ${index} isn't waiting`);
    this.answered.add(index);
    return answer;
  }
}

type Options = Partial<Omit<ChartInteractionOptions<string>, "load">>;

/** Renders `useChartInteraction` loading from a new `ChartLoader`, counting haptic ticks. */
export async function renderChart(options: Options = {}) {
  const loader = new ChartLoader();
  const ticks = { count: 0 };
  const view = await renderHook(() =>
    useChartInteraction({
      title: "Price",
      initialRange: "1D",
      locale: "en-US",
      haptic: () => {
        ticks.count += 1;
      },
      ...options,
      load: loader.load,
    }),
  );
  const chart = () => view.result.current;
  const run = (action: () => void) => act(async () => action());
  return { loader, ticks, chart, run, unmount: view.unmount };
}

/** A rendered chart whose first load answered with `data`. */
export async function loadedChart(data: ChartData, options: Options = {}) {
  const rendered = await renderChart(options);
  await rendered.loader.succeed(data);
  return rendered;
}

export function series(id: string, ...points: [number, number][]): ChartSeries {
  return { id, name: id, points: points.map(([x, y]) => ({ x, y })) };
}

export const data = (...all: ChartSeries[]): ChartData => ({ series: all });

export const oneDay = data(series("Price", [1, 10], [2, 12], [3, 11]));
export const oneWeek = data(series("Price", [1, 20], [2, 24]));
export const oneMonth = data(series("Price", [1, 30], [2, 33]));

/** The series a chart shows, by their first y, to tell answers apart. */
export function shownFirstY(state: ScreenState<PlottedData>): number | string | undefined {
  return state.status === "content" ? state.value.series[0]?.points[0]?.y : state.status;
}
