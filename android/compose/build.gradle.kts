import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.compose)
}

val projectVersion = version.toString()

android {
  namespace = "ai.codual.ui"
  compileSdk = 36

  defaultConfig {
    // React Native's minimum too; Compose itself needs 23.
    minSdk = 24
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_11
    targetCompatibility = JavaVersion.VERSION_11
  }

  buildFeatures {
    compose = true
  }

  lint {
    warningsAsErrors = true
    // New releases of dependencies would otherwise fail a build that hasn't changed.
    disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable")
    // A dependency's own lint checks (lifecycle-runtime's) being too old for this lint is no fault of this code.
    disable += "ObsoleteLintCustomCheck"
  }

  testOptions {
    // Robolectric runs the composable tests on the JVM, with the library's string resources.
    unitTests.isIncludeAndroidResources = true
    unitTests.all { test ->
      test.systemProperty("codual.ui.version", projectVersion)
      // Robolectric's Android 16 needs this on JDK 17 and later.
      test.jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
    }
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
  // The public API takes and returns types from these.
  api(platform(libs.compose.bom))
  api(libs.compose.runtime)
  api(libs.compose.ui)
  api(libs.kotlinx.coroutines.core)
  implementation(libs.compose.foundation)
  implementation(libs.compose.material3)
  // BackHandler, for leaving the selection mode on back; Material 3 already brings this version.
  implementation(libs.activity.compose)

  testImplementation(platform(libs.compose.bom))
  testImplementation(libs.compose.ui.test.junit4)
  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
  testImplementation(libs.robolectric)
}
