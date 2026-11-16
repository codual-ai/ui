package ai.codual.ui.screenstates

import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import kotlinx.coroutines.CancellationException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoadErrorsTest {
  @Test
  fun `SS-06 connection errors are offline, also when they are the cause`() {
    assertTrue(isOfflineError(UnknownHostException()))
    assertTrue(isOfflineError(ConnectException()))
    assertTrue(isOfflineError(NoRouteToHostException()))
    assertTrue(isOfflineError(IOException("request failed", UnknownHostException())))
  }

  @Test
  fun `SS-06 server and other errors are not offline`() {
    assertFalse(isOfflineError(SocketTimeoutException()))
    assertFalse(isOfflineError(IOException("HTTP 500")))
    assertFalse(isOfflineError(TestError()))
  }

  @Test
  fun `a cause chain that loops ends`() {
    val first = IOException("first")
    val second = IOException("second", first)
    first.initCause(second)
    assertFalse(isOfflineError(first))
  }

  @Test
  fun `only a cancellation that isn't a timeout is a cancellation`() {
    assertTrue(isCancellation(CancellationException("cancelled")))
    assertFalse(isCancellation(TestError()))
  }
}
