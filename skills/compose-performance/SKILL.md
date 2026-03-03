# Compose Performance

## Description
Detects and fixes Jetpack Compose performance issues: unnecessary recompositions, unstable types, missing `remember`/`derivedStateOf`, incorrect effect handlers, missing keys in lazy lists, and missing baseline profiles. Ensures composables are optimized for smooth 60/120fps UI.

## Trigger phrases
- "compose is recomposing too much"
- "optimize compose performance"
- "compose stability"
- "recomposition issues"
- "compose performance review"
- "LazyColumn performance"
- "remember vs derivedStateOf"

## Rules & Checks

### Stability System

- **All parameters passed to composables must be stable.** Unstable types cause unnecessary recomposition.
- A type is stable if: it's a primitive, a `String`, or annotated with `@Stable`/`@Immutable`, or all its public properties are stable.

```kotlin
// BAD — List<T> is unstable (mutable), causes recomposition on every parent recomposition
@Composable
fun UserList(users: List<User>) { ... }

// GOOD — use kotlinx.collections.immutable or wrap with @Immutable
@Immutable
data class UserListWrapper(val users: List<User>)

@Composable
fun UserList(users: ImmutableList<User>) { ... }
// or annotate the data class holding the list
```

- **Annotate data classes used in Compose with `@Stable` or `@Immutable`.**

```kotlin
// GOOD — Compose compiler can skip recomposition when state hasn't changed
@Immutable
data class UiState(
    val isLoading: Boolean = false,
    val items: ImmutableList<Item> = persistentListOf(),
    val error: String? = null
)
```

- **Use `@Stable` for classes with observable but controlled mutation** (e.g., state holders).

### remember & derivedStateOf

- **Use `remember` to cache expensive computations across recompositions.**

```kotlin
// BAD — regex compiled on every recomposition
@Composable
fun EmailField(email: String) {
    val isValid = Regex("[a-z]+@[a-z]+\\.[a-z]+").matches(email)
}

// GOOD — cached
@Composable
fun EmailField(email: String) {
    val emailRegex = remember { Regex("[a-z]+@[a-z]+\\.[a-z]+") }
    val isValid = remember(email) { emailRegex.matches(email) }
}
```

- **Use `derivedStateOf` when derived state depends on other state — avoids excess recomposition.**

```kotlin
// BAD — recomposes on every scroll even if firstVisibleItem didn't change threshold
val showButton by remember { derivedStateOf { listState.firstVisibleItemIndex > 0 } }

// GOOD — only recomposes when the boolean result changes
val showScrollToTop by remember {
    derivedStateOf { listState.firstVisibleItemIndex > 5 }
}
```

### Side Effect Handlers

- **`LaunchedEffect(key)`**: For coroutines tied to a composable lifecycle. Relaunches when key changes.
- **`SideEffect`**: For non-suspend side effects that run on every successful recomposition.
- **`DisposableEffect(key)`**: When cleanup is needed (register/unregister listeners).

```kotlin
// BAD — launching coroutine without LaunchedEffect (unsafe, runs in composition)
@Composable
fun Screen(id: String) {
    viewModel.load(id) // called on every recomposition!
}

// GOOD — LaunchedEffect with key
@Composable
fun Screen(id: String, viewModel: ScreenViewModel) {
    LaunchedEffect(id) {
        viewModel.load(id) // runs once per unique id
    }
}

// DisposableEffect — for listeners/callbacks
@Composable
fun LifecycleAwareScreen(lifecycleOwner: LifecycleOwner) {
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event -> ... }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}
```

### LazyColumn / LazyRow Keys

- **Always provide stable `key` for lazy list items.** Without it, Compose can't track item identity and recomposes everything on list change.

```kotlin
// BAD — no key, Compose recomposes all visible items on any list change
LazyColumn {
    items(users) { user ->
        UserRow(user)
    }
}

// GOOD — stable key based on unique identifier
LazyColumn {
    items(users, key = { it.id }) { user ->
        UserRow(user)
    }
}
```

### Lambda Stability in Composables

- **Lambdas referencing non-stable captures trigger recomposition.** Wrap in `remember` or use `rememberUpdatedState`.

```kotlin
// BAD — new lambda instance on every recomposition
@Composable
fun Button(onClick: () -> Unit) {
    // If parent recomposes, new lambda = Button recomposes
}

// Called like:
Button(onClick = { viewModel.doAction() }) // new lambda every time

// GOOD — stable lambda reference
val onClick = remember { { viewModel.doAction() } }
Button(onClick = onClick)
```

### collectAsState with Lifecycle

- **Use `collectAsStateWithLifecycle()` instead of `collectAsState()`** to stop collecting when UI is in background.

```kotlin
// BAD — keeps collecting even when app is in background
val state by viewModel.uiState.collectAsState()

// GOOD — lifecycle-aware collection
val state by viewModel.uiState.collectAsStateWithLifecycle()
```

### Baseline Profiles

- **Create a Baseline Profile for production apps** to pre-compile critical code paths.

```kotlin
// benchmark/src/androidTest/kotlin/BaselineProfileGenerator.kt
@ExperimentalBaselineProfilesApi
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()

    @Test
    fun generate() = rule.collect(packageName = "com.example.app") {
        pressHome()
        startActivityAndWait()
        // navigate critical paths
    }
}
```

## Anti-patterns to detect

- **New object creation in composable body**: `val painter = Painter(...)` without `remember` — creates new object every recomposition.
- **Unstable collections as parameters**: `List<T>`, `Map<K,V>`, `Set<T>` without `@Immutable` wrapper or `ImmutableList`.
- **`collectAsState()` without lifecycle awareness**: Use `collectAsStateWithLifecycle()` from `lifecycle-runtime-compose`.
- **Missing keys in `items()`**: `LazyColumn { items(list) { ... } }` — always add `key = { it.id }`.
- **Side effects in composable body**: Direct API calls, database reads, or coroutine launches not wrapped in `LaunchedEffect`.
- **`CompositionLocal` for frequently-changing values**: `CompositionLocal` is not free — avoid for values that change often.
- **Heavy computation without `remember`**: Sorting, filtering, regex, JSON parsing directly in composable body.
- **Reading `StateFlow.value` in composable**: Use `collectAsStateWithLifecycle()` instead of `flow.value`.

## References
- https://developer.android.com/develop/ui/compose/performance
- https://developer.android.com/develop/ui/compose/performance/stability
- https://developer.android.com/develop/ui/compose/side-effects
- https://developer.android.com/develop/ui/compose/lists
- https://developer.android.com/topic/performance/baselineprofiles/overview
- https://github.com/Kotlin/kotlinx.collections.immutable
