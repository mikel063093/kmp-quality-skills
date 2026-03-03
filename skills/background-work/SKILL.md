# Background Work — WorkManager & BGTaskScheduler in KMP

## Description
Covers background task implementation for Android (WorkManager, CoroutineWorker) and iOS (BGTaskScheduler, BGProcessingTask, BGAppRefreshTask) with a KMP abstraction layer. Includes constraints, chaining, progress reporting, periodic work, and testing Workers.

## Trigger phrases
- "background work KMP"
- "WorkManager best practices"
- "BGTaskScheduler iOS"
- "periodic background task"
- "CoroutineWorker setup"
- "background sync KMP"

## Rules & Checks

### KMP Abstraction Layer

- **Define a platform-agnostic interface in `commonMain`** and implement per platform.

```kotlin
// commonMain
interface BackgroundTaskScheduler {
    fun scheduleSync(delayMinutes: Long = 15)
    fun schedulePeriodic(intervalMinutes: Long)
    fun cancelAll()
}

// androidMain
class AndroidBackgroundTaskScheduler(private val context: Context) : BackgroundTaskScheduler {
    private val workManager = WorkManager.getInstance(context)
    
    override fun scheduleSync(delayMinutes: Long) {
        val request = OneTimeWorkRequestBuilder<SyncWorker>()
            .setInitialDelay(delayMinutes, TimeUnit.MINUTES)
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.MINUTES)
            .build()
        workManager.enqueueUniqueWork("sync", ExistingWorkPolicy.KEEP, request)
    }
    
    override fun schedulePeriodic(intervalMinutes: Long) {
        val request = PeriodicWorkRequestBuilder<SyncWorker>(intervalMinutes, TimeUnit.MINUTES)
            .setConstraints(Constraints(requiredNetworkType = NetworkType.CONNECTED))
            .build()
        workManager.enqueueUniquePeriodicWork("periodicSync", ExistingPeriodicWorkPolicy.KEEP, request)
    }
    
    override fun cancelAll() = workManager.cancelAllWork()
}
```

### Android WorkManager

- **CoroutineWorker for suspend-friendly workers** — prefer over `Worker`.

```kotlin
// GOOD — CoroutineWorker
class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters,
    private val syncUseCase: SyncDataUseCase  // inject via WorkerFactory + Hilt/Koin
) : CoroutineWorker(appContext, workerParams) {
    
    override suspend fun doWork(): Result {
        return try {
            setForeground(createForegroundInfo()) // for long-running work (Android 12+)
            
            val totalItems = 100
            for (i in 0..totalItems) {
                syncUseCase.syncBatch(i)
                setProgress(workDataOf("progress" to (i * 100 / totalItems)))
            }
            Result.success()
        } catch (e: CancellationException) {
            throw e // don't catch CancellationException!
        } catch (e: Exception) {
            if (runAttemptCount < 3) Result.retry() else Result.failure()
        }
    }
    
    private fun createForegroundInfo() = ForegroundInfo(
        1, NotificationCompat.Builder(applicationContext, "sync_channel")
            .setContentTitle("Syncing…")
            .setSmallIcon(R.drawable.ic_sync)
            .build()
    )
}
```

- **Always re-throw `CancellationException`** — catching it prevents proper coroutine cancellation.
- **Use `enqueueUniqueWork`** to avoid duplicate work with same logical name.
- **Report progress with `setProgress()`** for long-running tasks.

### WorkManager Constraints & Chains

```kotlin
// Constraints
val networkConstraint = Constraints(
    requiredNetworkType = NetworkType.CONNECTED,
    requiresBatteryNotLow = true,  // don't run on low battery
    requiresStorageNotLow = true
)

// Expedited work (starts immediately, short duration)
val expeditedRequest = OneTimeWorkRequestBuilder<QuickSyncWorker>()
    .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
    .build()

// Work chains
workManager
    .beginWith(downloadWorkerRequest)
    .then(processWorkerRequest)         // runs after download succeeds
    .then(uploadResultWorkerRequest)
    .enqueue()

// Parallel + merge
workManager
    .beginWith(listOf(syncUsers, syncDocs))  // parallel
    .then(finalizeWorker)                     // waits for both
    .enqueue()
```

### iOS BGTaskScheduler

```swift
// AppDelegate or @main struct — register identifiers
func application(_ application: UIApplication, didFinishLaunchingWithOptions...) -> Bool {
    BGTaskScheduler.shared.register(
        forTaskWithIdentifier: "com.example.app.sync",
        using: nil
    ) { task in
        self.handleSync(task: task as! BGProcessingTask)
    }
    
    BGTaskScheduler.shared.register(
        forTaskWithIdentifier: "com.example.app.refresh",
        using: nil
    ) { task in
        self.handleRefresh(task: task as! BGAppRefreshTask)
    }
    return true
}

// BGProcessingTask — for longer tasks (network, DB) when plugged in
func handleSync(task: BGProcessingTask) {
    scheduleSync() // reschedule before starting
    
    let syncTask = Task {
        do {
            try await kmpRepository.syncData()
            task.setTaskCompleted(success: true)
        } catch {
            task.setTaskCompleted(success: false)
        }
    }
    
    task.expirationHandler = {
        syncTask.cancel()
    }
}

// Schedule BGProcessingTask
func scheduleSync() {
    let request = BGProcessingTaskRequest(identifier: "com.example.app.sync")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = false
    request.earliestBeginDate = Date(timeIntervalSinceNow: 3600) // 1 hour minimum
    try? BGTaskScheduler.shared.submit(request)
}

// BGAppRefreshTask — short refresh (30 seconds max)
func handleRefresh(task: BGAppRefreshTask) {
    scheduleRefresh() // always reschedule
    
    let refreshTask = Task {
        await kmpViewModel.quickRefresh()
        task.setTaskCompleted(success: true)
    }
    task.expirationHandler = { refreshTask.cancel() }
}
```

- **Always reschedule from inside the handler** — iOS doesn't auto-repeat.
- **BGProcessingTask** requires device idle + optional charging. For 30s max tasks, use `BGAppRefreshTask`.
- **Add to Info.plist**: `BGTaskSchedulerPermittedIdentifiers` array with all task IDs.

### Testing Workers

```kotlin
// Android — WorkManager testing
@RunWith(AndroidJUnit4::class)
class SyncWorkerTest {
    private lateinit var context: Context
    private lateinit var workManager: WorkManager

    @Before
    fun setup() {
        context = ApplicationProvider.getApplicationContext()
        workManager = WorkManager.getInstance(context)
    }

    @Test
    fun syncWorker_succeeds() {
        val request = OneTimeWorkRequestBuilder<SyncWorker>().build()
        workManager.enqueue(request).result.get()
        
        val info = workManager.getWorkInfoById(request.id).get()
        assertEquals(WorkInfo.State.SUCCEEDED, info?.state)
    }
}
```

## Anti-patterns to detect

- **`AlarmManager` for periodic background work**: AlarmManager is for exact-time alarms (calendar reminders), not background sync. It bypasses Doze mode incorrectly and is battery-unfriendly. Use `WorkManager` instead.
- **`IntentService`**: Deprecated since API 30. Replace with `CoroutineWorker` or `JobIntentService`/`JobScheduler`.
- **Background thread without scope**: `Thread { doWork() }.start()` in a Worker — no cancellation, no structured concurrency. Use `withContext(Dispatchers.IO)` inside `CoroutineWorker`.
- **Catching `CancellationException`**: `catch (e: Exception) { ... }` catches cancellation — re-throw it.
- **Not calling `setTaskCompleted`** on iOS background task: System kills the app if the task isn't marked complete.
- **Long work in `BGAppRefreshTask`**: 30-second limit. For longer work, use `BGProcessingTask`.
- **Enqueueing without uniqueness**: `workManager.enqueue(request)` without `enqueueUniqueWork` — creates duplicate workers on multiple triggers.
- **Background work without network constraint**: Sync tasks without `NetworkType.CONNECTED` will fail silently and waste battery.

## References
- https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started
- https://developer.android.com/develop/background-work/background-tasks/persistent/how-to/long-running
- https://developer.apple.com/documentation/backgroundtasks
- https://developer.apple.com/documentation/backgroundtasks/bgtaskscheduler
- https://developer.android.com/develop/background-work/background-tasks/testing/persistent/integration-testing
