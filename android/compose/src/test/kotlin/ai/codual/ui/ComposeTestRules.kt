package ai.codual.ui

import android.content.ComponentName
import androidx.activity.ComponentActivity
import org.junit.rules.ExternalResource
import org.junit.rules.TestRule
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf

/** Declares the ComponentActivity the compose rule launches, which a library's test manifest doesn't. Put it first. */
internal fun declareComponentActivity(): TestRule =
  object : ExternalResource() {
    override fun before() {
      val application = RuntimeEnvironment.getApplication()
      val activity = ComponentName(application, ComponentActivity::class.java)
      shadowOf(application.packageManager).addActivityIfNotPresent(activity)
    }
  }
