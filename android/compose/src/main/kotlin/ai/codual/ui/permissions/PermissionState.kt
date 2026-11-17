package ai.codual.ui.permissions

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * One permission, asked for at the right moment. Creating it reads the status and never prompts. When the user starts
 * something that needs it, [ask] shows the app's explanation (`phase == Explaining`), and only [accept] shows the system
 * prompt; once the system won't ask again, it shows the app's Settings guidance instead. Most apps get one from
 * [rememberPermission], which reads the status again each time the activity resumes.
 *
 * ```
 * val camera = rememberPermission(AndroidPermission.Camera)
 * Button(onClick = { scope.launch { if (camera.ask().isUsable) scanning = true } }) { Text("Scan") }
 * if (camera.phase == PermissionPhase.Explaining) CameraExplanation(onContinue = camera::accept, onDismiss = camera::decline)
 * ```
 *
 * @param scope runs the reads and the request, on the main thread.
 * @param memory where a declined explanation is remembered, so [suggest] never asks twice in a row.
 * @param openSettingsPage opens a page in Settings.
 */
@Stable
public class PermissionState(
  private val access: PermissionAccess,
  private val scope: CoroutineScope,
  private val memory: PermissionMemory,
  private val openSettingsPage: (SettingsPage) -> Unit,
) {
  /** The system's status, or null until the first read answers. */
  public var status: PermissionStatus? by mutableStateOf(null)
    private set

  public var phase: PermissionPhase by mutableStateOf(PermissionPhase.Idle)
    private set

  private var flow: CompletableDeferred<PermissionStatus>? = null
  private var readsStarted = 0
  /** Reads that started at or before this one answer too late to count: a newer read, or the system prompt, decided. */
  private var newestApplied = 0
  /** The running flow asked for full access, so a limited or provisional status doesn't end it. */
  private var isForFullAccess = false
  private val firstRead: Job = scope.launch { refresh() }

  /** Whether the feature can run now: granted, limited or provisional. */
  public val isUsable: Boolean
    get() = status?.isUsable == true

  /**
   * For the user's tap on a feature that needs the permission: the explanation, the system prompt once it's accepted,
   * or the Settings guidance once the system won't ask. Answers with the status when the flow ends; at once when it's
   * already usable, restricted or unavailable. A second ask while a flow runs joins it.
   */
  public suspend fun ask(): PermissionStatus {
    val current = knownStatus()
    flow?.let { return it.await() }
    return when (current) {
      PermissionStatus.NotDetermined,
      PermissionStatus.Denied -> start(PermissionPhase.Explaining)
      PermissionStatus.Blocked -> start(PermissionPhase.SettingsGuidance)
      else -> current
    }
  }

  /**
   * For a moment the app chooses, such as the end of onboarding: the explanation only while the system has never been
   * asked and the user has never declined it. Otherwise it shows nothing and answers with the status.
   */
  public suspend fun suggest(): PermissionStatus {
    val current = knownStatus()
    flow?.let { return it.await() }
    if (current != PermissionStatus.NotDetermined || memory.contains(declinedKey)) return current
    return start(PermissionPhase.Explaining)
  }

  /**
   * For a feature that needs more than a limited grant: the explanation where the system asks again (approximate
   * location, selected photos), the Settings guidance where it won't. Any other status goes as [ask] does.
   */
  public suspend fun askForFullAccess(): PermissionStatus {
    val current = knownStatus()
    flow?.let { return it.await() }
    if (current != PermissionStatus.Limited && current != PermissionStatus.Provisional) return ask()
    isForFullAccess = true
    return start(if (access.canAskForFullAccess) PermissionPhase.Explaining else PermissionPhase.SettingsGuidance)
  }

  /** The explanation's button: shows the system prompt. Does nothing unless the explanation is showing. */
  public fun accept() {
    if (phase != PermissionPhase.Explaining) return
    phase = PermissionPhase.Requesting
    scope.launch { requestAccess() }
  }

  /** The user closed the explanation or the Settings guidance without going on. A declined explanation is remembered. */
  public fun decline() {
    when (phase) {
      PermissionPhase.Explaining -> {
        memory.add(declinedKey)
        finish()
      }
      PermissionPhase.SettingsGuidance -> finish()
      PermissionPhase.Idle,
      PermissionPhase.Requesting -> return
    }
  }

  /** The Settings guidance's button: opens the app's page in Settings. The guidance stays until the app returns. */
  public fun openSettings() {
    if (phase == PermissionPhase.SettingsGuidance) openSettingsPage(access.settingsPage)
  }

  /** Reads the status again. The state does this when it is created; [rememberPermission], when the activity resumes. */
  public suspend fun refresh() {
    val read = ++readsStarted
    val answer = outcome { access.status() }
    if (read <= newestApplied) return
    newestApplied = read
    status = answer
    val isShowing = phase == PermissionPhase.Explaining || phase == PermissionPhase.SettingsGuidance
    if (isShowing && !stillNeedsTheShownFlow(answer)) finish()
  }

  private val declinedKey: String
    get() = "${access.id}.declined"

  private suspend fun knownStatus(): PermissionStatus {
    status?.let {
      return it
    }
    firstRead.join()
    return status ?: UNREAD_STATUS
  }

  /**
   * Whether the explanation or guidance still has something to do after a fresh read: an explanation while the system
   * can ask, guidance while only Settings can help, either while a full-access flow has only part of it.
   */
  private fun stillNeedsTheShownFlow(answer: PermissionStatus): Boolean {
    if (isForFullAccess) return answer == PermissionStatus.Limited || answer == PermissionStatus.Provisional
    return when (phase) {
      PermissionPhase.Explaining -> answer == PermissionStatus.NotDetermined || answer == PermissionStatus.Denied
      PermissionPhase.SettingsGuidance -> answer == PermissionStatus.Blocked
      PermissionPhase.Idle,
      PermissionPhase.Requesting -> true
    }
  }

  private suspend fun start(phase: PermissionPhase): PermissionStatus {
    this.phase = phase
    val started = CompletableDeferred<PermissionStatus>()
    flow = started
    return started.await()
  }

  private suspend fun requestAccess() {
    val answer = outcome { access.request() }
    // Every read that started before the system answered is older than its answer.
    newestApplied = readsStarted
    status = answer
    // A prompt closed without answering (still not determined) is no "no".
    if (answer == PermissionStatus.Denied || answer == PermissionStatus.Blocked) memory.add(declinedKey)
    finish()
  }

  private fun finish() {
    phase = PermissionPhase.Idle
    isForFullAccess = false
    val ended = flow
    flow = null
    ended?.complete(status ?: UNREAD_STATUS)
  }
}

/** Never used in practice: every read sets a status before a flow can end. */
private val UNREAD_STATUS = PermissionStatus.Unavailable("The status couldn't be read.")

private suspend fun outcome(body: suspend () -> PermissionStatus): PermissionStatus =
  try {
    body()
  } catch (error: CancellationException) {
    throw error
  } catch (error: Exception) {
    PermissionStatus.Unavailable(error.message ?: error.toString())
  }
