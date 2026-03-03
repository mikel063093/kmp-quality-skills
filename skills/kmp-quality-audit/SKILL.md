# KMP Quality Audit — Orchestrator

## Description
Master skill that orchestrates a full quality audit of a Kotlin Multiplatform project. Activates all domain-specific skills in sequence, generates a comprehensive quality report with findings by severity (critical/warning/info), and provides prioritized action items. Covers architecture, code style, performance, testing, and platform-specific concerns.

## Trigger phrases
- "audit my KMP project"
- "full quality review"
- "kmp quality check"
- "review my kotlin multiplatform app"
- "code quality audit"
- "what's wrong with my KMP code"

## Rules & Checks

### Audit Sequence

When triggered, run checks in this order (highest to lowest impact):

1. **Architecture Audit** → Load `kmp-architecture` skill
2. **SOLID Principles** → Load `solid-kotlin` skill
3. **Kotlin Idioms** → Load `kotlin-idioms` skill
4. **Compose Performance** → Load `compose-performance` skill (if Compose is used)
5. **Flow & Coroutines** → Load `flow-coroutines` skill
6. **Android Best Practices** → Load `android-best-practices` skill
7. **iOS Best Practices** → Load `ios-best-practices` skill (if iOS target present)
8. **Background Work** → Load `background-work` skill (if workers present)
9. **Local AI** → Load `local-ai` skill (if ML/AI features present)
10. **Unit Testing** → Load `unit-testing` skill
11. **UI Testing** → Load `ui-testing` skill

### Report Format

```
# KMP Quality Audit Report
Date: [date]
Project: [project name]

## Summary
| Category           | Critical | Warning | Info |
|--------------------|----------|---------|------|
| Architecture       | 0        | 2       | 3    |
| SOLID              | 1        | 1       | 2    |
| Kotlin Idioms      | 0        | 3       | 5    |
| Compose Perf       | 2        | 4       | 1    |
| Flow/Coroutines    | 1        | 2       | 0    |
| Android            | 0        | 2       | 3    |
| iOS                | 0        | 1       | 2    |
| Background Work    | 0        | 1       | 1    |
| Local AI           | 0        | 0       | 2    |
| Unit Testing       | 1        | 3       | 2    |
| UI Testing         | 0        | 2       | 1    |
| **TOTAL**          | **5**    | **21**  | **22** |

## Critical Issues (fix before release)
[List with file:line and fix suggestion]

## Warnings (fix in next sprint)
[List with file:line and fix suggestion]

## Info (consider for improvement)
[List with notes]

## Prioritized Action Items
1. [Most impactful fix]
2. ...
```

### Quick Checks by File Pattern

When scanning a project, use these quick heuristics:

#### `commonMain` files — check for:
- `import android.*` or `import UIKit` (critical: platform code in shared)
- `GlobalScope` usage (critical)
- `!!` operator (warning: potential NPE)
- `var` for state that could be `val` (info)
- Missing `@Immutable`/`@Stable` on data classes used in Compose

#### ViewModel files — check for:
- Class line count > 200 (warning: SRP violation)
- Direct API/repository calls without UseCase (warning)
- `MutableStateFlow` exposed publicly (warning)
- `context` stored as property (critical: leak)
- Missing `viewModelScope` for coroutines (critical)

#### Repository files — check for:
- Methods > 10 per interface (warning: ISP violation)
- Platform types in return signatures (warning)
- Missing `Result<T>` wrapping (info: error handling)

#### Test files — check for:
- `Thread.sleep` (warning)
- `mockk<>` overuse — count mocked classes vs fakes (info)
- Missing `runTest` for suspend functions (critical)
- Test names like `test1`, `testGetUser` (info)

#### Compose files — check for:
- `collectAsState()` instead of `collectAsStateWithLifecycle()` (warning)
- `LazyColumn { items(list) {} }` without `key` param (warning)
- `new` objects created without `remember` (warning)
- `LaunchedEffect` without key (critical: runs on every recomposition)

#### Worker files (Android) — check for:
- `Worker` instead of `CoroutineWorker` (info: consider migration)
- Missing retry logic (info)
- `workManager.enqueue()` without unique work (warning)

### Severity Definitions

| Severity | Definition | Example |
|----------|------------|---------|
| **Critical** | Causes crashes, data loss, security issues, or compile failures | `GlobalScope`, platform import in commonMain, NPE risk |
| **Warning** | Code smell that impacts maintainability, performance, or correctness | Missing `key` in LazyColumn, God ViewModel |
| **Info** | Improvement opportunity, style, or minor optimization | Test naming, `var` → `val`, missing typealias |

### Automated Detection Patterns (regex/grep)

```bash
# Critical: Platform code in commonMain
grep -rn "import android\." src/commonMain/
grep -rn "import UIKit" src/commonMain/
grep -rn "import java\.awt" src/commonMain/

# Critical: GlobalScope
grep -rn "GlobalScope\." src/

# Critical: Force unwrap NPE risk
grep -rn "!!" src/main/ --include="*.kt" | grep -v "test"

# Warning: collectAsState without lifecycle
grep -rn "\.collectAsState()" src/ --include="*.kt"

# Warning: Missing key in LazyColumn
grep -rn "items(.*) {" src/ --include="*.kt" | grep -v "key ="

# Warning: Context in ViewModel
grep -rn "class.*ViewModel.*Context" src/ --include="*.kt"

# Info: Thread.sleep in tests
grep -rn "Thread\.sleep" src/test/ src/androidTest/ --include="*.kt"
```

### Suggested Sprint Priority

**Sprint 1 (Critical):**
- Fix all platform code in commonMain
- Remove all GlobalScope usages
- Fix Context leaks in ViewModels
- Add missing runTest wrappers in tests

**Sprint 2 (High-impact warnings):**
- Add keys to all LazyColumn items
- Switch collectAsState → collectAsStateWithLifecycle
- Break down God ViewModels
- Replace direct API calls with UseCases

**Sprint 3 (Code quality):**
- Reduce !! usages
- Apply @Immutable/@Stable annotations
- Add fakes for mockk-heavy tests
- Add missing test coverage for critical paths

## Anti-patterns to detect

*(See individual skill files for domain-specific anti-patterns. This skill surfaces the top cross-cutting ones.)*

- **No tests at all**: A KMP project with 0 test files is audit-critical. At minimum, UseCases and ViewModels must be tested.
- **Single-module monolith >50k LOC**: Should be split into feature modules. Navigation, compilation speed, and team scalability all suffer.
- **No CI/CD**: Without automated checks, quality degrades over time. At minimum: `./gradlew build test` on every PR.
- **Mixed layer responsibilities throughout**: If every file does networking + business logic + UI logic, the project needs an architecture intervention.

## References
- https://kotlinlang.org/docs/multiplatform.html
- https://developer.android.com/topic/architecture
- https://developer.android.com/develop/ui/compose/performance
- https://github.com/mikel063093/kmp-quality-skills (this repo — all skills)
