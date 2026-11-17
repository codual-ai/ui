import { plot } from "../../src/charts/data";
import { selectionNearest } from "../../src/charts/points";
import { data, loadedChart, renderChart, series } from "./helpers/chart";

const twoSeries = data(series("Price", [0, 10], [10, 20], [20, 30]), series("Volume", [4, 1], [16, 2]));

test("CH-11 a touch snaps to the nearest x across every series", async () => {
  const { chart, run } = await loadedChart(twoSeries);
  await run(() => chart().scrub(3.1));
  expect(chart().selection?.x).toBe(4);
  await run(() => chart().scrub(8));
  expect(chart().selection?.x).toBe(10);
  await run(() => chart().scrub(13));
  expect(chart().selection?.x).toBe(10);
});

test("CH-11 a tie goes to the earlier point, and a touch outside the data to the nearest end", () => {
  const plotted = plot(twoSeries);
  expect(selectionNearest(plotted, 2)?.x).toBe(0);
  expect(selectionNearest(plotted, -50)?.x).toBe(0);
  expect(selectionNearest(plotted, 500)?.x).toBe(20);
});

test("CH-12 each series shows its own point nearest the selected x", () => {
  const plotted = plot(data(series("Price", [0, 10], [10, 20]), series("Volume", [4, 1]), series("Empty")));
  const points = selectionNearest(plotted, 9)?.points.map((each) => `${each.seriesId} ${each.point.x}`);
  expect(points).toEqual(["Price 10", "Volume 4"]);
});

test("CH-13 points in any order are used in x order", async () => {
  const { chart, run } = await loadedChart(data(series("Price", [20, 3], [0, 1], [10, 2])));
  await run(() => chart().scrub(1));
  expect(chart().selection?.points[0]?.point).toEqual({ x: 0, y: 1 });
  await run(chart().selectNextPoint);
  expect(chart().selection?.x).toBe(10);
  expect(chart().summaries[0]?.first).toEqual({ x: 0, y: 1 });
  expect(chart().summaries[0]?.last).toEqual({ x: 20, y: 3 });
});

test("CH-14 a tick plays when the selection starts and when its point changes, never within one point", async () => {
  const { chart, run, ticks } = await loadedChart(twoSeries);
  await run(() => chart().scrub(0.5));
  expect(ticks.count).toBe(1);
  await run(() => chart().scrub(1.5));
  await run(() => chart().scrub(0));
  expect(ticks.count).toBe(1);
  await run(() => chart().scrub(9));
  expect(ticks.count).toBe(2);
  await run(chart().endScrub);
  await run(chart().selectNextPoint);
  await run(chart().selectPreviousPoint);
  expect(ticks.count).toBe(2);
});

test("CH-15 release clears the selection by default", async () => {
  const { chart, run } = await loadedChart(twoSeries);
  await run(() => chart().scrub(10));
  await run(chart().endScrub);
  expect(chart().selection).toBeUndefined();
});

test("CH-15 a selection kept on release stays until cleared or moved", async () => {
  const { chart, run } = await loadedChart(twoSeries, { keepsSelectionOnRelease: true });
  await run(() => chart().scrub(10));
  await run(chart().endScrub);
  expect(chart().selection?.x).toBe(10);
  await run(() => chart().scrub(20));
  await run(chart().endScrub);
  expect(chart().selection?.x).toBe(20);
  await run(chart().clearSelection);
  expect(chart().selection).toBeUndefined();
});

test("CH-16 new series clear the selection: a range switch and a refresh", async () => {
  const { chart, run, loader } = await loadedChart(twoSeries, { keepsSelectionOnRelease: true });
  await run(() => chart().scrub(10));
  let refreshing: Promise<void> = Promise.resolve();
  await run(() => {
    refreshing = chart().refresh();
  });
  await loader.succeed(twoSeries);
  await refreshing;
  expect(chart().selection).toBeUndefined();
  await run(() => chart().scrub(10));
  await run(() => chart().select("1W"));
  expect(chart().selection).toBeUndefined();
});

test("CH-17 touches and steps do nothing unless series are shown", async () => {
  const { chart, run, loader, ticks } = await renderChart();
  await run(() => chart().scrub(1));
  await run(chart().selectNextPoint);
  await loader.succeed(data(series("Price")));
  await run(() => chart().scrub(1));
  await run(chart().selectPreviousPoint);
  expect(chart().selection).toBeUndefined();
  expect(ticks.count).toBe(0);
});

test("CH-26 a gap is never selected or stepped to", async () => {
  const { chart, run } = await loadedChart(
    data(series("Price", [0, 1], [5, Number.NaN], [10, Infinity], [20, 3])),
  );
  await run(() => chart().scrub(6));
  expect(chart().selection?.x).toBe(0);
  await run(chart().selectNextPoint);
  expect(chart().selection?.x).toBe(20);
});
