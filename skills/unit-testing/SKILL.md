# Unit Testing in KMP

## Description
Guides writing effective unit tests for Kotlin Multiplatform projects using `kotlin.test`, `kotlinx-coroutines-test`, and Turbine. Covers testing ViewModels with StateFlow, UseCases, repositories with fakes, coroutine testing with `runTest`/`advanceUntilIdle`, fake vs mock philosophy, and test naming conventions.

## Trigger phrases
- "unit testing KMP"
- "test coroutines kotlin"
- "fake vs mock"
- "runTest advanceUntilIdle"
- "test ViewModel StateFlow"
- "kotlin.test multiplatform"
- "testing best practices KMP"

## Rules & Checks

### kotlin.test — Multiplatform Test Framework

- **Use `kotlin.test` for all assertions** — it's KMP-compatible and works on JVM, Android, Native, JS.

```kotlin
// build.gradle.kts (commonTest)
sourceSets {
    commonTest.dependencies {
        implementation(kotlin("test"))
        implementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.0")
        implementation("app.cash.turbine:turbine:1.1.0")
    }
}

// Test class
import kotlin.test.*

class UserUseCaseTest {
    @Test
    fun `returns user when found`() {
        val fakeRepo = FakeUserRepository()
        fakeRepo.setUsers(listOf(testUser))
        val useCase = GetUserUseCase(fakeRepo)
        // ...
    }
}
```

### Testing Coroutines

```kotlin
// runTest — replaces GlobalScope, controls virtual time
@Test
fun `loads user on init`() = runTest {
    val fakeRepo = FakeUserRepository(user = testUser)
    val viewModel = UserViewModel(GetUserUseCase(fakeRepo))
    
    viewModel.loadUser("123")
    advanceUntilIdle()  // processes all pending coroutines
    
    assertEquals(UserUiState(user = testUser), viewModel.uiState.value)
}

// TestCoroutineScheduler for precise time control
@Test
fun `debounce search waits 300ms`() = runTest {
    val vm = SearchViewModel(searchUseCase, backgroundScope)
    
    vm.onQueryChange("Ko")
    vm.onQueryChange("Kot")
    vm.onQueryChange("Kotl")
    
    advanceTimeBy(299) // before debounce fires
    assertEquals(0, fakeSearch.callCount)
    
    advanceTimeBy(1) // at 300ms
    assertEquals(1, fakeSearch.callCount)
    assertEquals("Kotl", fakeSearch.lastQuery)
}

// Testing with delay
@Test
fun `shows loading then result`() = runTest {
    val fakeRepo = FakeUserRepository(delay = 1000)
    val vm = UserViewModel(GetUserUseCase(fakeRepo))
    
    vm.loadUser("123")
    
    assertEquals(true, vm.uiState.value.isLoading)
    advanceTimeBy(1001)
    assertEquals(false, vm.uiState.value.isLoading)
    assertNotNull(vm.uiState.value.user)
}
```

### Fake vs Mock Philosophy

- **Prefer fakes over mocks.** Fakes are real implementations with in-memory behavior; mocks verify interactions.
- Mocks couple tests to implementation details. Fakes test behavior.

```kotlin
// GOOD — Fake implementation
class FakeUserRepository : UserRepository {
    private val users = mutableMapOf<String, User>()
    var saveCallCount = 0
    
    fun givenUser(user: User) { users[user.id] = user }
    
    override suspend fun getUser(id: String): Result<User> {
        return users[id]?.let { Result.success(it) }
            ?: Result.failure(UserNotFoundException(id))
    }
    
    override suspend fun saveUser(user: User): Result<Unit> {
        saveCallCount++
        users[user.id] = user
        return Result.success(Unit)
    }
}

// BAD — excessive mocking
@Test
fun `test with mockk`() {
    val mockRepo = mockk<UserRepository>()
    every { mockRepo.getUser("123") } returns User("123", "Mike")
    // Couples test to exact method call — breaks on internal refactor
}
```

- **When to use mocks**: Verifying interactions with external systems (analytics, logging) where you want to assert "was this called with these args?".

### Testing ViewModels with StateFlow

```kotlin
@Test
fun `uiState emits loading then success`() = runTest {
    val vm = UserViewModel(GetUserUseCase(FakeUserRepository(user = testUser)))
    
    // Use Turbine for flow testing
    vm.uiState.test {
        val initial = awaitItem()
        assertEquals(UserUiState(), initial)
        
        vm.loadUser("123")
        
        val loading = awaitItem()
        assertTrue(loading.isLoading)
        
        val success = awaitItem()
        assertFalse(success.isLoading)
        assertEquals(testUser, success.user)
        
        cancelAndIgnoreRemainingEvents()
    }
}
```

### Testing UseCases

```kotlin
// UseCases are pure functions — easy to test
class GetUserUseCaseTest {
    private val fakeRepo = FakeUserRepository()
    private val useCase = GetUserUseCase(fakeRepo)
    
    @Test
    fun `returns success when user exists`() = runTest {
        fakeRepo.givenUser(testUser)
        
        val result = useCase("123")
        
        assertTrue(result.isSuccess)
        assertEquals(testUser, result.getOrNull())
    }
    
    @Test
    fun `returns failure when user not found`() = runTest {
        val result = useCase("nonexistent")
        
        assertTrue(result.isFailure)
        assertIs<UserNotFoundException>(result.exceptionOrNull())
    }
}
```

### Test Naming Conventions

```kotlin
// GOOD — descriptive, behavior-focused names (backtick format)
@Test fun `returns empty list when no items match filter`()
@Test fun `emits error when network is unavailable`()
@Test fun `loads user on first launch`()

// BAD — vague, implementation-focused
@Test fun testGetUser()
@Test fun test1()
@Test fun getUserSuccess()
```

- Follow **Given/When/Then** or **should + behavior** naming patterns.
- Test names should read like documentation.

### Fake Data Builders

```kotlin
// Test data builders for clean test setup
fun testUser(
    id: String = "user-123",
    name: String = "Test User",
    email: String = "test@example.com"
) = User(id = id, name = name, email = email)

// Usage
@Test
fun `updates user name`() = runTest {
    val user = testUser(name = "Old Name")
    fakeRepo.givenUser(user)
    
    viewModel.updateName("123", "New Name")
    advanceUntilIdle()
    
    val saved = fakeRepo.getUser("123").getOrThrow()
    assertEquals("New Name", saved.name)
}
```

### Coverage Philosophy

- **Aim for meaningful coverage, not a number.** 80% of tests covering the right things beats 95% coverage of getters/setters.
- **Test public behavior, not private methods.**
- **Critical paths must be tested**: authentication, payments, data persistence.
- **Don't add `@VisibleForTesting`** to expose private implementation — refactor instead.

## Anti-patterns to detect

- **`mockk` for everything**: Overuse of MockK creates brittle tests that break on internal refactor. Use fakes for repositories and data sources.
- **`Thread.sleep()` in tests**: Use `advanceTimeBy()`/`advanceUntilIdle()` with `runTest` instead.
- **`@VisibleForTesting` in production code**: Sign of design problem. Refactor to test via public API or extract the logic.
- **Testing implementation details**: `verify { repo.getUser(any()) }` — tests that `getUser` was called, not that behavior is correct. Test outcomes, not interactions.
- **Flaky tests with real timers/network**: All tests must be deterministic. Use fakes for network, `TestCoroutineScheduler` for time.
- **One giant test class**: Split test classes by component/behavior, not by file.
- **Missing `cancelAndIgnoreRemainingEvents()`**: In Turbine tests, not cancelling leaves unconsumed items and can cause test hangs.
- **Asserting on exact string error messages**: `assertEquals("User not found", error.message)` — fragile. Assert on type or error code.

## References
- https://kotlinlang.org/api/latest/kotlin.test/
- https://kotlinlang.org/docs/multiplatform-run-tests.html
- https://kotlinlang.org/api/kotlinx.coroutines/kotlinx-coroutines-test/
- https://github.com/cashapp/turbine
- https://developer.android.com/training/testing/local-tests
