plugins {
    id("com.android.application")
}

android {
    namespace = "com.thebedesk.ai"
    compileSdk = 36

    defaultConfig {
        // Provisional until the release package name and signing owner are confirmed.
        applicationId = "com.thebedesk.ai"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            // The release variant is not authorized for distribution.
            isMinifyEnabled = false
        }
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.4")
}
