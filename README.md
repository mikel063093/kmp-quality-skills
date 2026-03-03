# kmp-quality-skills

> Agent Skills for Kotlin Multiplatform — SOLID, Clean Architecture, Compose performance, Flow/coroutines, local AI, testing and more.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![KMP](https://img.shields.io/badge/Kotlin-Multiplatform-7F52FF?logo=kotlin)](https://kotlinlang.org/docs/multiplatform.html)
[![Android](https://img.shields.io/badge/Android-API%2024+-3DDC84?logo=android)](https://developer.android.com)
[![iOS](https://img.shields.io/badge/iOS-15+-000000?logo=apple)](https://developer.apple.com)

A collection of **Agent Skills** (SKILL.md files) that an AI coding assistant can read to apply Kotlin Multiplatform best practices to your project. Inspired by [web-quality-skills](https://github.com/addyosmani/web-quality-skills) — same concept, built for the KMP ecosystem.

---

## What are Agent Skills?

Each skill is a `SKILL.md` file that contains:
- **Rules and checks** with ✅ good vs ❌ bad code examples
- **Anti-patterns** to detect and flag
- **References** to official documentation

An AI agent (Claude, Copilot, Codex, etc.) reads the relevant SKILL.md before reviewing or writing code, ensuring it applies the right best practices for that specific domain.

---

## Skills

| Skill | Description | Trigger Phrases |
|-------|-------------|-----------------|
| [solid-kotlin](skills/solid-kotlin/SKILL.md) | SOLID principles in Kotlin/KMP — SRP, OCP, LSP, ISP, DIP with Kotlin idioms | "apply SOLID", "my ViewModel is too big" |
| [kotlin-idioms](skills/kotlin-idioms/SKILL.md) | Idiomatic Kotlin: scope functions, data classes, sealed classes, extension fns, delegation | "make this more Kotlin idiomatic", "fix null safety" |
| [kmp-architecture](skills/kmp-architecture/SKILL.md) | Clean Architecture for KMP: commonMain layers, expect/actual vs DI, Koin multiplatform | "structure my KMP project", "clean architecture KMP" |
| [compose-performance](skills/compose-performance/SKILL.md) | Compose optimization: stability, remember, derivedStateOf, effects, lazy keys, baseline profiles | "compose recomposing too much", "optimize compose" |
| [flow-coroutines](skills/flow-coroutines/SKILL.md) | Flow & coroutines: structured concurrency, StateFlow, operators, error handling, Turbine tests | "review coroutines code", "GlobalScope is bad" |
| [android-best-practices](skills/android-best-practices/SKILL.md) | Android: ViewModel+StateFlow UiState, type-safe Navigation, Hilt/Koin, edge-to-edge, M3 | "android best practices", "ViewModel StateFlow pattern" |
| [ios-best-practices](skills/ios-best-practices/SKILL.md) | iOS KMP: Swift interop, suspend→async, Flow→AsyncStream, PDFKit, Vision, MainActor | "iOS KMP best practices", "swift interop KMP" |
| [background-work](skills/background-work/SKILL.md) | WorkManager (Android) + BGTaskScheduler (iOS) with KMP abstraction layer | "background work KMP", "WorkManager best practices" |
| [local-ai](skills/local-ai/SKILL.md) | On-device AI: Gemini Nano, ONNX Runtime, CoreML, 3-tier fallback, model management | "local AI android", "on-device inference" |
| [unit-testing](skills/unit-testing/SKILL.md) | Unit tests: kotlin.test, runTest, fakes vs mocks, ViewModel testing, Turbine | "unit testing KMP", "fake vs mock" |
| [ui-testing](skills/ui-testing/SKILL.md) | UI tests: Compose testing, UiAutomator, screenshot testing, accessibility, Firebase Test Lab | "UI testing Compose", "screenshot testing" |
| [kmp-quality-audit](skills/kmp-quality-audit/SKILL.md) | **Orchestrator** — runs all skills for a full project quality audit with severity report | "audit my KMP project", "full quality review" |

---

## Installation

### Option 1: Copy to your Claude/AI agent skills directory

```bash
# Clone the repo
git clone https://github.com/mikel063093/kmp-quality-skills.git

# Copy all skills to your Claude skills directory
cp -r kmp-quality-skills/skills/* ~/.claude/skills/

# Or copy a single skill
cp -r kmp-quality-skills/skills/compose-performance ~/.claude/skills/
```

### Option 2: Reference directly in your agent's context

Add to your `AGENTS.md` or agent configuration:

```markdown
## KMP Quality Skills
When reviewing Kotlin/KMP code, load the relevant skill from:
https://raw.githubusercontent.com/mikel063093/kmp-quality-skills/main/skills/[skill-name]/SKILL.md
```

### Option 3: Use with OpenClaw

```bash
# Copy skills to OpenClaw workspace
cp -r kmp-quality-skills/skills/* /root/.openclaw/workspace/skills/
```

---

## Usage Examples

### Full Project Audit

```
"Audit my KMP project for quality issues"
→ Agent loads kmp-quality-audit/SKILL.md
→ Runs all 11 sub-skills
→ Returns severity-tagged report with prioritized action items
```

### Targeted Review

```
"Review my Compose screens for performance issues"
→ Agent loads compose-performance/SKILL.md
→ Checks for missing keys, unstable types, incorrect effects

"Check if my coroutines are structured correctly"  
→ Agent loads flow-coroutines/SKILL.md
→ Flags GlobalScope, missing error handling, wrong operators
```

### Architecture Review

```
"Does my KMP module structure follow Clean Architecture?"
→ Agent loads kmp-architecture/SKILL.md
→ Checks layer separation, expect/actual usage, Koin setup
```

---

## Coverage

| Platform | Coverage |
|----------|----------|
| Android (API 24+) | ✅ Full |
| iOS (15+) | ✅ Full |
| Kotlin/JVM (Desktop) | ✅ Partial (architecture + idioms) |
| Kotlin/WASM | 🔄 Planned |

| Topic | Skill |
|-------|-------|
| Architecture | kmp-architecture |
| Code Quality | solid-kotlin, kotlin-idioms |
| UI Performance | compose-performance |
| Async | flow-coroutines |
| Platform | android-best-practices, ios-best-practices |
| Background | background-work |
| AI/ML | local-ai |
| Testing | unit-testing, ui-testing |

---

## Contributing

Contributions welcome! Each skill should follow the format in [SKILL_TEMPLATE.md](SKILL_TEMPLATE.md).

- Open an issue for missing skills or incorrect patterns
- PRs for new skills, updated code examples (Kotlin 2.x, Compose 1.7+), or corrections
- Keep examples short and runnable

---

## License

MIT — free to use, modify, and distribute.

---

*Built for the KMP community. If this helped your project, star it and share with your team.*
