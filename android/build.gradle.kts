// AGP compiles Kotlin itself; the Compose plugin puts its Kotlin version on the classpath, so both use the same one.
plugins {
  alias(libs.plugins.android.library) apply false
  alias(libs.plugins.kotlin.compose) apply false
}
