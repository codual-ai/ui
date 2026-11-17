import { ChartInteractionMachine } from "../../src/charts/machine";
import { abortError, offlineError, TestError } from "../screen-states/helpers/fake-loader";
import {
  ChartLoader,
  data,
  loadedChart,
  oneDay,
  oneMonth,
  oneWeek,
  renderChart,
  series,
  shownFirstY,
} from "./helpers/chart";

test("CH-01 the first load is the initial range's, shown as a screen state", async () => {
  const { loader, chart } = await renderChart();
  expect(chart().state.status).toBe("loading");
  expect(loader.calls.map((call) => call.query)).toEqual([{ range: "1D", comparesToPreviousPeriod: false }]);
  await loader.succeed(oneDay);
  expect(shownFirstY(chart().state)).toBe(10);
  expect(chart().isStale).toBe(false);
});

test("CH-01 a failed first load shows the failed view, and retry loads the range again", async () => {
  const { loader, chart, run } = await renderChart();
  await loader.fail(new TestError());
  expect(chart().state.status).toBe("failed");
  await run(chart().retry);
  expect(chart().state.status).toBe("loading");
  await loader.succeed(oneDay);
  expect(loader.ranges).toEqual(["1D", "1D"]);
  expect(shownFirstY(chart().state)).toBe(10);
});

test("CH-02 a range with no points shows the empty view, and a failure never does", async () => {
  const { loader, chart, run } = await loadedChart(data(series("Price"), series("Volume")));
  expect(chart().state.status).toBe("empty");
  await run(() => chart().select("1W"));
  await loader.fail(offlineError);
  expect(chart().state.status).toBe("offline");
  await run(() => chart().select("1M"));
  await loader.fail(new TestError());
  expect(chart().state.status).toBe("failed");
});

test("CH-03 switching range keeps the series on screen, stale, until the new answer", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1W"));
  expect(chart().range).toBe("1W");
  expect(shownFirstY(chart().state)).toBe(10);
  expect(chart().isStale).toBe(true);
  await loader.succeed(oneWeek);
  expect(shownFirstY(chart().state)).toBe(20);
  expect(chart().isStale).toBe(false);
});

test("CH-04 switching range with nothing shown yet shows loading, then the new range", async () => {
  const { loader, chart, run } = await renderChart();
  await run(() => chart().select("1W"));
  expect(chart().state.status).toBe("loading");
  expect(loader.calls[0]?.signal.aborted).toBe(true);
  await loader.succeed(oneDay, 0);
  expect(chart().state.status).toBe("loading");
  await loader.succeed(oneWeek, 1);
  expect(shownFirstY(chart().state)).toBe(20);
});

test("CH-04 switching range from the failed view shows loading, then the new range", async () => {
  const { loader, chart, run } = await renderChart();
  await loader.fail(new TestError());
  await run(() => chart().select("1W"));
  expect(chart().state.status).toBe("loading");
  await loader.succeed(oneWeek);
  expect(shownFirstY(chart().state)).toBe(20);
});

test("CH-05 an answer for a range no longer selected is dropped, even after the new answer", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1W"));
  await run(() => chart().select("1M"));
  expect(loader.ranges).toEqual(["1D", "1W", "1M"]);
  expect(loader.calls[1]?.signal.aborted).toBe(true);
  await loader.succeed(oneMonth, 2);
  await loader.succeed(oneWeek, 1);
  expect(shownFirstY(chart().state)).toBe(30);
  expect(chart().isStale).toBe(false);
});

test("CH-05 an old range's answer arriving first is dropped, and the chart stays stale", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1W"));
  await run(() => chart().select("1M"));
  await loader.succeed(oneWeek, 1);
  expect(shownFirstY(chart().state)).toBe(10);
  expect(chart().isStale).toBe(true);
  await loader.succeed(oneMonth, 2);
  expect(shownFirstY(chart().state)).toBe(30);
});

test("CH-06 selecting the selected range loads nothing", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1D"));
  expect(loader.calls).toHaveLength(1);
  expect(chart().isStale).toBe(false);
});

test("CH-07 a failed range switch shows the failed view, and retry loads the selected range", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1W"));
  await loader.fail(abortError);
  expect(chart().state.status).toBe("failed");
  expect(chart().refreshError).toBeUndefined();
  await run(chart().retry);
  await loader.succeed(oneWeek);
  expect(loader.ranges).toEqual(["1D", "1W", "1W"]);
  expect(shownFirstY(chart().state)).toBe(20);
});

test("CH-08 a refresh keeps the series, not stale, and a range switch drops its answer", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  let refreshing: Promise<void> = Promise.resolve();
  await run(() => {
    refreshing = chart().refresh();
  });
  expect(chart().isRefreshing).toBe(true);
  expect(chart().isStale).toBe(false);
  await run(() => chart().select("1W"));
  expect(chart().isRefreshing).toBe(false);
  await loader.succeed(oneDay, 1);
  await refreshing;
  expect(chart().isStale).toBe(true);
  await loader.succeed(oneWeek, 2);
  expect(shownFirstY(chart().state)).toBe(20);
  expect(chart().refreshError).toBeUndefined();
});

test("CH-09 leaving cancels the load, and coming back after a switch loads the selected range", async () => {
  const loader = new ChartLoader();
  const machine = new ChartInteractionMachine(
    () => ({ load: loader.load, isOffline: () => false, haptic: undefined, keepsSelectionOnRelease: false }),
    { range: "1D", comparesToPreviousPeriod: false },
  );
  machine.appear();
  await loader.succeed(oneDay);
  machine.select("1W");
  machine.disappear();
  expect(loader.calls[1]?.signal.aborted).toBe(true);
  await loader.succeed(oneWeek, 1);
  expect(shownFirstY(machine.getSnapshot().state)).toBe(10);
  machine.appear();
  expect(machine.getSnapshot().isStale).toBe(true);
  machine.appear();
  expect(loader.ranges).toEqual(["1D", "1W", "1W"]);
  await loader.succeed(oneWeek);
  expect(shownFirstY(machine.getSnapshot().state)).toBe(20);
  machine.disappear();
  machine.appear();
  expect(loader.calls).toHaveLength(3);
});

test("CH-10 turning the comparison on loads again with it, as a range switch does", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().compareToPreviousPeriod(true));
  expect(chart().isStale).toBe(true);
  expect(loader.calls.at(-1)?.query).toEqual({ range: "1D", comparesToPreviousPeriod: true });
  await run(() => chart().select("1W"));
  await loader.succeed(oneMonth, 1);
  expect(shownFirstY(chart().state)).toBe(10);
  await loader.succeed(oneWeek, 2);
  expect(shownFirstY(chart().state)).toBe(20);
  expect(loader.calls.at(-1)?.query).toEqual({ range: "1W", comparesToPreviousPeriod: true });
  expect(chart().comparesToPreviousPeriod).toBe(true);
});

test("CH-27 going back to the range still shown refreshes it, and its failure keeps the series", async () => {
  const { loader, chart, run } = await loadedChart(oneDay);
  await run(() => chart().select("1W"));
  await run(() => chart().select("1D"));
  expect(chart().isStale).toBe(false);
  expect(chart().isRefreshing).toBe(true);
  expect(loader.ranges).toEqual(["1D", "1W", "1D"]);
  expect(loader.calls[1]?.signal.aborted).toBe(true);
  await loader.succeed(oneWeek, 1);
  expect(shownFirstY(chart().state)).toBe(10);
  await loader.fail(new TestError(), 2);
  expect(shownFirstY(chart().state)).toBe(10);
  expect(chart().refreshError?.error).toBeInstanceOf(TestError);
});
