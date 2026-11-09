plugins { id("com.android.application") }
val storePath = System.getenv("ANDROID_KEYSTORE_PATH")
android {
    namespace = "com.travelnote.local"
    compileSdk = 35
    defaultConfig {
        applicationId = "com.travelnote.local"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
    signingConfigs {
        create("release") {
            if (!storePath.isNullOrBlank()) {
                storeFile = file(storePath)
                storeType = "JKS"
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes { release { if (!storePath.isNullOrBlank()) signingConfig = signingConfigs.getByName("release") } }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    androidResources { noCompress += "json" }
}
// Assets must be built explicitly by npm run build:local (also done by CD).
tasks.named("preBuild") { doFirst {
    check(file("src/main/assets/index.html").isFile) { "Run npm run build:local from the repository root first" }
} }
