package ai.codual.ui

import org.junit.Assert.assertEquals
import org.junit.Test

class VersionTest {
  @Test
  fun `the version constant is the Gradle project version`() {
    assertEquals(System.getProperty("codual.ui.version"), CODUAL_UI_VERSION)
  }
}
