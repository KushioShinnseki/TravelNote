plugins {
    id("com.android.application")
}

val signingStorePath = System.getenv("ANDROID_KEYSTORE_PATH")
val signingStorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
val signingKeyAlias = System.getenv("ANDROID_KEY_ALIAS")
val signingKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
val hasCiSigning = !signingStorePath.isNullOrBlank()

android {
    namespace = "com.travelnote.mobile"
    compileSdk = 35

    signingConfigs {
        create("release") {
            if (hasCiSigning) {
                storeFile = file(signingStorePath!!)
                storeType = "JKS"
                storePassword = signingStorePassword ?: ""
                keyAlias = signingKeyAlias ?: ""
                keyPassword = signingKeyPassword ?: ""
            }
        }
    }

    defaultConfig {
        applicationId = "com.travelnote.mobile"
        minSdk = 26
        targetSdk = 35
        versionCode = 5
        versionName = "0.1.4"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (hasCiSigning) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // ZXing's camera activity uses AndroidX Core at runtime, including ContextCompat.
    implementation("androidx.core:core:1.15.0")
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
