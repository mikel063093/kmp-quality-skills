# Kotlin Idiomatic Code

## Description
Ensures code uses Kotlin's idiomatic features correctly: scope functions, data classes, sealed classes, extension functions, inline/reified, delegation, and null safety. Replaces Java-style patterns with idiomatic Kotlin equivalents and catches dangerous `!!` usage.

## Trigger phrases
- "make this more Kotlin idiomatic"
- "review Kotlin code style"
- "kotlin idioms"
- "replace Java patterns with Kotlin"
- "scope functions best practices"
- "fix null safety Kotlin"

## Rules & Checks

### Null Safety

- **Never use `!!` unless you can absolutely guarantee non-null with a comment explaining why.**

```kotlin
// BAD
val name = user!!.name

// GOOD
val name = user?.name ?: "Unknown"
// or
val name = user?.name ?: return  // early return in functions
// or
val name = requireNotNull(user) { "user must be set before calling this" }.name
```

- **Use `?.let` for nullable operations instead of null checks.**

```kotlin
// BAD — Java style
if (user != null) {
    println(user.name)
}

// GOOD
user?.let { println(it.name) }
```

- **Prefer `?: return` / `?: throw` for guard clauses.**

```kotlin
// BAD
fun process(id: String?) {
    if (id == null) return
    val user = findUser(id)
    if (user == null) return
    doSomething(user)
}

// GOOD
fun process(id: String?) {
    val user = id?.let { findUser(it) } ?: return
    doSomething(user)
}
```

### Scope Functions (use the right one)

- **`let`**: transform a nullable or chain operations, returns lambda result.
- **`run`**: like `let` but uses `this` — good for object configuration + result.
- **`apply`**: configure an object, returns the object itself. Best for builder patterns.
- **`also`**: side effects (logging, debugging), returns the object. Use for "do this too".
- **`with`**: call multiple methods on a non-nullable object without reassignment.

```kotlin
// let — nullable transformation
val length = str?.let { it.trim().length }

// apply — object initialization
val paint = Paint().apply {
    color = Color.RED
    strokeWidth = 2f
    isAntiAlias = true
}

// also — side effect, chain logging
return fetchUser(id)
    .also { log("Fetched user: ${it.id}") }

// with — multiple operations on same object
with(binding) {
    titleText.text = title
    subtitleText.text = subtitle
    image.load(imageUrl)
}

// BAD — using apply when you need the result (use run instead)
val result = myObject.apply { transform() } // returns myObject, not transform() result
val result = myObject.run { transform() }   // GOOD — returns transform() result
```

### Data Classes

- **Use `copy()` for immutable updates instead of mutating state.**

```kotlin
// BAD — mutable state
var state = UiState(isLoading = false)
state.isLoading = true // can't if data class — but still a sign

// GOOD — immutable copy
data class UiState(val isLoading: Boolean = false, val data: List<Item> = emptyList())
_state.value = _state.value.copy(isLoading = true)
```

- **Don't use data classes for domain entities that have identity semantics.** Use regular classes.

```kotlin
// BAD — User identity should not be based on all fields
data class User(val id: String, val name: String, val email: String)
// Two users with same name/email but different id would be "different" via equals

// GOOD — if identity = id, override equals/hashCode OR use a class
class User(val id: String, val name: String, val email: String) {
    override fun equals(other: Any?) = other is User && id == other.id
    override fun hashCode() = id.hashCode()
}
```

- **Destructuring should be used purposefully.** Avoid positional destructuring of >3 fields.

### Sealed Classes vs Enums

- **Use `sealed class` when variants carry data or have different behavior.**
- **Use `enum class` for simple constants with no data.**

```kotlin
// BAD — enum trying to carry data
enum class Result { SUCCESS, ERROR } // can't carry error message

// GOOD — sealed class for typed results
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
    object Loading : Result<Nothing>()
}

// GOOD — enum for simple flags
enum class Theme { LIGHT, DARK, SYSTEM }
```

### Extension Functions

- **Use extensions to add behavior to third-party or platform classes without inheritance.**

```kotlin
// GOOD — extend String for domain-specific parsing
fun String.toUserId(): UserId = UserId(this.trim().lowercase())

// GOOD — extend Context for brevity
fun Context.showToast(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

// BAD — extension on everything creating implicit dependencies
fun Any.log() = println(this) // avoid extending Any
```

- **Prefer extension functions over utility classes.**

```kotlin
// BAD
object DateUtils {
    fun format(date: Long): String = ...
}

// GOOD
fun Long.toFormattedDate(): String = ...
```

### Inline Functions & Reified

- **Use `inline` for higher-order functions that take lambdas to avoid object allocation.**

```kotlin
// GOOD — inline avoids lambda object creation
inline fun <T> measureTime(block: () -> T): T {
    val start = System.currentTimeMillis()
    return block().also { println("Took: ${System.currentTimeMillis() - start}ms") }
}

// Use reified for type-safe generic operations
inline fun <reified T> Bundle.getParcelable(key: String): T? =
    if (Build.VERSION.SDK_INT >= 33) getParcelable(key, T::class.java)
    else @Suppress("DEPRECATION") getParcelable(key)
```

### Delegation

- **Use `by lazy` for expensive initializations that may not be needed.**

```kotlin
// GOOD — computed only once, only when accessed
private val regex: Regex by lazy { Regex("[A-Z][a-z]+") }
```

- **Use `by viewModels()` / `by activityViewModels()` in Fragments — not manual instantiation.**
- **Use `by map` delegation for property stores (e.g., in ViewModel extras).**

### Type Aliases

- **Use `typealias` for readability on complex types, not as a replacement for real abstractions.**

```kotlin
typealias UserId = String               // simple alias for clarity
typealias UserMap = Map<String, User>   // readable shorthand
typealias ClickHandler = (View) -> Unit // function type alias

// BAD — typealias hiding real abstraction need
typealias Repository = Map<String, Any> // this should be an interface
```

## Anti-patterns to detect

- **`!!` anywhere in non-test code**: Every `!!` is a potential NPE. Flag all usages, require justification.
- **`if (x != null)` instead of `?.`**: Java null-check style. Replace with safe call operator.
- **`var` for state that never changes**: `var name = "Mike"` that's never reassigned. Use `val`.
- **Mutable collections exposed publicly**: `val items: MutableList<Item>` as a public property — expose as `List<Item>`, mutate internally.
- **`object` with mutable state**: `object Repository { var cache = ...}` — singletons with mutable state are hidden global state.
- **Nested `it` lambdas**: Multiple nested lambdas all using `it` — unreadable. Name the parameter.
- **`run {}` at top level just for scoping**: `run { val x = ...; val y = ... }` — use a regular function instead.
- **Using `apply` when `also` fits**: `apply` is for configuring `this`; `also` is for side effects. Don't confuse them.

## References
- https://kotlinlang.org/docs/idioms.html
- https://kotlinlang.org/docs/scope-functions.html
- https://kotlinlang.org/docs/sealed-classes.html
- https://kotlinlang.org/docs/inline-functions.html
- https://kotlinlang.org/docs/delegation.html
- https://kotlinlang.org/docs/type-aliases.html
