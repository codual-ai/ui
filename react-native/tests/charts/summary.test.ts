import { data, loadedChart, oneDay, series } from "./helpers/chart";

const day = (x: number) => `day ${x}`;

test("CH-20 a series' summary: first, last, low, high, change and its percentage", async () => {
  const { chart } = await loadedChart(
    data(series("Price", [1, 10], [2, 8], [3, 15], [4, 8], [5, 15], [6, 12]), series("None")),
  );
  expect(chart().summaries).toHaveLength(1);
  expect(chart().summaries[0]).toMatchObject({
    first: { x: 1, y: 10 },
    last: { x: 6, y: 12 },
    low: { x: 2, y: 8 },
    high: { x: 3, y: 15 },
    change: 2,
    relativeChange: 0.2,
    total: 68,
  });
});

test("CH-20 the percentage is absent when the first value is 0", async () => {
  const { chart } = await loadedChart(data(series("Steps", [1, 0], [2, 50])));
  expect(chart().summaries[0]?.relativeChange).toBeUndefined();
  expect(chart().spokenSummary).toContain("up 50.");
});

test("CH-21 the spoken summary reads the title, then each series' change, low and high", async () => {
  const { chart } = await loadedChart(
    data(series("Price", [1, 10], [2, 8], [3, 15], [4, 12]), series("Fees", [1, 4], [4, 3])),
    { formatX: day },
  );
  expect(chart().spokenSummary).toBe(
    "Price. Price: from 10 (day 1) to 12 (day 4), up 20%. Low 8 (day 2), high 15 (day 3). " +
      "Fees: from 4 (day 1) to 3 (day 4), down 25%. Low 3 (day 4), high 4 (day 1).",
  );
});

test("CH-21 numbers are in the person's locale by default", async () => {
  const { chart } = await loadedChart(data(series("Kurs", [1000, 1234.5], [2000, 1234.5])), {
    locale: "de-DE",
  });
  expect(chart().spokenSummary).toContain("from 1.234,5 (1.000) to 1.234,5 (2.000), unchanged.");
});

test("CH-21 time x values are read as dates and times in the person's locale by default", async () => {
  const { chart } = await loadedChart(data(series("Kurs", [0, 1], [86_400_000, 2])), {
    locale: "de-DE",
    xKind: "time",
  });
  const firstDay = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(0);
  expect(chart().spokenSummary).toContain(`from 1 (${firstDay})`);
});

test("CH-22 the comparison with the previous period, by the last value or the total", async () => {
  const current = series("Steps", [1, 30], [2, 60]);
  const previous = series("Steps", [1, 50], [2, 50]);
  const comparing = { series: [current, series("Other", [1, 1])], previousPeriod: [previous] };
  const byLast = await loadedChart(comparing, { comparesToPreviousPeriod: true });
  expect(byLast.loader.calls[0]?.query.comparesToPreviousPeriod).toBe(true);
  expect(byLast.chart().summaries[0]?.comparison).toEqual({ previous: 50, change: 10, relativeChange: 0.2 });
  expect(byLast.chart().summaries[1]?.comparison).toBeUndefined();
  expect(byLast.chart().spokenSummary).toContain("20% higher than the previous period.");
  const byTotal = await loadedChart(
    { series: [current], previousPeriod: [previous] },
    { comparisonMeasure: "total", comparesToPreviousPeriod: true },
  );
  expect(byTotal.chart().summaries[0]?.comparison?.change).toBe(-10);
  expect(byTotal.chart().spokenSummary).toContain("10% lower than the previous period.");
});

test("CH-22 with the comparison off, a previous period the load sends is never compared", async () => {
  const { chart } = await loadedChart({
    series: [series("Steps", [1, 60])],
    previousPeriod: [series("Steps", [1, 50])],
  });
  expect(chart().summaries[0]?.comparison).toBeUndefined();
  expect(chart().spokenSummary).not.toContain("previous period");
});

test("CH-25 the summary of stale series ends with Updating.", async () => {
  const { chart, run } = await loadedChart(oneDay);
  expect(chart().spokenSummary.endsWith("Updating.")).toBe(false);
  await run(() => chart().select("1W"));
  expect(chart().spokenSummary.endsWith("Updating.")).toBe(true);
});

test("CH-26 a gap is never summarized, and a series of gaps has no points", async () => {
  const { chart } = await loadedChart(
    data(series("Price", [1, 5], [2, Number.NaN], [3, -Infinity], [4, 7]), series("Gaps", [1, Number.NaN])),
  );
  expect(chart().summaries.map((each) => each.seriesId)).toEqual(["Price"]);
  expect(chart().summaries[0]?.low).toEqual({ x: 1, y: 5 });
  expect(chart().summaries[0]?.total).toBe(12);
  const gapsOnly = await loadedChart(data(series("Gaps", [1, Number.NaN])));
  expect(gapsOnly.chart().state.status).toBe("empty");
});
