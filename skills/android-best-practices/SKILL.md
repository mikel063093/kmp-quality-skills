# Android Best Practices

## Description
Covers Android-specific best practices for modern apps: ViewModel + StateFlow UiState patterns, type-safe Navigation Compose, Hilt/Koin scoping, lifecycle-aware components, SavedStateHandle, ProGuard setup, edge-to-edge UI, and Material 3 theming.

## Trigger phrases
- "android best practices"
- "review android code"
- "ViewModel StateFlow pattern"
- "navigation compose"
- "android lifecycle"
- "edge to edge android"
- "material 3 theming"
- "hilt koin android"

## Rules & Checks

### ViewModel + StateFlow UiState

- **Use a sealed class for UiState** that models loading/success/error explicitly.

```kotlin
// GOOD — sealed UiState
sealed class UserUiState {
    object Loading : UserUiState()
    data class Success(val user: User) : UserUiState()
    data class Error(val message: String) : UserUiState()
}

// Even better — data class with discriminated state (easier to extend)
data class UserUiState(
    val isLoading: Boolean = false,
    val user: User? = null,
    val error: String? = null
)

class UserViewModel(private val getUser: GetUserUseCase) : ViewModel() {
    private val _uiState = MutableStateFlow(UserUiState(isLoading = true))
    val uiState: StateFlow<UserUiState> = _uiState.asStateFlow()

    fun loadUser(id: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            getUser(id)
                .onSuccess { user -> _uiState.update { it.copy(isLoading = false, user = user) } }
                .onFailure { e -> _uiState.update { it.copy(isLoading = false, error = e.message) } }
        }
    }
}
```

- **Never expose `MutableStateFlow` publicly** — use `.asStateFlow()`.
- **Use `_uiState.update { }` instead of `_uiState.value = `** to avoid race conditions.

### Navigation Compose — Type-Safe Routes

```kotlin
// GOOD — type-safe navigation with serializable routes (Navigation 2.8+)
@Serializable object HomeRoute
@Serializable data class UserDetailRoute(val userId: String)

// NavHost setup
NavHost(navController, startDestination = HomeRoute) {
    composable<HomeRoute> { HomeScreen(navController) }
    composable<UserDetailRoute> { backStack ->
        val route = backStack.toRoute<UserDetailRoute>()
        UserDetailScreen(route.userId)
    }
}

// Navigate
navController.navigate(UserDetailRoute(userId = "123"))

// BAD — string routes with manual argument parsing (error-prone)
navController.navigate("user/123")
composable("user/{userId}") { entry ->
    val userId = entry.arguments?.getString("userId") // manual, unchecked
}
```

- **Pass only IDs through navigation, not full objects.** Large objects can exceed Bundle limits.
- **Handle back navigation with `NavBackHandler` or `BackHandler`**, not manual popBackStack in composables.

### Hilt / Koin Scoping

```kotlin
// Hilt — proper scoping
@HiltViewModel
class UserViewModel @Inject constructor(
    private val getUser: GetUserUseCase,
    savedStateHandle: SavedStateHandle  // auto-injected
) : ViewModel()

// Hilt module
@Module
@InstallIn(SingletonComponent::class)  // app-scoped
object NetworkModule {
    @Provides @Singleton fun provideOkHttpClient(): OkHttpClient = OkHttpClient.Builder().build()
}

@Module
@InstallIn(ViewModelComponent::class)  // ViewModel-scoped
object UseCaseModule {
    @Provides fun provideGetUser(repo: UserRepository) = GetUserUseCase(repo)
}

// Koin scoping
val appModule = module {
    single { OkHttpClient.Builder().build() }    // singleton
    factory { GetUserUseCase(get()) }             // new instance each time
    viewModel { UserViewModel(get(), get()) }     // ViewModel scope
    scope<UserActivity> {                         // activity scope
        scoped { UserActivityHelper(get()) }
    }
}
```

### Lifecycle-Aware Components

- **Collect flows lifecycle-aware.** Use `repeatOnLifecycle` or `collectAsStateWithLifecycle`.

```kotlin
// GOOD — in Fragment/Activity
lifecycleScope.launch {
    repeatOnLifecycle(Lifecycle.State.STARTED) {
        viewModel.uiState.collect { state -> render(state) }
    }
}

// GOOD — in Compose
val state by viewModel.uiState.collectAsStateWithLifecycle()

// BAD — collects even when in background, wastes resources
lifecycleScope.launch {
    viewModel.uiState.collect { render(it) } // doesn't pause when app backgrounds
}
```

### SavedStateHandle

- **Use `SavedStateHandle` for UI state that must survive process death** (not just config changes).

```kotlin
class SearchViewModel(
    savedStateHandle: SavedStateHandle
) : ViewModel() {
    // Automatically saves/restores on process death
    var query by savedStateHandle.saveable { mutableStateOf("") }
    
    // Or for Flow
    val selectedId = savedStateHandle.getStateFlow("selectedId", "")
}
```

### Edge-to-Edge UI

```kotlin
// AndroidManifest.xml — no need to set windowSoftInputMode for modern apps

// Activity.onCreate()
enableEdgeToEdge() // WindowCompat — single call in API 21+

// In Composable — handle insets
Scaffold(
    modifier = Modifier.fillMaxSize(),
    contentWindowInsets = WindowInsets.safeDrawing // pass insets to Scaffold
) { paddingValues ->
    Content(modifier = Modifier.padding(paddingValues))
}

// Or manually
Box(
    modifier = Modifier
        .fillMaxSize()
        .windowInsetsPadding(WindowInsets.systemBars)
)
```

### Material 3 Theming

```kotlin
// Define color scheme from dynamic color or custom palette
val colorScheme = if (Build.VERSION.SDK_INT >= 31 && useDynamicColor) {
    if (darkTheme) dynamicDarkColorScheme(context)
    else dynamicLightColorScheme(context)
} else {
    if (darkTheme) DarkColorScheme else LightColorScheme
}

@Composable
fun AppTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = colorScheme,
        typography = AppTypography,
        shapes = AppShapes,
        content = content
    )
}

// BAD — hardcoded colors
Text(text = "Hello", color = Color(0xFF1A73E8))

// GOOD — use theme colors
Text(text = "Hello", color = MaterialTheme.colorScheme.primary)
```

### ProGuard / R8 Rules

```proguard
# Keep data classes used for JSON serialization
-keep class com.example.app.data.remote.dto.** { *; }

# Keep sealed class hierarchy for Gson/Moshi
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Keep Parcelable
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}

# Koin
-keep class org.koin.** { *; }
```

## Anti-patterns to detect

- **Context stored in ViewModel**: `class MyViewModel(val context: Context)` — leaks Activity context. Use `ApplicationContext` via Hilt `@ApplicationContext` or Koin's `androidContext()`.
- **LiveData in new code**: Prefer `StateFlow`/`SharedFlow` for new code — more powerful, KMP-friendly.
- **`startActivity` without intent flags**: `startActivity(Intent(this, MainActivity::class.java))` — for singleTop or clearing stack, always set flags.
- **Hardcoded strings in composables**: `Text("Submit")` — use `stringResource(R.string.submit)` for l10n.
- **`lifecycleScope.launch` without `repeatOnLifecycle`**: Continues collecting in background state.
- **`getSystemService` in ViewModel**: Get system services via DI (Hilt `@SystemService` or Koin `get()`).
- **Fragment arguments via constructor**: Fragments must have no-arg constructors. Use `newInstance()` factory or Navigation args.
- **Non-`@Stable` data in Compose**: Passing `List<T>` or `Map<K,V>` directly to composables — wrap with `@Immutable`.

## References
- https://developer.android.com/topic/architecture/ui-layer/stateholders
- https://developer.android.com/guide/navigation/design/type-safety
- https://developer.android.com/develop/ui/compose/performance/lifecycle
- https://developer.android.com/develop/ui/compose/designsystems/material3
- https://developer.android.com/develop/ui/views/layout/edge-to-edge
- https://dagger.dev/hilt/
