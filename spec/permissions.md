---
prefix: PM
status: implemented
---

# Permissions

## Purpose

Asking for a system permission at the right moment: notifications, the camera, photos, location while the app is in
use, the microphone and contacts, and any other through a small adapter. The app creates one permission object per
permission; it reads the status without prompting, and when the user starts something that needs it, it shows the
app's own explanation first and the system prompt only after the user goes on. It never asks on launch, never asks
again right after a "no", sends the user to Settings once the system won't ask any more, reads the status again when
the app comes back from Settings, and treats a partial grant (limited photos, approximate location) as usable. It has
no views: the explanation and the Settings guidance are the app's, and so is every word in them.

## States

A permission has two parts: its **status**, read from the system, and one **phase** for the flow the user started.

| Status | What is true |
|---|---|
| unknown | The first read hasn't answered yet. Asking waits for it. |
| not determined | The system has never been asked. One system prompt is still to come. |
| granted | The app has full access. |
| limited | The app has part of it: some photos or contacts, an approximate location. Usable. |
| provisional | iOS notifications delivered quietly, without a prompt. Usable. |
| denied | The user said no, and the system will still ask again (Android only). |
| blocked | The user said no, and the system won't ask again: only Settings can change it. |
| restricted | The device doesn't let the user grant it (parental controls, a device policy). Settings won't help either. |
| unavailable | The permission can't be asked for here, with a reason for the developer: a usage string or manifest entry is missing, the platform hasn't got it, or the adapter failed. |

Granted, limited and provisional are **usable**: the feature runs. Every other status means the feature falls back.

| Phase | The app shows | What is true |
|---|---|---|
| idle | the feature, working or falling back | No flow runs. |
| explaining | its explanation: why the feature needs the permission, and a button to go on | The user started something that needs it. Nothing has been asked of the system yet. |
| requesting | nothing of its own | The system prompt (or Android's photo or location chooser) is up. |
| settings guidance | its guidance: how to turn the permission on in Settings, a button that opens them, and one to close it | The system won't ask any more. |

## Transitions

| From | Event | To | Also |
|---|---|---|---|
| (start) | the permission is created | idle | Reads the status. Never prompts. |
| idle | ask, while the status is unknown | (same) | Waits for the read, then goes on as below. |
| idle | ask, not determined or denied | explaining | |
| idle | ask, granted, limited or provisional | idle | Answers with the status at once. |
| idle | ask, blocked | settings guidance | |
| idle | ask, restricted or unavailable | idle | Answers with the status. Shows nothing. |
| idle | suggest, not determined and never declined | explaining | |
| idle | suggest, anything else | idle | Answers with the status. Shows nothing. |
| idle | ask for full access, limited or provisional, and the system can ask again | explaining | |
| idle | ask for full access, limited, and the system can't ask again | settings guidance | |
| idle | ask for full access, any other status | (as for ask) | |
| explaining | accept | requesting | Asks the system. |
| explaining | decline | idle | Remembers the decline. Answers with the status, unchanged. |
| requesting | the system answers usable | idle | Answers with the new status. |
| requesting | the system answers anything else | idle | Remembers the decline. Answers with the new status. |
| settings guidance | open Settings | (same) | Opens the app's own page in Settings. |
| settings guidance | decline | idle | Answers with the status. |
| explaining, requesting, settings guidance | ask, suggest or ask for full access | (same) | Nothing new: answers with the same flow's result. |
| explaining | accept again | (same) | Nothing: one system prompt. |
| idle, explaining, settings guidance | the app returns to the foreground | (same), or idle if now usable | Reads the status. A flow that ends answers with it. |
| requesting | the app returns to the foreground | (same) | Nothing: the system's answer decides. |

## Edge cases

- **PM-01** Creating a permission reads its status without prompting. Until that read answers, the status is
  unknown, never "denied", so the app doesn't show a fallback for a permission it has.
- **PM-02** Nothing is asked on its own: creating the permission at launch or as a screen appears, reading its
  status, and the app returning to the foreground never show the explanation or the system prompt. Only ask, suggest
  and ask for full access start a flow.
- **PM-03** Asking shows the app's explanation first; the system prompt shows only once the user accepts it.
- **PM-04** Declining the explanation shows no system prompt and changes no status: the one system prompt is saved for
  a moment the user wants it. Ask answers with the status as it was.
- **PM-05** Asking before the first read has answered waits for it, so a permission already granted never shows the
  explanation.
- **PM-06** Asking for a permission that is granted, limited or provisional shows nothing and answers with the status
  at once.
- **PM-07** Suggest, for a moment the app chooses (after onboarding, say), shows the explanation only while the status
  is not determined and the user has never declined it. A decline, of the explanation or of the system prompt, is
  remembered across launches, so the user is never asked twice in a row.
- **PM-08** When the user says no to the system prompt, the flow ends there: the status is denied or blocked, ask
  answers with it, and neither the explanation nor the Settings guidance follows by itself.
- **PM-09** Once the system won't ask again (any "no" on iOS; "don't ask again" or a second "no" on Android), asking
  shows the Settings guidance, never the explanation or a request the system would ignore.
- **PM-10** Open Settings opens the app's own page in Settings (for notifications, the app's notification settings),
  and the guidance stays until the app comes back or the user declines it.
- **PM-11** When the app returns to the foreground, from Settings or anywhere, the status is read again. A permission
  turned on there ends the Settings guidance or the explanation, and ask answers granted; one turned off becomes
  denied or blocked, so the feature falls back. A return with nothing changed keeps the guidance up, and so does a
  limited grant while the flow asked for full access.
- **PM-12** A status read that answers while the system prompt is up, or that started before it, never overwrites the
  system's answer. The prompt itself makes the app inactive and active again, or pauses its activity on Android.
- **PM-13** Asking while a flow runs (a double tap) joins it: one explanation, one system prompt, and every ask
  answers with the same result. Accepting twice asks the system once.
- **PM-14** A partial grant is limited, and usable: limited photos and (iOS 18) limited contacts, reduced-accuracy
  location on iOS, approximate location (Android 12) and selected photos (Android 14) on Android. Asking answers at
  once.
- **PM-15** Ask for full access, while limited, shows the explanation and asks the system again where it will
  (approximate location and selected photos on Android), and shows the Settings guidance where it won't (iOS).
  Granted asks nothing; not determined asks as ask does.
- **PM-16** (only: SwiftUI, React Native) Provisional and ephemeral (App Clip) notifications are provisional and usable; ask for
  full access shows the explanation, then the system prompt.
- **PM-17** (only: SwiftUI) A restricted permission shows neither the explanation nor the Settings guidance, since
  neither can change it: ask answers restricted.
- **PM-18** A missing usage string (iOS's Info.plist) or manifest entry (Android) makes the status unavailable, with a
  reason that names the missing key, instead of the crash iOS gives for a prompt without one or the prompt Android
  silently refuses. Ask shows nothing.
- **PM-19** (only: Compose, React Native) A "no" on Android that leaves the system able to ask again is denied; the
  next ask shows the explanation again, then the system prompt.
- **PM-20** (only: Compose, React Native) A "no" that leaves the system unable to ask again is blocked: a second "no"
  (Android 11 stops asking after two), "don't ask again" (Android 10 and earlier) or a prompt the system refused to
  show. The first "no" that looks like one (the user closed the prompt by tapping outside it) is denied, not blocked.
  Blocked is remembered across launches, since Android reads the same before the first ask.
- **PM-21** (only: Compose, React Native) Read on Android, granted forgets every earlier "no"; a permission remembered
  as blocked is blocked; one remembered as denied, or that Android wants a reason for, is denied; and anything else is
  not determined: a one-time permission that ran out, or one the system reset for an unused app, can be asked for
  again.
- **PM-22** (only: Compose, React Native) Below Android 13 there is no notification prompt: notifications are granted
  and ask shows nothing.
- **PM-23** (only: Compose, React Native) Android asks for what each version needs: photos as images and selected
  photos on Android 14, images on 13, and storage before; location as precise and approximate together, so the user
  can choose.
- **PM-24** Any other permission (Bluetooth, the calendar, motion) goes through the same small adapter, with its own
  status read and request, and gets the same flow.
- **PM-25** An adapter that fails, reading or requesting, makes the status unavailable with its error as the reason:
  the flow ends, ask answers, and nothing crashes.
- **PM-26** (only: Compose) Notifications turned off for the app in Settings are blocked, on every Android version,
  even with the permission granted; the Settings guidance opens the app's notification settings.

## Accessibility

- The explanation and the Settings guidance are the app's own views: a sheet or dialog a screen reader announces as
  it appears, with its heading and text read in order, and real buttons with text labels ("Continue", "Open
  Settings", "Not Now"), never an icon alone.
- The explanation's text says what the feature does with the permission, in words larger text can reflow, and never
  only in an image.
- The system prompt and Settings are the system's: they follow its own accessibility settings.
- The behaviour has no text of its own. Every word is the app's, in its own string catalog or resources, including the
  iOS usage strings (localised with an `InfoPlist` string table).

## Left to the app

- The explanation's and guidance's views and wording, and when to start a flow: ask from the user's tap on the
  feature, suggest at a moment the app chooses.
- What the feature does when the permission isn't usable: a photo picker that needs no permission, typing an address,
  a message.
- The usage strings in Info.plist and the `<uses-permission>` entries in AndroidManifest.xml.
- Background location ("always"), precise location for a moment on iOS (`requestTemporaryFullAccuracyAuthorization`),
  changing the limited photo selection (`presentLimitedLibraryPicker`), notification options beyond alerts, sounds and
  badges, and asking for several permissions on one screen.
- Where the permission object lives: one per screen, or one per app shared by its screens.

## Platform notes

- **The explanation.** Apple's guidance: ask only when the user does something that needs the permission, and if the
  context doesn't explain it, show a screen before the system alert with one button that clearly leads to it, not
  titled "Allow" and not looking like the alert. App Review has rejected explanations with a "Not Now" before the
  prompt, so on iOS give the explanation one button (accept); decline is for the user closing it another way.
  Google's guidance: ask in context, explain why when the system says a reason is needed
  (`shouldShowRequestPermissionRationale`), and give the user a way to carry on without it, so a "No Thanks" button
  (decline) is fine on Android. Neither wants permissions asked for on launch, unless the app can't work at all without
  them.
- **The adapters.** SwiftUI: `.notifications` (`UNUserNotificationCenter`), `.camera` (`AVCaptureDevice`), `.photos`
  (`PHPhotoLibrary`, read and write), `.locationWhenInUse` (`CLLocationManager`), `.microphone` (`AVAudioApplication`)
  and `.contacts` (`CNContactStore`), each checking its usage string first. Compose: `AndroidPermission`s over
  `ActivityResultContracts.RequestMultiplePermissions` and `shouldShowRequestPermissionRationale`, each checking the
  app's manifest first. React Native: `androidPermission` over React Native's own `PermissionsAndroid`, and
  `createReactNativePermissionsAccess` from `@codual-ai/react-native-ui/react-native-permissions` for iOS (an optional
  peer dependency, react-native-permissions; on Android it uses `androidPermission`).
- **Usage strings (PM-18).** iOS ends an app that asks for the camera, photos, location, the microphone or contacts
  without its Info.plist string (`NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`,
  `NSLocationWhenInUseUsageDescription`, `NSMicrophoneUsageDescription`, `NSContactsUsageDescription`); notifications
  need none. Android ignores a request for a permission missing from the manifest. React Native's `PermissionsAndroid`
  can't read the manifest, so there a missing entry reads as blocked; react-native-permissions reports a permission
  whose native part isn't set up as unavailable. JavaScript can't read Info.plist, so on React Native a missing iOS
  usage string still ends the app when the prompt shows: the app adds them (in Info.plist or Expo's config).
- **Asking once on iOS (PM-09).** iOS shows each system prompt once. After that, `denied` is blocked: only Settings
  (`UIApplication.openSettingsURLString`, or `openNotificationSettingsURLString` for notifications) can change it.
- **Android's "no" (PM-19 to PM-21).** Android says nothing about whether it will ask again, only whether a reason
  should be shown first. Before the first ask, after a closed prompt and after "don't ask again" it says the same, so
  the Android adapters remember each "no" (SharedPreferences on Compose; on React Native the store the app gives
  `configurePermissions`, such as MMKV). Compose compares the reason flag before and after each request; React Native's `PermissionsAndroid` has
  no reason flag to read, so it goes by the request's answer (`never_ask_again`) and what it remembers.
- **Returning to the app (PM-11).** SwiftUI listens for `willEnterForegroundNotification`, which the system prompt
  doesn't send; Compose refreshes on the activity's `ON_RESUME`; React Native on `AppState` becoming active. iOS and
  Android end the app when the user turns a permission off in Settings (apart from notifications), so that change
  arrives as the next launch's first read.
- **Notifications on Android (PM-22, PM-26).** `POST_NOTIFICATIONS` exists from Android 13. Compose also reads
  `NotificationManagerCompat.areNotificationsEnabled()`; React Native's `PermissionsAndroid` can't, so there
  notifications turned off in Settings stay granted.
- **Partial grants (PM-14, PM-15).** iOS can't be asked again for full photos, contacts or precise location, only
  sent to Settings. Android asks again: for precise location it offers the upgrade, and for photos it shows its
  chooser again.
- **Restricted (PM-17)** exists only on iOS. An Android device policy that refuses a permission reads as blocked, and
  react-native-permissions reports a restricted iOS permission as unavailable.
