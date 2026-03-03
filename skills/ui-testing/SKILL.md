# UI Testing — Compose, UiAutomator & XCTest

## Description
Covers UI testing strategies for KMP apps: Compose UI testing with semantics and `waitUntil`, UiAutomator for system UI interactions (file picker, permissions), screenshot testing with Paparazzi/Roborazzi, accessibility testing, Firebase Test Lab setup, and test doubles for navigation.

## Trigger phrases
- "UI testing Compose"
- "Compose test createComposeRule"
- "UiAutomator permissions"
- "screenshot testing android"
- "accessibility testing"
- "Firebase Test Lab"
- "XCTest SwiftUI"

## Rules & Checks

### Compose UI Testing

```kotlin
// build.gradle.kts
androidTestImplementation("androidx.compose.ui:ui-test-junit4")
debugImplementation("androidx.compose.ui:ui-test-manifest")

// Basic test setup
@get:Rule val composeRule = createComposeRule()

@Test
fun userScreen_showsUserName() {
    // Arrange
    composeRule.setContent {
        AppTheme {
            UserScreen(viewModel = FakeUserViewModel(user = testUser))
        }
    }
    
    // Assert
    composeRule.onNodeWithText("Test User").assertIsDisplayed()
    composeRule.onNodeWithContentDescription("Profile picture").assertExists()
}
```

- **Use `testTag` for nodes without natural semantics.**

```kotlin
// In composable
Box(modifier = Modifier.testTag("loading_indicator")) {
    CircularProgressIndicator()
}

// In test
composeRule.onNodeWithTag("loading_indicator").assertIsDisplayed()
```

- **Use `waitUntil` for async UI updates** — don't use `Thread.sleep`.

```kotlin
// GOOD — waits until condition is true (default 1000ms timeout)
@Test
fun userScreen_loadsAndDisplaysUser() {
    composeRule.setContent { UserScreen(viewModel) }
    
    viewModel.loadUser("123")
    
    composeRule.waitUntil(timeoutMillis = 5000) {
        composeRule.onAllNodesWithText("Test User").fetchSemanticsNodes().isNotEmpty()
    }
    
    composeRule.onNodeWithText("Test User").assertIsDisplayed()
}

// BAD
Thread.sleep(2000)
composeRule.onNodeWithText("Test User").assertIsDisplayed()
```

- **Test interactions: click, scroll, input.**

```kotlin
@Test
fun searchScreen_filtersResults() {
    composeRule.setContent { SearchScreen(fakeViewModel) }
    
    composeRule.onNodeWithTag("search_field")
        .performTextInput("Kotlin")
    
    composeRule.onNodeWithText("Kotlin Result 1").assertIsDisplayed()
    composeRule.onNodeWithText("Java Result").assertDoesNotExist()
}

// Scrolling in LazyColumn
@Test
fun list_scrollsToItem() {
    composeRule.onNodeWithTag("items_list")
        .performScrollToIndex(50)
    
    composeRule.onNodeWithText("Item 50").assertIsDisplayed()
}
```

### UiAutomator for System UI

```kotlin
// build.gradle.kts
androidTestImplementation("androidx.test.uiautomator:uiautomator:2.3.0")

// Handle permission dialogs
@Test
fun cameraPermission_isGrantedWhenAllowed() {
    val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    
    // Launch activity that requests camera permission
    launchActivity()
    
    // Wait for permission dialog and accept
    val allowButton = device.wait(
        Until.findObject(By.text("Allow").pkg("com.android.permissioncontroller")),
        5000L
    )
    allowButton?.click()
    
    // Verify permission was granted
    assertTrue(isCameraPermissionGranted())
}

// Handle file picker (Storage Access Framework)
@Test
fun filePicker_selectsPdfFile() {
    val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
    
    launchDocumentPicker() // ACTION_OPEN_DOCUMENT
    
    // Navigate to Downloads
    device.wait(Until.findObject(By.text("Downloads")), 5000L)?.click()
    
    // Select a PDF
    device.wait(Until.findObject(By.text("test.pdf")), 3000L)?.click()
    
    // Verify file was received in activity
    onView(withText("test.pdf")).check(matches(isDisplayed()))
}
```

### Screenshot Testing

```kotlin
// Paparazzi — fast, no emulator needed
class UserCardSnapshotTest {
    @get:Rule val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5,
        theme = "Theme.App"
    )
    
    @Test
    fun userCard_defaultState() {
        paparazzi.snapshot {
            AppTheme {
                UserCard(user = testUser)
            }
        }
    }
    
    @Test
    fun userCard_loadingState() {
        paparazzi.snapshot {
            AppTheme {
                UserCard(user = null, isLoading = true)
            }
        }
    }
}

// Roborazzi — runs on JVM, supports Compose
class RoborazziTest {
    @get:Rule val composeRule = createComposeRule()
    
    @Test
    fun captureUserScreen() {
        composeRule.setContent { UserScreen(fakeViewModel) }
        composeRule.onRoot().captureRoboImage("screenshots/user_screen.png")
    }
}
```

### Accessibility Testing

```kotlin
// Check content descriptions and semantics
@Test
fun allInteractiveElements_haveContentDescriptions() {
    composeRule.setContent { HomeScreen() }
    
    // All images should have content description
    composeRule.onAllNodes(hasContentDescription("").not().and(isImage()))
        .assertCountEquals(0) // no image without description
    
    // All buttons should be accessible
    composeRule.onAllNodes(hasClickAction())
        .assertAll(hasContentDescription("") or hasText(""))
}

// Test with TalkBack semantics
@Test
fun userProfile_semanticsAreCorrect() {
    composeRule.setContent {
        UserProfileCard(user = testUser)
    }
    
    composeRule.onNodeWithContentDescription("Profile picture of Test User")
        .assertExists()
    
    composeRule.onNodeWithText("Test User")
        .assert(hasContentDescription("User name: Test User").or(hasText("Test User")))
}
```

### Firebase Test Lab Setup

```kotlin
// build.gradle.kts
android {
    testOptions {
        managedDevices {
            localDevices {
                create("pixel5api33") {
                    device = "Pixel 5"
                    apiLevel = 33
                    systemImageSource = "google"
                }
            }
            groups {
                create("allDevices") {
                    targetDevices.add(devices["pixel5api33"])
                }
            }
        }
    }
}

// Run locally: ./gradlew pixel5api33DebugAndroidTest
// Run on Firebase Test Lab via CI:
// gcloud firebase test android run \
//   --type instrumentation \
//   --app app-debug.apk \
//   --test app-debug-androidTest.apk \
//   --device model=Pixel5,version=33,locale=en
```

### Test Doubles for Navigation

```kotlin
// Fake NavController for testing navigation actions
class FakeNavController : NavController(context) {
    val navigatedRoutes = mutableListOf<Any>()
    
    override fun <T : Any> navigate(route: T, ...) {
        navigatedRoutes.add(route)
    }
}

@Test
fun onUserTap_navigatesToDetail() {
    val fakeNav = FakeNavController()
    composeRule.setContent {
        UserListScreen(navController = fakeNav, viewModel = fakeViewModel)
    }
    
    composeRule.onNodeWithText("Test User").performClick()
    
    val route = fakeNav.navigatedRoutes.last()
    assertIs<UserDetailRoute>(route)
    assertEquals("user-123", (route as UserDetailRoute).userId)
}
```

### XCTest for iOS

```swift
// SwiftUI + XCTest
class UserScreenUITests: XCTestCase {
    var app: XCUIApplication!
    
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting"] // inject test mode
        app.launch()
    }
    
    func testUserScreen_displaysName() throws {
        let nameLabel = app.staticTexts["Test User"]
        XCTAssertTrue(nameLabel.waitForExistence(timeout: 5))
    }
    
    func testSearch_filtersResults() {
        let searchField = app.searchFields["Search users"]
        searchField.tap()
        searchField.typeText("Kotlin")
        
        XCTAssertTrue(app.staticTexts["Kotlin Developer"].exists)
        XCTAssertFalse(app.staticTexts["Java Developer"].exists)
    }
}
```

## Anti-patterns to detect

- **`Thread.sleep()` in UI tests**: Non-deterministic, slow. Replace with `waitUntil {}` (Compose) or `waitForExistence(timeout:)` (XCTest).
- **Hardcoded delays**: `delay(2000)` or `sleep(2)` in test setup. Use proper wait conditions or `IdlingResource`.
- **Tests depending on execution order**: `@Test fun test2()` assumes `test1()` ran first. Each test must set up its own state — no shared mutable state between tests.
- **Using real ViewModels in Compose tests**: Real ViewModels may start network calls. Use fake ViewModels or inject fake repositories.
- **Asserting on internal state**: `assertEquals(viewModel.internalList.size, 3)` — test via UI assertions, not internal implementation.
- **Snapshot tests without CI comparison**: Taking screenshots but not comparing them on CI — defeats the purpose of screenshot testing.
- **Missing `testTag` on important nodes**: Hard to find dynamically rendered items without tags. Add `Modifier.testTag()` to key components.

## References
- https://developer.android.com/develop/ui/compose/testing
- https://developer.android.com/training/testing/ui-automator
- https://github.com/cashapp/paparazzi
- https://github.com/takahirom/roborazzi
- https://firebase.google.com/docs/test-lab/android/instrumentation-test
- https://developer.apple.com/documentation/xctest
