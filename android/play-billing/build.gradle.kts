import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.library)
}

// The Play Billing store for Codual UI's purchases, in its own library so that apps which sell nothing don't get
// the billing permission it brings.
android {
  namespace = "ai.codual.ui.playbilling"
  compileSdk = 36

  defaultConfig {
    minSdk = 24
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }

  lint {
    warningsAsErrors = true
    disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable")
    disable += "ObsoleteLintCustomCheck"
  }

  testOptions {
    unitTests.all { test -> test.jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED") }
  }
}

kotlin {
  explicitApi()
  compilerOptions {
    jvmTarget = JvmTarget.JVM_11
    allWarningsAsErrors = true
  }
}

dependencies {
  api(project(":codual-ui-compose"))
  api(libs.play.billing.ktx)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
}
