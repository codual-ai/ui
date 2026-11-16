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
  }

  testOptions {
    unitTests.all { test -> test.systemProperty("codual.ui.version", projectVersion) }
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
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.runtime)
  implementation(libs.kotlinx.coroutines.core)

  testImplementation(libs.junit)
  testImplementation(libs.kotlinx.coroutines.test)
}
