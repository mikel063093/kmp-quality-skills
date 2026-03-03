# Flow & Coroutines

## Description
Audits coroutines and Flow usage for correctness, safety, and efficiency. Covers structured concurrency, proper scope usage, `SupervisorJob`, Flow operators, `StateFlow` vs `SharedFlow`, cold vs hot flows, error handling, and testing with Turbine. Flags dangerous patterns like `GlobalScope` and fire-and-forget.

## Trigger phrases
- "review coroutines code"
- "flow coroutines best practices"
- "structured concurrency"
- "GlobalScope is bad"
- "StateFlow vs SharedFlow"
- "testing coroutines"
- "coroutine error handling"

## Rules & Checks

### Structured Concurrency

- **Never use `GlobalScope`**. It has no lifecycle, leaks on Activity/ViewModel destruction.

```kotlin
// BAD — no lifecycle, no cancellation, leaks
GlobalScope.launch { fetchData() }

// GOOD — use viewModelScope (auto-cancelled on ViewModel cleared)
viewModelScope.launch { fetchData() }

// GOOD — in repository/domain, inject CoroutineScope
class SyncRepository(
    private val scope: CoroutineScope, // injected, tied to app lifecycle
    private val api: ApiService
) {
    fun startSync() = scope.launch { api.sync() }
}
```

- **Always launch coroutines in a scope that mirrors component lifecycle.**
  - `viewModelScope` → ViewModel
  - `lifecycleScope` → Activity/Fragment
  - Custom `CoroutineScope(SupervisorJob() + Dispatchers.Default)` → injected into repositories

### SupervisorJob vs Job

- **Use `SupervisorJob` in parent scopes where child failures should not cancel siblings.**

```kotlin
// BAD — one child failure cancels all other children
val scope = CoroutineScope(Job() + Dispatchers.IO)
scope.launch { fetchUsers() }   // if this throws, cancels fetchProducts too
scope.launch { fetchProducts() }

// GOOD — independent child lifecycles
val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
scope.launch { fetchUsers() }   // failure here doesn't affect fetchProducts
scope.launch { fetchProducts() }
```

- **`viewModelScope` already uses `SupervisorJob` — you don't need to add it.**

### Dispatchers

```kotlin
// Dispatchers.Main    → UI updates, observing state
// Dispatchers.IO      → network, disk, database
// Dispatchers.Default → CPU-intensive work (parsing, sorting, crypto)
// Dispatchers.Unconfined → avoid in production

// GOOD — switch dispatchers with withContext
suspend fun processDocument(bytes: ByteArray): Document = withContext(Dispatchers.Default) {
    parseBytes(bytes) // CPU work off Main thread
}

// BAD — blocking the main thread
suspend fun loadImage(): Bitmap = loadBitmapFromDisk() // no withContext = runs on caller's dispatcher
```

### Flow: Cold vs Hot

- **Cold flow**: starts when collected, no value before collection (regular `flow {}`, `channelFlow`).
- **Hot flow**: active regardless of collectors (`StateFlow`, `SharedFlow`, `MutableStateFlow`).

```kotlin
// Cold flow — new execution per collector
val cold = flow {
    println("starting") // prints for EACH collector
    emit(fetchData())
}

// Hot flow — one execution, multiple collectors share
val hot = MutableStateFlow<List<Item>>(emptyList())
```

### StateFlow vs SharedFlow

- **`StateFlow`**: has initial value, replays last value to new collectors, for UI state.
- **`SharedFlow`**: no initial value, configurable replay, for events.

```kotlin
// StateFlow for UI state
private val _uiState = MutableStateFlow(UiState())
val uiState: StateFlow<UiState> = _uiState.asStateFlow()

// SharedFlow for one-time events (navigation, snackbar)
private val _events = MutableSharedFlow<UiEvent>()
val events: SharedFlow<UiEvent> = _events.asSharedFlow()

fun showError(msg: String) {
    viewModelScope.launch { _events.emit(UiEvent.ShowError(msg)) }
}
```

### Flow Operators

```kotlin
// map — transform each emission
flow.map { user -> user.toUiModel() }

// filter — keep matching items
flow.filter { it.isActive }

// flatMapLatest — cancel previous when new value arrives (search queries)
searchQuery
    .debounce(300)
    .flatMapLatest { query -> repository.search(query) }

// combine — merge two flows
combine(usersFlow, filtersFlow) { users, filters ->
    users.filter { filters.matches(it) }
}

// debounce — wait for input to settle
textInput.debounce(300).collect { query -> search(query) }

// distinctUntilChanged — skip duplicate emissions
stateFlow.distinctUntilChanged().collect { ... }

// catch — handle errors inline
flow.catch { e -> emit(emptyList()) }

// onEach — side effects without consuming
flow.onEach { log("Received: $it") }.collect { process(it) }
```

### Error Handling

- **Always handle exceptions in coroutines.** Uncaught exceptions crash the coroutine and can crash the app.

```kotlin
// BAD — no error handling
viewModelScope.launch {
    val data = api.fetch() // throws = ViewModel scope crashes
    _state.value = data
}

// GOOD — try/catch or runCatching
viewModelScope.launch {
    _state.value = UiState(isLoading = true)
    runCatching { api.fetch() }
        .onSuccess { _state.value = UiState(data = it) }
        .onFailure { _state.value = UiState(error = it.message) }
}

// GOOD — CoroutineExceptionHandler for scope-level handling
val handler = CoroutineExceptionHandler { _, throwable ->
    _state.value = UiState(error = throwable.message)
}
viewModelScope.launch(handler) { ... }
```

- **In flows, use `.catch {}` operator for error handling in pipelines.**

```kotlin
repository.getDataStream()
    .catch { e -> emit(DataState.Error(e)) }
    .collect { _state.value = it }
```

### Testing Coroutines

```kotlin
// Use runTest from kotlinx-coroutines-test
@Test
fun `loads user correctly`() = runTest {
    val fakeRepo = FakeUserRepository()
    val vm = UserViewModel(GetUserUseCase(fakeRepo))
    
    vm.loadUser("123")
    
    advanceUntilIdle() // process all pending coroutines
    assertEquals(UiState.Success(fakeUser), vm.uiState.value)
}

// Use Turbine for Flow testing
@Test
fun `emits loading then success`() = runTest {
    viewModel.uiState.test {
        assertEquals(UiState.Loading, awaitItem())
        viewModel.load("123")
        assertEquals(UiState.Success(fakeUser), awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

## Anti-patterns to detect

- **`GlobalScope.launch`**: No lifecycle, no cancellation. Always use a scoped alternative.
- **`Thread.sleep()` in coroutines**: Use `delay()` instead — `Thread.sleep` blocks the thread.
- **`runBlocking` in production code** (not tests): Blocks the calling thread, defeats coroutines' purpose.
- **`.value` instead of `collect`**: `stateFlow.value` in a non-snapshot context misses updates. Use `collect`/`collectAsState`.
- **Fire-and-forget without error handling**: `scope.launch { dangerousOperation() }` with no try/catch or handler.
- **Blocking I/O on `Dispatchers.Main`**: Network or disk calls without `withContext(Dispatchers.IO)`.
- **`flow {}` with mutable external state**: Emitting from mutable shared state in cold flow = race condition.
- **`SharedFlow` for UI state**: Use `StateFlow` for state (it has initial value and replays); `SharedFlow` for events.
- **`conflate()` when you need every emission**: `conflate()` drops intermediary values — only use if latest-only is acceptable.

## References
- https://kotlinlang.org/docs/coroutines-overview.html
- https://kotlinlang.org/docs/flow.html
- https://developer.android.com/kotlin/coroutines/coroutines-best-practices
- https://github.com/cashapp/turbine
- https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-test/
