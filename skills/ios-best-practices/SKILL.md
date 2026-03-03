# iOS Best Practices with KMP

## Description
Guides integration of Kotlin Multiplatform with SwiftUI and iOS frameworks. Covers suspend → async/await bridging, Flow → AsyncStream, MainActor for UI thread safety, PDFKit, Vision OCR, Swift Package Manager setup, ARC memory management with KMP objects, and SwiftUI state management patterns.

## Trigger phrases
- "iOS KMP best practices"
- "swift interop KMP"
- "Flow to AsyncStream"
- "suspend function Swift"
- "PDFKit iOS"
- "Vision OCR iOS"
- "MainActor KMP"
- "SwiftUI state management"

## Rules & Checks

### Kotlin suspend → Swift async/await

- **KMP suspend functions are automatically bridged to Swift async functions** when using the default KMP configuration.

```kotlin
// commonMain — KMP
class UserRepository {
    suspend fun getUser(id: String): User = withContext(Dispatchers.IO) {
        api.fetchUser(id)
    }
}
```

```swift
// iOS Swift — auto-bridged
func loadUser(id: String) async {
    do {
        let user = try await repository.getUser(id: id)
        await MainActor.run { self.user = user }
    } catch {
        await MainActor.run { self.error = error.localizedDescription }
    }
}

// In SwiftUI View
.task {
    await viewModel.loadUser(id: userId)
}
```

- **Always dispatch UI updates to `MainActor`** after async calls — KMP coroutines may return on a background thread.

### Flow → AsyncStream / AsyncThrowingStream

```kotlin
// commonMain
class UserRepository {
    val userStream: Flow<User> = flow { /* emit users */ }
}
```

```swift
// GOOD — wrap KMP Flow in AsyncStream for Swift consumption
extension Flow {
    func asAsyncStream<T>() -> AsyncStream<T> {
        AsyncStream { continuation in
            let collector = FlowCollector { value in
                continuation.yield(value as! T)
            }
            // collect on a background thread
            Task {
                do {
                    try await self.collect(collector: collector)
                    continuation.finish()
                } catch {
                    continuation.finish()
                }
            }
        }
    }
}

// Usage
for await user in repository.userStream.asAsyncStream() {
    self.user = user
}

// Or use SKIE library for automatic Flow → AsyncStream bridging
// https://skie.touchlab.co — generates Swift-friendly async code from KMP
```

- **Consider SKIE or KMP-NativeCoroutines** for automatic Kotlin coroutines → Swift async bridging.

### MainActor and Thread Safety

- **Mark SwiftUI ViewModels with `@MainActor`** to ensure all state mutations happen on the main thread.

```swift
// GOOD
@MainActor
class UserViewModel: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    
    private let repository: UserRepository
    
    func loadUser(id: String) async {
        isLoading = true
        defer { isLoading = false }
        do {
            user = try await repository.getUser(id: id)
        } catch {
            // handle
        }
    }
}

// BAD — state mutation from background thread
class UserViewModel: ObservableObject {
    @Published var user: User?
    
    func loadUser(id: String) {
        Task.detached { // detached = no actor, runs on background
            self.user = try await self.repository.getUser(id: id) // main thread violation!
        }
    }
}
```

### PDFKit for PDF Rendering

```swift
import PDFKit

// GOOD — render PDF from Data
func makePDFView(data: Data) -> PDFView {
    let pdfView = PDFView()
    pdfView.document = PDFDocument(data: data)
    pdfView.autoScales = true
    pdfView.displayMode = .singlePageContinuous
    pdfView.displayDirection = .vertical
    return pdfView
}

// SwiftUI wrapper
struct PDFKitView: UIViewRepresentable {
    let data: Data
    
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.document = PDFDocument(data: data)
        view.autoScales = true
        return view
    }
    
    func updateUIView(_ view: PDFView, context: Context) {
        view.document = PDFDocument(data: data)
    }
}
```

### Vision Framework for OCR

```swift
import Vision

// GOOD — async OCR with Vision
func recognizeText(in image: UIImage) async throws -> String {
    guard let cgImage = image.cgImage else { throw OCRError.invalidImage }
    
    return try await withCheckedThrowingContinuation { continuation in
        let request = VNRecognizeTextRequest { request, error in
            if let error = error { continuation.resume(throwing: error); return }
            let text = (request.results as? [VNRecognizedTextObservation])?
                .compactMap { $0.topCandidates(1).first?.string }
                .joined(separator: "\n") ?? ""
            continuation.resume(returning: text)
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        
        let handler = VNImageRequestHandler(cgImage: cgImage)
        try? handler.perform([request])
    }
}
```

### Swift Package Manager Integration

```swift
// Package.swift — consuming KMP framework
.package(url: "https://github.com/yourorg/kmp-shared", from: "1.0.0"),

// Or local XCFramework
// In Xcode: Add Files to project → SharedFramework.xcframework
// Build Phases → Embed Frameworks
```

- **Distribute KMP as XCFramework via SPM** for the cleanest iOS integration.
- **Use `cocoapods` or `XCFramework` for local development**, SPM for distribution.

### SwiftUI State Management

```swift
// @StateObject — ViewModel owned by the view (created once)
struct UserScreen: View {
    @StateObject private var viewModel = UserViewModel()
    // ViewModel lives as long as UserScreen is in the hierarchy
}

// @ObservedObject — ViewModel passed from parent (not owned)
struct UserCard: View {
    @ObservedObject var viewModel: UserViewModel
    // Don't create @ObservedObject here — it will be recreated on every re-render
}

// @EnvironmentObject — ViewModel shared via environment
struct AppRootView: View {
    @StateObject private var appState = AppState()
    var body: some View {
        ContentView().environmentObject(appState)
    }
}

struct DeepChildView: View {
    @EnvironmentObject var appState: AppState // no prop drilling
}
```

### Memory Management with KMP Objects

- **KMP objects on iOS are reference-counted (ARC).** Be careful with retain cycles in closures.

```swift
// BAD — retain cycle with KMP callback
viewModel.observe { [self] state in  // strong capture of self
    self.update(state)
}

// GOOD — weak capture
viewModel.observe { [weak self] state in
    self?.update(state)
}
```

- **KMP's `freezing` model on Kotlin/Native**: In older KMP versions, objects shared across threads were frozen. In K2 with the new memory model, this restriction is lifted — but still avoid mutable shared state.

## Anti-patterns to detect

- **Blocking main thread**: `URLSession.shared.dataTask(with:)` synchronously, or heavy computation in view body. Use `async/await` and `Task {}`.
- **Force unwrap `!`**: `let user = maybeUser!` — use `guard let` or `if let` instead.
- **`NotificationCenter` for data flow**: For state sharing between view models, use `@EnvironmentObject`, `Combine`, or `AsyncStream` instead of `NotificationCenter`.
- **`@ObservedObject` for view-owned ViewModels**: Use `@StateObject` — `@ObservedObject` without external ownership causes ViewModel recreation.
- **Calling KMP suspend functions without `async`**: Wrapping in `DispatchQueue.global().async {}` instead of Swift's native `Task {}`.
- **Missing `MainActor` on ViewModel**: SwiftUI `@Published` mutations must happen on main thread; without `@MainActor`, you get runtime warnings.
- **Ignoring Swift/KMP interop nullability**: KMP `String?` maps to `String?` in Swift — don't force unwrap KMP optional returns.

## References
- https://kotlinlang.org/docs/native-objc-interop.html
- https://skie.touchlab.co
- https://github.com/rickclephas/KMP-NativeCoroutines
- https://developer.apple.com/documentation/pdfkit
- https://developer.apple.com/documentation/vision
- https://developer.apple.com/documentation/swift/concurrency
- https://developer.apple.com/documentation/swiftui/managing-model-data-in-your-app
