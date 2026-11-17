import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { AccessibilityInfo, Alert, BackHandler, type HostInstance, Platform } from "react-native";
import {
  type SaveSheet,
  SheetMachine,
  type SheetResult,
  type SheetSnapshot,
  type SheetSource,
} from "./machine";

/** The discard confirmation's text, which the app translates or replaces. */
export interface SheetLabels {
  readonly discardTitle: string;
  readonly discard: string;
  readonly keepEditing: string;
}

export const defaultSheetLabels: SheetLabels = {
  discardTitle: "Discard Changes?",
  discard: "Discard Changes",
  keepEditing: "Keep Editing",
};

export interface SheetOptions<Item, Value> {
  /** Called once for each presented item, when its sheet closes. */
  readonly onResult?: (result: SheetResult<Item, Value>) => void;
  /** The identity of an item: presenting one with the key of the item shown or queued does nothing. */
  readonly keyExtractor?: (item: Item) => unknown;
  readonly labels?: Partial<SheetLabels>;
  /**
   * Shows the discard confirmation as a system `Alert` (the default). Pass `false` to draw your own from
   * `isConfirmingDiscard`, calling `discardChanges` and `keepEditing`.
   */
  readonly systemConfirmation?: boolean;
}

export interface PresentOptions {
  /** The element that opened the sheet, which gets screen-reader focus back when the sheet closes. */
  readonly opener?: RefObject<HostInstance | null>;
}

/** What a sheet component needs from the sheet, for an adapter to map onto its own props. */
export interface SheetBinding {
  readonly isOpen: boolean;
  /** Whether a swipe down or tap outside must not close the sheet: unsaved changes, the confirmation, or a save. */
  readonly isDismissDisabled: boolean;
  /** A close request, for the component's back button, backdrop press or blocked swipe. */
  readonly requestDismiss: () => void;
  /**
   * The component's sheet closed (a bottom-sheet library's `onClose`): after a gesture it allowed, or after the sheet
   * closed it. The next queued sheet waits for this, so it never shows while the last one is still animating away.
   */
  readonly dismissed: () => void;
  /**
   * The closed sheet is off screen, for a component that reports that apart from its gestures (`Modal`'s
   * `onDismiss`). Pass `false` when the platform has already given focus back to the opener.
   */
  readonly hidden: (restoresFocus: boolean) => void;
}

/** Maps a sheet onto a sheet component's props, such as a bottom-sheet library's. */
export type SheetAdapter<Props> = (binding: SheetBinding) => Props;

/** The props `Modal` needs, from `bind(modalSheet)`: a swipe it allows and the back button go through the sheet. */
export interface ModalSheetProps {
  readonly visible: boolean;
  readonly onRequestClose: () => void;
  readonly onDismiss: () => void;
  readonly allowSwipeDismissal: boolean;
}

/**
 * `Modal`'s adapter. iOS reports a swipe it allowed, and one `allowSwipeDismissal` blocked, through
 * `onRequestClose`, as Android does the back button; each is a close request. iOS's `onDismiss` says the modal has
 * finished animating away, and iOS has given focus back by then; Android has no `onDismiss`, so `useSheet` shows the
 * next sheet once a render with `visible` false has committed, and gives focus back itself.
 */
export const modalSheet: SheetAdapter<ModalSheetProps> = (binding) => ({
  visible: binding.isOpen,
  onRequestClose: binding.requestDismiss,
  onDismiss: () => binding.hidden(false),
  allowSwipeDismissal: !binding.isDismissDisabled,
});

export interface SheetController<Item, Value> extends SheetSnapshot<Item> {
  readonly present: (item: Item, options?: PresentOptions) => void;
  readonly requestDismiss: () => void;
  readonly dismissed: () => void;
  readonly discardChanges: () => void;
  readonly keepEditing: () => void;
  readonly setHasUnsavedChanges: (hasUnsavedChanges: boolean) => void;
  readonly save: (work: SaveSheet<Value>) => void;
  /** The props for a sheet component: `<Modal {...sheet.bind(modalSheet)}>`, or a bottom-sheet library's adapter. */
  readonly bind: <Props>(adapter: SheetAdapter<Props>) => Props;
}

type Opener = RefObject<HostInstance | null>;

/**
 * A sheet that edits an item and hands a result back: `present` an item, render it with `bind(modalSheet)` (or an
 * adapter for a bottom-sheet library), and call `requestDismiss` from its Cancel button and `save` from its Save
 * button. Android's back button is a close request while a sheet is open; a save still running at unmount is
 * aborted and reports nothing.
 */
export function useSheet<Item, Value = void>(
  options: SheetOptions<Item, Value> = {},
): SheetController<Item, Value> {
  const source: SheetSource<Item, Value, Opener> = {
    onResult: options.onResult ?? (() => {}),
    keyExtractor: options.keyExtractor ?? ((item) => item),
    restoreFocus: (opener) => {
      if (opener.current != null) AccessibilityInfo.sendAccessibilityEvent(opener.current, "focus");
    },
  };
  const labels = { ...defaultSheetLabels, ...options.labels };
  const latest = useRef(source);
  const latestLabels = useRef(labels);
  useLayoutEffect(() => {
    latest.current = source;
    latestLabels.current = labels;
  });
  const [machine] = useState(() => new SheetMachine<Item, Value, Opener>(() => latest.current));
  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot);
  const isOpen = snapshot.item !== undefined;

  useEffect(() => machine.dispose, [machine]);

  useEffect(() => {
    if (!isOpen) return;
    // A bottom-sheet library draws no window of its own, so back reaches the app; `Modal` takes it before this.
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      machine.requestDismiss();
      return true;
    });
    return () => subscription.remove();
  }, [isOpen, machine]);

  // Set when the sheet is bound to `Modal`, whose Android version reports no dismissal.
  const isModal = useRef(false);
  useEffect(() => {
    // Android's Modal is gone once a render without it has committed. A bottom-sheet library reports it itself.
    if (!isOpen && isModal.current && Platform.OS === "android") machine.hidden(true);
  }, [isOpen, machine]);

  const systemConfirmation = options.systemConfirmation ?? true;
  useEffect(() => {
    if (!systemConfirmation || !snapshot.isConfirmingDiscard) return;
    const text = latestLabels.current;
    Alert.alert(
      text.discardTitle,
      undefined,
      [
        { text: text.keepEditing, style: "cancel", onPress: machine.keepEditing },
        { text: text.discard, style: "destructive", onPress: machine.discardChanges },
      ],
      { cancelable: true, onDismiss: machine.keepEditing },
    );
  }, [systemConfirmation, snapshot.isConfirmingDiscard, machine]);

  return useMemo(() => {
    const binding: SheetBinding = {
      isOpen: snapshot.item !== undefined,
      isDismissDisabled: snapshot.isDismissDisabled,
      requestDismiss: machine.requestDismiss,
      dismissed: machine.dismissed,
      hidden: machine.hidden,
    };
    return {
      ...snapshot,
      present: (item, presentOptions) => machine.present(item, presentOptions?.opener),
      requestDismiss: machine.requestDismiss,
      dismissed: binding.dismissed,
      discardChanges: machine.discardChanges,
      keepEditing: machine.keepEditing,
      setHasUnsavedChanges: machine.setHasUnsavedChanges,
      save: machine.save,
      bind: (adapter) => {
        if (adapter === (modalSheet as unknown)) isModal.current = true;
        return adapter(binding);
      },
    };
  }, [snapshot, machine]);
}
