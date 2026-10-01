plugins { id("com.android.application") }

android {
    namespace = "de.stegmann.cashbackoptimizer"
    compileSdk = 36
    defaultConfig {
        applicationId = "de.stegmann.cashbackoptimizer"
        minSdk = 26
        targetSdk = 36
        versionCode = 4
        versionName = "1.1.1"
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }
}

dependencies {
    implementation("androidx.activity:activity:1.9.3")
}
