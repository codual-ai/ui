package ai.codual.ui.screenstates

import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException

// Deep enough for any real wrapping; a cause chain that loops would otherwise never end.
private const val MAX_CAUSE_DEPTH = 32

/**
 * Whether a load failed for lack of a connection: an [UnknownHostException], [ConnectException] or
 * [NoRouteToHostException], or an exception caused by one. `ScreenStates` shows the offline view for these.
 */
public fun isOfflineError(error: Throwable): Boolean =
  generateSequence(error) { it.cause }
    .take(MAX_CAUSE_DEPTH)
    .any { it is UnknownHostException || it is ConnectException || it is NoRouteToHostException }

/** A cancellation, which never shows as an error. A timeout is a failure, even though it is a cancellation too. */
internal fun isCancellation(error: Throwable): Boolean =
  error is CancellationException && error !is TimeoutCancellationException

internal fun isEmptyCollection(value: Any?): Boolean =
  (value is Collection<*> && value.isEmpty()) || (value is Map<*, *> && value.isEmpty())

/** The failure's own message when there is one worth showing, never for a cancellation. */
internal fun userFacingMessage(error: Throwable): String? =
  if (error is CancellationException) null else error.localizedMessage?.takeIf { it.isNotBlank() }
