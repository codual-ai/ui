# Permissions

Asking for a permission at the right moment: notifications, the camera, photos, location while in use, the
microphone and contacts, or any other through a small adapter. Creating a permission reads its status and never
prompts. When the person taps something that needs it, `ask` shows your explanation first and the system prompt
only once they go on. After a "no" the system won't ask again, so it shows your Settings guidance instead, and reads
the status again when the app comes back from Settings. Limited photos and an approximate location count as usable,
and a double tap never prompts twice. On SwiftUI and Compose a missing Info.plist usage string or manifest entry
reads as unavailable instead of crashing; React Native can't read Info.plist, so there the usage strings are yours
to add. The explanation, the guidance and every word in them are yours.

```swift
// SwiftUI (NSCameraUsageDescription in Info.plist)
@State private var camera = PermissionModel(.camera)

Button("Scan") { Task { if await camera.ask().isUsable { scanning = true } } }
  .sheet(isPresented: camera.isExplaining) { CameraExplanation(onContinue: camera.accept) }  // a swipe declines
  .alert("Turn On the Camera", isPresented: camera.isShowingSettingsGuidance) {
    Button("Open Settings", action: camera.openSettings)
    Button("Not Now", role: .cancel) {}
  }
```

```kotlin
// Jetpack Compose (<uses-permission android:name="android.permission.CAMERA" /> in the manifest)
val camera = rememberPermission(AndroidPermission.Camera)

Button(onClick = { scope.launch { if (camera.ask().isUsable) scanning = true } }) { Text("Scan") }
if (camera.phase == PermissionPhase.Explaining) CameraExplanation(onContinue = camera::accept, onDismiss = camera::decline)
if (camera.phase == PermissionPhase.SettingsGuidance) SettingsDialog(onOpen = camera::openSettings, onDismiss = camera::decline)
```

```tsx
// React Native: PermissionsAndroid on Android, react-native-permissions on iOS
import * as permissions from "react-native-permissions";
import { createReactNativePermissionsAccess } from "@codual/react-native-ui/react-native-permissions";
import { configurePermissions, isUsable, permissionMemory, usePermission } from "@codual/react-native-ui";
import { createMMKV } from "react-native-mmkv";
configurePermissions({ memory: permissionMemory(createMMKV()) });  // once, at launch: declines last across launches
const cameraAccess = createReactNativePermissionsAccess(permissions, "camera");

const camera = usePermission(cameraAccess);
<Button title="Scan" onPress={async () => setScanning(isUsable(await camera.ask()))} />
<CameraExplanation visible={camera.phase === "explaining"} onContinue={camera.accept} onDismiss={camera.decline} />
<SettingsGuidance visible={camera.phase === "settings-guidance"} onOpen={camera.openSettings} onDismiss={camera.decline} />
```

| | iOS | Android | React Native |
|---|---|---|---|
| The permission | `PermissionModel(.camera)`, in `@State` | `rememberPermission(AndroidPermission.Camera)` | `usePermission(access)`, or `createPermission(access)` to share one |
| Built in | `.notifications`, `.camera`, `.photos`, `.locationWhenInUse`, `.microphone`, `.contacts` | `AndroidPermission.Notifications`, `Camera`, `Photos`, `LocationWhenInUse`, `Microphone`, `Contacts` | `androidPermission("camera")` (Android), `createReactNativePermissionsAccess(permissions, "camera")` (both) |
| Another permission | `PermissionAccess` | `AndroidPermission("bluetooth", BLUETOOTH_CONNECT)`, or `PermissionAccess` | `androidPermission({ id, permissions })`, or `PermissionAccess` |
| Status | `status` (nil until read): `.notDetermined`, `.granted`, `.limited`, `.provisional`, `.denied`, `.blocked`, `.restricted`, `.unavailable(reason:)`; `isUsable` | `status` (null until read): the same, as `PermissionStatus` | `status` (undefined until read): `status.status`, the same names, kebab-case; `isUsable` |
| Asking | `ask()` on a tap, `suggest()` at a moment you choose, `askForFullAccess()` for more than limited; each answers with the status | the same, as suspend functions | the same, as promises |
| Your views | by `phase`: `.explaining` (`accept()`, `decline()`), `.settingsGuidance` (`openSettings()`, `decline()`) | by `phase`: `Explaining`, `SettingsGuidance` | by `phase`: `"explaining"`, `"settings-guidance"` |
| Reading again | when the app returns to the foreground | when the activity resumes | when the app becomes active |
| Your views' bindings | `isExplaining`, `isShowingSettingsGuidance`: dismissing either declines | call `decline()` in `onDismissRequest` | call `decline()` when your modal closes |
| Remembered across launches | `UserDefaults` | SharedPreferences | `configurePermissions({ memory: permissionMemory(mmkv) })`, once at launch |
