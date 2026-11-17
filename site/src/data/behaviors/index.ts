import type { Behavior } from "../types.ts";
import { charts } from "./charts.ts";
import { forms } from "./forms.ts";
import { lists } from "./lists.ts";
import { permissions } from "./permissions.ts";
import { purchases } from "./purchases.ts";
import { screenStates } from "./screen-states.ts";
import { search } from "./search.ts";
import { selection } from "./selection.ts";
import { sheets } from "./sheets.ts";

/** In the README's order. */
export const BEHAVIORS: readonly Behavior[] = [
  screenStates,
  lists,
  forms,
  purchases,
  selection,
  sheets,
  search,
  permissions,
  charts,
];
