pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode = RepositoriesMode.FAIL_ON_PROJECT_REPOS
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "codual-ui"

include(":codual-ui-compose")
project(":codual-ui-compose").projectDir = file("compose")

include(":codual-ui-play-billing")
project(":codual-ui-play-billing").projectDir = file("play-billing")
