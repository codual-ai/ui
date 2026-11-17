package ai.codual.ui

import android.content.ComponentName
import androidx.activity.ComponentActivity
import org.junit.rules.ExternalResource
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** Declares the `ComponentActivity` the compose rule launches, which a library's test manifest doesn't declare. */
internal class DeclareComposeActivity : ExternalResource() {
  override fun before() {
    val application = RuntimeEnvironment.getApplication()
    val activity = ComponentName(application, ComponentActivity::class.java)
    shadowOf(application.packageManager).addActivityIfNotPresent(activity)
  }
}
