import { parseNumber } from "../../src/forms/numbers";
import {
  email,
  type FormRule,
  matches,
  maxLength,
  minLength,
  number,
  pattern,
  required,
  rule,
} from "../../src/forms/rules";
import { renderForm } from "./helpers/form";

function passes(formRule: FormRule<never>, value: string): boolean {
  return formRule.isValid(value, {});
}

test("FM-05 rules are checked in order and only the first broken one shows", async () => {
  const { form, fill } = await renderForm({
    fields: {
      code: { rules: [minLength(4, "Too short"), pattern(/[0-9]+/, "Digits only"), required("Enter")] },
    },
  });
  await fill("code", "ab");
  expect(form().error("code")).toBe("Too short");
  await fill("code", "abcd");
  expect(form().error("code")).toBe("Digits only");
});

test("FM-06 every rule but required, matches and the app's own passes on an empty value", () => {
  for (const optional of [
    minLength(3, "m"),
    maxLength(1, "m"),
    pattern(/x/, "m"),
    email("m"),
    number("m", { min: 1 }),
  ]) {
    expect(passes(optional, "")).toBe(true);
  }
  expect(passes(required("m"), "")).toBe(false);
  expect(rule("m", () => false).isValid("", {})).toBe(false);
  expect(matches("password", "m").isValid("", { password: "secret" })).toBe(false);
});

test("FM-06 required fails on spaces and new lines only, even in a field that keeps spaces", async () => {
  const { form, fill } = await renderForm({
    fields: { secret: { trim: false, rules: [required("Enter it")] } },
  });
  await fill("secret", "  \n ");
  expect(form().error("secret")).toBe("Enter it");
});

test("FM-07 values are checked and submitted trimmed, but the field's text is never changed", async () => {
  const { form, fill, submit } = await renderForm({
    fields: { name: { rules: [maxLength(3, "3 at most")] }, password: { trim: false } },
  });
  await fill("name", "  Ada \n");
  await fill("password", " pass word ");
  expect(form().values.name).toBe("  Ada \n");
  expect(form().error("name")).toBeUndefined();
  const submitted: Record<string, string>[] = [];
  await submit(async (values) => {
    submitted.push(values);
  });
  expect(submitted).toEqual([{ name: "Ada", password: " pass word " }]);
});

test("FM-08 length rules count an emoji, with a skin tone, and an accented letter as one character each", () => {
  const atMostThree = maxLength(3, "m");
  expect(passes(atMostThree, "👍🏽é👍")).toBe(true);
  expect(passes(atMostThree, "ééé")).toBe(true);
  expect(passes(atMostThree, "abcd")).toBe(false);
  expect(passes(minLength(2, "m"), "👍🏽")).toBe(false);
});

test("FM-09 a pattern matches the whole value and gives the same answer every time", () => {
  const username = pattern(/[a-z]+/g, "m");
  expect(passes(username, "abc!")).toBe(false);
  expect(passes(username, "!abc")).toBe(false);
  for (let check = 0; check < 3; check += 1) expect(passes(username, "abc")).toBe(true);
  expect(passes(pattern(/ab|cd/, "m"), "abcd")).toBe(false);
  expect(passes(pattern(/[a-z]+/m, "m"), "!\nabc\n!")).toBe(false);
});

test("FM-10 the email rule accepts a name, one @ and a dotted domain, and rejects the rest", () => {
  const rule = email("m");
  for (const valid of ["a@b.co", "ada.lovelace+news@mail.example.org"])
    expect(passes(rule, valid)).toBe(true);
  for (const invalid of [
    "ada.example.com",
    "ada@example",
    "ada @example.com",
    "ada@example.",
    "a@@b.co",
    "@b.co",
  ]) {
    expect(passes(rule, invalid)).toBe(false);
  }
});

test("FM-11 numbers are read the way the locale writes them", () => {
  expect(parseNumber("1,200", "en-US")).toBe(1200);
  expect(parseNumber("1,200.5", "en-US")).toBe(1200.5);
  expect(parseNumber("1200.5", "en-US")).toBe(1200.5);
  expect(parseNumber("1.200,5", "de-DE")).toBe(1200.5);
  expect(parseNumber("1,5", "de-DE")).toBe(1.5);
  expect(parseNumber("1 200,5", "fr-FR")).toBe(1200.5);
  expect(parseNumber("1 200,5", "fr-FR")).toBe(1200.5);
  expect(parseNumber("1 200,5", "fr-FR")).toBe(1200.5);
});

test("FM-11 a grouping separator in the wrong place, an exponent, NaN or Infinity is not a number", () => {
  for (const text of [
    "1,5",
    "1,2345",
    "1,2,345",
    "12,34,567",
    "1,,200",
    ",200",
    "1.2.3",
    "1e5",
    "NaN",
    "Infinity",
    "12a",
    "5.",
    "",
  ]) {
    expect(parseNumber(text, "en-US")).toBeUndefined();
  }
  expect(parseNumber("1.200,5", "en-US")).toBeUndefined();
  expect(passes(number("m", { locale: "en-US" }), "1,5")).toBe(false);
});

test("FM-12 the number rule's limits are inclusive and a minus sign makes a number negative", () => {
  const income = number("m", { min: 0, max: 1000, locale: "en-US" });
  expect(passes(income, "0")).toBe(true);
  expect(passes(income, "1,000")).toBe(true);
  expect(passes(income, "1,000.01")).toBe(false);
  expect(passes(income, "-5")).toBe(false);
  expect(parseNumber("-1,200.5", "en-US")).toBe(-1200.5);
  expect(parseNumber("−5", "en-US")).toBe(-5);
});

test("FM-12 the number the app reads from a submitted value is the one the rule checked", async () => {
  const { fill, submit } = await renderForm({
    fields: { income: { rules: [number("Enter a number", { min: 0, locale: "de-DE" })] } },
  });
  await fill("income", " 1.200,5 ");
  const read: (number | undefined)[] = [];
  await submit(async (values) => {
    read.push(parseNumber(values.income, "de-DE"));
  });
  expect(read).toEqual([1200.5]);
});

test("FM-13 a change to the other field updates the error of the field that must match it", async () => {
  const { form, fill, type } = await renderForm({
    fields: { password: { trim: false }, confirm: { trim: false, rules: [matches("password", "No match")] } },
  });
  await fill("password", "secret");
  await fill("confirm", "secret");
  expect(form().error("confirm")).toBeUndefined();
  await type("password", "secret2");
  expect(form().error("confirm")).toBe("No match");
  await type("password", "secret");
  expect(form().error("confirm")).toBeUndefined();
});

test("FM-14 the app's own rule gets the value and every value, and shows its message", async () => {
  const seen: unknown[] = [];
  const { form, fill } = await renderForm({
    fields: {
      start: {},
      end: {
        rules: [
          rule<"start" | "end">("Ends before it starts", (value, values) => {
            seen.push({ value, values });
            return Number(value) >= Number(values.start);
          }),
        ],
      },
    },
  });
  await fill("start", " 5 ");
  await fill("end", "3");
  expect(form().error("end")).toBe("Ends before it starts");
  expect(seen.at(-1)).toEqual({ value: "3", values: { start: "5", end: "3" } });
});

test("FM-34 every message is the app's: the form adds no text of its own", async () => {
  const { form, fill, announced, submit } = await renderForm({
    fields: { name: { rules: [required("Indiquez votre nom")] } },
  });
  await fill("name", "");
  await submit(async () => {});
  expect(form().error("name")).toBe("Indiquez votre nom");
  expect(announced()).toEqual(["Indiquez votre nom"]);
});
