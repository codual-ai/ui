/** The Codual UI release this build comes from. */
export const version = "0.0.0";

export { isOfflineError } from "./screen-states/errors";
export type { Load, RefreshError, ScreenState, ScreenStatesSnapshot } from "./screen-states/machine";
export { ScreenStates, type ScreenStatesProps } from "./screen-states/ScreenStates";
export {
  defaultScreenStatesLabels,
  type ScreenStatesLabels,
  SystemEmptyView,
  SystemFailedView,
  SystemLoadingView,
  SystemOfflineView,
  SystemRefreshErrorAlert,
} from "./screen-states/system-views";
export {
  type ScreenStatesController,
  type ScreenStatesOptions,
  useScreenStates,
} from "./screen-states/use-screen-states";
