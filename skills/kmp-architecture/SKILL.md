# KMP Architecture — Clean Architecture for Kotlin Multiplatform

## Description
Guides implementation of Clean Architecture in Kotlin Multiplatform projects. Covers `commonMain`/platform source set organization, `expect`/`actual` vs interface injection, Repository and UseCase patterns, Gradle module structure by feature, and Koin multiplatform DI setup.

## Trigger phrases
- "structure my KMP project"
- "clean architecture KMP"
- "expect actual vs interface"
- "KMP module structure"
- "koin multiplatform setup"
- "commonMain architecture"
- "KMP repository pattern"

## Rules & Checks

### Source Set Layer Architecture

- **Domain layer lives entirely in `commonMain`** — no platform imports, no framework dependencies.
- **Data layer uses `expect/actual` or interface injection** for platform-specific implementations.
- **UI layer is platform-specific** (`androidMain`, `iosMain`, `desktopMain`).

```
commonMain/
  domain/
    model/       ← pure Kotlin data/sealed classes
    repository/  ← interfaces only
    usecase/     ← business logic, depends only on repository interfaces
  data/
    repository/  ← implementations (may use expect/actual)
    
androidMain/
  data/repository/ ← Android-specific implementations (Room, Retrofit)
  ui/              ← Compose, ViewModels

iosMain/
  data/repository/ ← iOS implementations (SQLite, Ktor)
```

### expect/actual vs Interface + Injection

- **Use `expect/actual` for**: platform-specific utilities with no shared behavior (logging, UUID generation, file paths, date formatting).
- **Use `interface` + DI for**: components with shared logic that vary by platform (repositories, storage, sensors).

```kotlin
// GOOD: expect/actual for simple platform utilities
// commonMain
expect fun generateUUID(): String
expect fun currentTimeMillis(): Long

// androidMain
actual fun generateUUID(): String = java.util.UUID.randomUUID().toString()
// iosMain
actual fun generateUUID(): String = platform.Foundation.NSUUID().UUIDString()

// GOOD: interface + injection for complex repositories
// commonMain
interface LocalDatabase {
    suspend fun saveUser(user: User)
    suspend fun getUser(id: String): User?
}

// androidMain (injected via Koin)
class RoomLocalDatabase(private val dao: UserDao) : LocalDatabase { ... }
// iosMain
class SQLiteLocalDatabase(private val driver: SqlDriver) : LocalDatabase { ... }
```

- **Never use `if (platform == "android")` checks in commonMain** — this defeats the purpose of KMP.

### Repository Pattern

- Repository interfaces belong in `domain/repository/` in `commonMain`.
- Implementations belong in `data/repository/` in the appropriate source set.
- Repositories return domain models, never DTOs or platform types.

```kotlin
// commonMain - domain layer
interface UserRepository {
    suspend fun getUser(id: String): Result<User>
    suspend fun saveUser(user: User): Result<Unit>
}

// commonMain - data layer (uses Ktor for networking, shared)
class UserRepositoryImpl(
    private val remoteDataSource: UserRemoteDataSource,
    private val localDataSource: UserLocalDataSource
) : UserRepository {
    override suspend fun getUser(id: String): Result<User> = runCatching {
        localDataSource.getUser(id) ?: remoteDataSource.fetchUser(id).also {
            localDataSource.saveUser(it)
        }
    }
}
```

### UseCase Pattern

- One UseCase = one business operation. Name as verb: `GetUser`, `SaveDocument`, `SyncData`.
- UseCases are `operator fun invoke()` for clean call syntax.
- UseCases only depend on repository interfaces, never on ViewModels or UI.

```kotlin
// GOOD
class GetUserUseCase(private val repository: UserRepository) {
    suspend operator fun invoke(id: String): Result<User> = repository.getUser(id)
}

// Usage in ViewModel
class UserViewModel(private val getUser: GetUserUseCase) : ViewModel() {
    fun load(id: String) = viewModelScope.launch {
        _state.value = getUser(id).fold(
            onSuccess = { UiState.Success(it) },
            onFailure = { UiState.Error(it.message) }
        )
    }
}
```

### Gradle Module Structure by Feature

- Prefer feature modules over single-module monolith for large apps.
- Shared domain/data in `:shared` or `:core` modules; platform UI in feature modules.

```kotlin
// settings.gradle.kts
include(":shared")           // KMP — domain + data
include(":feature:users")    // Android + iOS (expect/actual for UI)
include(":feature:documents")
include(":core:network")     // Ktor setup
include(":core:database")    // SQLDelight setup
include(":androidApp")
include(":iosApp")           // Xcode project

// shared/build.gradle.kts
kotlin {
    androidTarget()
    iosX64(); iosArm64(); iosSimulatorArm64()
    
    sourceSets {
        commonMain.dependencies {
            implementation(libs.ktor.client.core)
            implementation(libs.sqldelight.runtime)
            implementation(libs.koin.core)
        }
        androidMain.dependencies {
            implementation(libs.ktor.client.okhttp)
            implementation(libs.sqldelight.android.driver)
        }
        iosMain.dependencies {
            implementation(libs.ktor.client.darwin)
            implementation(libs.sqldelight.native.driver)
        }
    }
}
```

### Koin Multiplatform Setup

```kotlin
// commonMain — shared modules
val domainModule = module {
    factory { GetUserUseCase(get()) }
    factory { SaveDocumentUseCase(get()) }
}

val dataModule = module {
    single<UserRepository> { UserRepositoryImpl(get(), get()) }
}

// androidMain — platform module
val androidModule = module {
    single<LocalDatabase> { RoomLocalDatabase(get()) }
    viewModel { UserViewModel(get()) }
}

// iosMain — platform module  
val iosModule = module {
    single<LocalDatabase> { SQLiteLocalDatabase(get()) }
}

// Initialization
// Android Application
startKoin {
    modules(domainModule, dataModule, androidModule)
}

// iOS (in Swift)
// KoinKt.doInitKoin(extraModules: [iosModule])
```

## Anti-patterns to detect

- **Platform code in `commonMain`**: `import android.content.Context`, `import UIKit`, or `import java.awt.*` in commonMain. Immediate fail — breaks KMP compilation for non-Android targets.
- **Shared mutable state in `object`**: `object Cache { val items = mutableListOf<Item>() }` in commonMain — not thread-safe on Kotlin/Native (frozen objects).
- **ViewModel in commonMain**: `ViewModel` is an Android class. Use a platform-agnostic state holder or `StateFlow`-based ViewModel alternative in shared code.
- **Circular dependencies**: `domain` importing from `data`, or `feature:users` importing from `feature:documents`. Use dependency inversion.
- **Direct `expect` class instantiation in tests**: Use fakes/stubs instead of `actual` implementations in `commonTest`.
- **Hardcoded platform checks**: `if (Platform.osFamily == OsFamily.IOS)` in shared business logic.
- **DTOs leaking to domain**: Returning `UserDto` from repository instead of mapping to `User` domain model.

## References
- https://kotlinlang.org/docs/multiplatform-intro.html
- https://kotlinlang.org/docs/multiplatform-expect-actual.html
- https://insert-koin.io/docs/reference/koin-mp/kmp
- https://cashapp.github.io/sqldelight/
- https://ktor.io/docs/client-supported-platforms.html
- https://developer.android.com/topic/architecture/intro
