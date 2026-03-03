# Local AI — On-Device Inference for Android & iOS

## Description
Guides implementation of on-device AI inference using Gemini Nano (Android), ONNX Runtime (Android/KMP), CoreML and Vision framework (iOS). Covers model management, execution provider selection, INT4 quantization, 3-tier fallback strategy (device → on-device model → cloud), model warm-up, and inference profiling.

## Trigger phrases
- "local AI android"
- "on-device inference"
- "Gemini Nano integration"
- "ONNX Runtime Android"
- "CoreML iOS"
- "local LLM mobile"
- "on-device model KMP"
- "offline AI"

## Rules & Checks

### Gemini Nano via ML Kit (Android)

- **Detect availability via `ClassNotFoundException`** — Gemini Nano is not on all devices.

```kotlin
// GOOD — feature detection, graceful fallback
suspend fun isGeminiNanoAvailable(): Boolean {
    return try {
        Class.forName("com.google.android.gms.ai.model.DownloadConfig")
        val config = GenerativeModel("gemini-nano")
        val status = config.checkAvailability()
        status == AvailabilityStatus.AVAILABLE
    } catch (e: ClassNotFoundException) {
        false // Google Play Services AI not available on this device
    }
}

// Setup
val model = GenerativeModel(
    modelName = "gemini-nano",
    generationConfig = generationConfig {
        maxOutputTokens = 512
        temperature = 0.7f
    }
)

// Inference with streaming
model.generateContentStream("Summarize: $text").collect { chunk ->
    _summary.update { it + chunk.text.orEmpty() }
}
```

- **Always call `checkAvailability()` and trigger download if needed** before first use.
- **Gemini Nano is for on-device, short-context tasks** — not for large document processing.

### ONNX Runtime Android

```kotlin
// build.gradle.kts
implementation("com.microsoft.onnxruntime:onnxruntime-android:1.17.0")
// For GPU/NNAPI:
implementation("com.microsoft.onnxruntime:onnxruntime-android:1.17.0") // includes NNAPI EP

// Execution Provider selection
class OrtInferenceEngine(private val context: Context) {
    private lateinit var session: OrtSession
    private val env = OrtEnvironment.getEnvironment()
    
    fun initialize(modelPath: String) {
        val options = OrtSession.SessionOptions().apply {
            // Priority: QNN (Snapdragon) → NNAPI → CPU
            addQnn(mapOf("backend_path" to "libQnnHtp.so"))  // Qualcomm AI Engine
                .onFailure { addNnapi() }                    // Android Neural Networks API
                .onFailure { /* CPU fallback is automatic */ }
            
            // INT4 quantized model for 4x smaller, ~same accuracy
            setIntraOpNumThreads(4)
            setInterOpNumThreads(2)
            addConfigEntry("session.disable_prepacking", "0") // enable weight prepacking
        }
        
        val modelBytes = context.assets.open(modelPath).readBytes()
        session = env.createSession(modelBytes, options)
    }
    
    suspend fun runInference(input: FloatArray): FloatArray = withContext(Dispatchers.Default) {
        val tensor = OnnxTensor.createTensor(env, arrayOf(input), longArrayOf(1, input.size.toLong()))
        val output = session.run(mapOf("input" to tensor))
        (output[0].value as Array<FloatArray>)[0]
    }
    
    fun close() = session.close()
}
```

- **Prefer INT4/INT8 quantized models** — 4x smaller, 2-4x faster on mobile hardware.
- **Use `withContext(Dispatchers.Default)`** for inference — CPU-intensive, off main thread.
- **Model warm-up on app start**: Run one dummy inference to initialize execution providers.

```kotlin
// Warm-up
suspend fun warmUp() = withContext(Dispatchers.Default) {
    val dummyInput = FloatArray(modelInputSize) { 0f }
    runInference(dummyInput) // discard result — just warm up JIT/NNAPI
}
```

### CoreML on iOS

```swift
import CoreML
import Vision

// GOOD — async CoreML inference
class LocalMLModel {
    private var model: VNCoreMLModel?
    
    func load(modelName: String) throws {
        guard let url = Bundle.main.url(forResource: modelName, withExtension: "mlmodelc") else {
            throw ModelError.notFound
        }
        let config = MLModelConfiguration()
        config.computeUnits = .cpuAndNeuralEngine  // use Apple Neural Engine when available
        let mlModel = try MLModel(contentsOf: url, configuration: config)
        model = try VNCoreMLModel(for: mlModel)
    }
    
    func classify(image: CGImage) async throws -> [VNClassificationObservation] {
        guard let model = model else { throw ModelError.notLoaded }
        
        return try await withCheckedThrowingContinuation { continuation in
            let request = VNCoreMLRequest(model: model) { request, error in
                if let error = error { continuation.resume(throwing: error); return }
                let observations = request.results as? [VNClassificationObservation] ?? []
                continuation.resume(returning: observations)
            }
            request.imageCropAndScaleOption = .centerCrop
            
            let handler = VNImageRequestHandler(cgImage: image, options: [:])
            try? handler.perform([request])
        }
    }
}
```

- **Use `cpuAndNeuralEngine` compute units** to automatically use ANE when available (iPhone 8+, iPad 2018+).
- **Compile `.mlmodel` to `.mlmodelc`** at build time — faster load, included in app bundle.

### 3-Tier Fallback Strategy

```kotlin
// commonMain
class IntelligentProcessor(
    private val deviceCapabilities: DeviceCapabilities,
    private val localModel: LocalInferenceEngine?,
    private val cloudApi: CloudAIService
) {
    suspend fun process(input: String): String {
        // Tier 1: On-device native (Gemini Nano, CoreML)
        if (deviceCapabilities.hasGeminiNano()) {
            runCatching { deviceNativeInfer(input) }
                .onSuccess { return it }
        }
        
        // Tier 2: Bundled/downloaded model (ONNX, TFLite)
        if (localModel?.isLoaded == true) {
            runCatching { localModel.infer(input) }
                .onSuccess { return it }
        }
        
        // Tier 3: Cloud API (requires network)
        return cloudApi.process(input)
    }
}
```

### On-Device Model Management

```kotlin
// Model versioning and storage
class ModelManager(private val context: Context) {
    private val modelDir = File(context.filesDir, "models")
    
    suspend fun ensureModel(modelId: String, version: String, downloadUrl: String) {
        val modelFile = File(modelDir, "$modelId-$version.onnx")
        if (!modelFile.exists()) {
            downloadModel(downloadUrl, modelFile)
            cleanOldVersions(modelId, version) // delete old versions
        }
    }
    
    private fun cleanOldVersions(modelId: String, currentVersion: String) {
        modelDir.listFiles { file ->
            file.name.startsWith(modelId) && !file.name.contains(currentVersion)
        }?.forEach { it.delete() }
    }
    
    // Release model when not needed
    fun unloadModel(engine: OrtInferenceEngine) {
        engine.close()
        System.gc() // hint to release ONNX native memory
    }
}
```

### Inference Profiling

```kotlin
// Profile inference time
suspend fun profileInference(engine: OrtInferenceEngine, runs: Int = 10): InferenceProfile {
    val times = mutableListOf<Long>()
    val testInput = FloatArray(modelInputSize) { Random.nextFloat() }
    
    repeat(runs) {
        val start = System.nanoTime()
        engine.runInference(testInput)
        times.add(System.nanoTime() - start)
    }
    
    return InferenceProfile(
        avgMs = times.drop(1).average() / 1_000_000,  // skip warm-up run
        p95Ms = times.sorted()[((runs - 1) * 0.95).toInt()] / 1_000_000,
        minMs = times.min() / 1_000_000
    )
}
```

## Anti-patterns to detect

- **Cloud API for every AI call when local alternative exists**: Sending text to OpenAI API for summarization when Gemini Nano is available. Increases latency, costs money, requires network, compromises privacy.
- **Blocking UI thread during inference**: `val result = model.infer(input)` on `Dispatchers.Main`. Always use `Dispatchers.Default` + `withContext`.
- **Not closing ONNX sessions**: `OrtSession` holds native memory — must call `.close()` when done. Use `use {}` or explicit lifecycle management.
- **Loading full-precision FP32 model**: Use INT4/INT8 quantized variants — 4x smaller, faster, negligible accuracy loss for most tasks.
- **No warm-up before real inference**: First inference is always slow (NNAPI/ANE JIT). Always warm-up on background thread at app start.
- **Storing models in `/cache`**: Cache can be evicted by the OS. Store downloaded models in `filesDir`.
- **No model version management**: Multiple versions of same model accumulate → disk space bloat. Always clean old versions.
- **Inferring on every keystroke**: Add `debounce(300)` before triggering inference on text input.

## References
- https://android-developers.googleblog.com/2024/05/android-ai-developer-previews-gemini-nano.html
- https://onnxruntime.ai/docs/get-started/with-android.html
- https://developer.android.com/ml/nnapi
- https://developer.apple.com/documentation/coreml
- https://developer.apple.com/documentation/vision
- https://developer.apple.com/machine-learning/create-ml/
