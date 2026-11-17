@file:OptIn(ExperimentalCoroutinesApi::class)

package ai.codual.ui.permissions

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent

/** A permission whose system prompt waits until the test answers it, and whose status the test sets. */
internal class FakeAccess(
  override val canAskForFullAccess: Boolean = false,
  override val settingsPage: SettingsPage = SettingsPage.App,
) : PermissionAccess {
  override val id: String = "fake"
  var current: PermissionStatus = PermissionStatus.NotDetermined
  var readError: Exception? = null
  var requestError: Exception? = null
  /** Reads wait for [answerReads] while this is true. */
  var holdsReads = false
  var reads = 0
    private set

  var requests = 0
    private set

  private val waitingRequests = ArrayDeque<CompletableDeferred<Unit>>()
  private val waitingReads = ArrayDeque<CompletableDeferred<Unit>>()

  val waitingReadCount: Int
    get() = waitingReads.size

  override suspend fun status(): PermissionStatus {
    reads++
    if (holdsReads) CompletableDeferred<Unit>().also(waitingReads::add).await()
    readError?.let { throw it }
    return current
  }

  override suspend fun request(): PermissionStatus {
    requests++
    requestError?.let { throw it }
    CompletableDeferred<Unit>().also(waitingRequests::add).await()
    return current
  }

  /** Answers the system prompt, and leaves the status at [status]. */
  fun answerRequest(status: PermissionStatus) {
    current = status
    waitingRequests.removeFirst().complete(Unit)
  }

  /** Lets every held read answer with the status as it is now. */
  fun answerReads() {
    while (waitingReads.isNotEmpty()) waitingReads.removeFirst().complete(Unit)
  }
}

internal class FakeMemory : PermissionMemory {
  val keys = mutableSetOf<String>()

  override fun contains(key: String): Boolean = key in keys

  override fun add(key: String) {
    keys += key
  }

  override fun remove(key: String) {
    keys -= key
  }
}

internal class FakeSystemError : Exception("the system said no")

/** A state over [access] whose first read has answered; Settings pages it opens go to [opened]. */
internal fun TestScope.startedPermission(
  access: PermissionAccess,
  memory: PermissionMemory = FakeMemory(),
  opened: MutableList<SettingsPage> = mutableListOf(),
): PermissionState {
  val state = PermissionState(access, backgroundScope, memory) { opened += it }
  runCurrent()
  return state
}
