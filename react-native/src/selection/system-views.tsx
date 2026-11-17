import { Button } from "react-native";
import { defaultSelectionLabels, type SelectionLabels } from "./labels";
import type { SelectionController } from "./use-selection";

interface SelectionButtonProps {
  readonly selection: Pick<
    SelectionController<unknown>,
    | "kind"
    | "activation"
    | "isActive"
    | "isPerforming"
    | "isAllSelected"
    | "enter"
    | "exit"
    | "selectAll"
    | "deselectAll"
  >;
  readonly labels?: Partial<SelectionLabels>;
}

// System components only, with no styles of their own.

/** Select outside the mode, Done inside it, so the mode never needs a long press. Nothing for a picker. */
export function SelectionModeButton({ selection, labels }: SelectionButtonProps) {
  if (selection.activation === "always") return null;
  const { select, done } = { ...defaultSelectionLabels, ...labels };
  return (
    <Button
      title={selection.isActive ? done : select}
      onPress={selection.isActive ? selection.exit : selection.enter}
      disabled={selection.isPerforming}
    />
  );
}

/** Select All, or Deselect All once nothing more can be selected. Nothing for a single selection. */
export function SelectAllButton({ selection, labels }: SelectionButtonProps) {
  if (selection.kind === "single") return null;
  const { selectAll, deselectAll } = { ...defaultSelectionLabels, ...labels };
  return (
    <Button
      title={selection.isAllSelected ? deselectAll : selectAll}
      onPress={selection.isAllSelected ? selection.deselectAll : selection.selectAll}
      disabled={!selection.isActive || selection.isPerforming}
    />
  );
}
