# SOLID Principles in Kotlin/KMP

## Description
Applies SOLID design principles to Kotlin and Kotlin Multiplatform code. Detects violations like God-object ViewModels, bloated data classes, monolithic repositories, and missing dependency inversion. Promotes clean, maintainable, testable architecture.

## Trigger phrases
- "apply SOLID to my Kotlin code"
- "check SOLID principles"
- "my ViewModel is too big"
- "refactor repository"
- "dependency inversion Kotlin"
- "SOLID KMP"

## Rules & Checks

### Single Responsibility Principle (SRP)

- **ViewModel must not handle business logic.** Delegate to UseCases/Interactors.

```kotlin
// BAD — ViewModel doing everything
class UserViewModel(private val api: UserApi) : ViewModel() {
    fun loadUser(id: String) {
        viewModelScope.launch {
            val raw = api.fetchUser(id)
            val mapped = UserMapper.map(raw) // mapping here = UI layer knowing about DTO
            _state.value = mapped
        }
    }
}

// GOOD — ViewModel delegates
class UserViewModel(private val getUser: GetUserUseCase) : ViewModel() {
    fun loadUser(id: String) {
        viewModelScope.launch {
            _state.value = getUser(id)
        }
    }
}
```

- **Data classes must represent a single concept.** If a data class has >7 fields from different domains, split it.

```kotlin
// BAD — mixing user profile + auth + UI state
data class UserData(
    val id: String, val name: String, val email: String,
    val token: String, val refreshToken: String,
    val isLoggedIn: Boolean, val profilePicUrl: String,
    val lastLogin: Long, val role: String, val permissions: List<String>
)

// GOOD — separate concerns
data class UserProfile(val id: String, val name: String, val email: String, val profilePicUrl: String)
data class AuthSession(val token: String, val refreshToken: String, val isLoggedIn: Boolean)
```

- **Repository must not contain UI logic, mapping, or business rules.**

### Open/Closed Principle (OCP)

- Use `sealed class` to define extension points without modifying existing code.

```kotlin
// BAD — when you add a new payment type, you modify existing code
fun processPayment(type: String, amount: Double) {
    when (type) {
        "card" -> processCard(amount)
        "paypal" -> processPaypal(amount)
        // every new type = modify this function
    }
}

// GOOD — sealed hierarchy, add new subclass without modifying processor
sealed class Payment {
    data class Card(val number: String, val amount: Double) : Payment()
    data class PayPal(val email: String, val amount: Double) : Payment()
    data class Crypto(val wallet: String, val amount: Double) : Payment() // new = no change needed
}

fun processPayment(payment: Payment) = when (payment) {
    is Payment.Card -> processCard(payment)
    is Payment.PayPal -> processPayPal(payment)
    is Payment.Crypto -> processCrypto(payment)
}
```

### Liskov Substitution Principle (LSP)

- Subclasses must be substitutable for their base types. In KMP, `expect/actual` must honor the contract.

```kotlin
// commonMain
expect class PlatformLogger() {
    fun log(message: String)
}

// androidMain — GOOD: honors contract
actual class PlatformLogger actual constructor() {
    actual fun log(message: String) = android.util.Log.d("APP", message)
}

// BAD: actual throws exception for certain inputs not in expect contract
actual fun log(message: String) {
    if (message.isEmpty()) throw IllegalStateException("nope") // breaks LSP
}
```

- Avoid overriding functions to throw `UnsupportedOperationException` — this breaks LSP.

### Interface Segregation Principle (ISP)

- Split large repository interfaces into focused ones.

```kotlin
// BAD — one giant interface forces all implementors to implement everything
interface UserRepository {
    suspend fun getUser(id: String): User
    suspend fun updateUser(user: User)
    suspend fun deleteUser(id: String)
    suspend fun getUserPosts(id: String): List<Post>
    suspend fun getUserFollowers(id: String): List<User>
    suspend fun sendMessage(userId: String, message: String)
    // 20 more methods...
}

// GOOD — segregated interfaces
interface UserReader { suspend fun getUser(id: String): User }
interface UserWriter { suspend fun updateUser(user: User); suspend fun deleteUser(id: String) }
interface UserSocialReader { suspend fun getUserFollowers(id: String): List<User> }
```

- In KMP, platform-specific interfaces should only expose what each platform needs.

### Dependency Inversion Principle (DIP)

- High-level modules must not depend on low-level modules. Both depend on abstractions.

```kotlin
// BAD — ViewModel depends on concrete Retrofit implementation
class OrderViewModel(private val retrofitService: RetrofitOrderService) : ViewModel()

// GOOD — depends on interface, injected via Koin/Hilt
interface OrderRepository { suspend fun getOrders(): List<Order> }
class OrderViewModel(private val orders: OrderRepository) : ViewModel()

// Koin module wires concrete impl
val orderModule = module {
    single<OrderRepository> { OrderRepositoryImpl(get()) }
    viewModel { OrderViewModel(get()) }
}
```

- In KMP commonMain, never import platform SDKs directly. Use interfaces + `expect/actual` or DI.

## Anti-patterns to detect

- **God ViewModel**: ViewModel with 500+ lines, 10+ injected dependencies, handles navigation, maps DTOs, calls API directly. Split into UseCases + dedicated ViewModels per screen/feature.
- **Blob data class**: `data class` with 15+ fields, some nullable for "optional" use cases. Use sealed class hierarchy or separate models per use case.
- **Monolithic repository**: Repository interface with 30+ methods covering 5 different domains. Violates ISP and SRP simultaneously.
- **Concrete dependencies in domain**: `import retrofit2.*` or `import android.*` inside `commonMain` or domain layer.
- **Override to throw**: `override fun doX() = throw UnsupportedOperationException()` — always breaks LSP.
- **Static/object with everything**: `object AppUtils` with 40 helper functions from different domains.

## References
- https://kotlinlang.org/docs/sealed-classes.html
- https://insert-koin.io/docs/reference/koin-mp/kmp
- https://developer.android.com/topic/architecture
- https://www.raywenderlich.com/21503974-solid-principles-for-android-developers
- https://kotlinlang.org/docs/multiplatform-expect-actual.html
