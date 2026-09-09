package expo.modules.nativedownloader

import android.content.Context
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import javax.net.SocketFactory
import okhttp3.Call
import okhttp3.Callback
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.ResponseBody

enum class MediaDownloadState {
  done,
  failed,
  cancelled,
}

class MediaDownloaderModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "react context lost" }

  private val client: OkHttpClient by lazy {
    OkHttpClient.Builder()
      .connectTimeout(30, TimeUnit.SECONDS)
      .readTimeout(60, TimeUnit.SECONDS)
      .writeTimeout(60, TimeUnit.SECONDS)
      .connectionPool(ConnectionPool(16, 5, TimeUnit.MINUTES))
      .socketFactory(tunedSockets)
      .retryOnConnectionFailure(true)
      .build()
  }

  // fat buffers (~2x single-stream); set before connect or kernel ignores
  private val tunedSockets = object : SocketFactory() {
    override fun createSocket(): Socket = Socket().apply {
      receiveBufferSize = 1024 * 1024
      sendBufferSize = 256 * 1024
      tcpNoDelay = true
    }

    override fun createSocket(host: String, port: Int): Socket =
      createSocket().apply { connect(InetSocketAddress(host, port)) }

    override fun createSocket(host: String, port: Int, localHost: InetAddress, localPort: Int): Socket =
      createSocket().apply {
        bind(InetSocketAddress(localHost, localPort))
        connect(InetSocketAddress(host, port))
      }

    override fun createSocket(host: InetAddress, port: Int): Socket =
      createSocket().apply { connect(InetSocketAddress(host, port)) }

    override fun createSocket(host: InetAddress, port: Int, localHost: InetAddress, localPort: Int): Socket =
      createSocket().apply {
        bind(InetSocketAddress(localHost, localPort))
        connect(InetSocketAddress(host, port))
      }
  }

  private class JobState(
    var calls: MutableList<Call> = mutableListOf(),
    var bytes: AtomicLong = AtomicLong(0),
    var finalSize: Long = 0,
    var lastEmitAt: Long = 0
  )

  private val jobs = mutableMapOf<String, JobState>()

  companion object {
    private const val REGION_MAX_RETRIES = 4
    private const val RETRY_BASE_DELAY_MS = 500L
    private const val RETRY_MAX_DELAY_MS = 8000L
  }

  private val retryScheduler = Executors.newSingleThreadScheduledExecutor()

  private fun retryDelayMs(retry: Int): Long {
    var delay = RETRY_BASE_DELAY_MS
    repeat(retry) { delay *= 2 }
    return minOf(delay, RETRY_MAX_DELAY_MS)
  }

  private fun jobAlive(jobId: String, job: JobState): Boolean = jobs[jobId] === job

  override fun definition() = ModuleDefinition {
    Name("MediaDownloader")

    Events("onDownloadProgress", "onDownloadDone")

    AsyncFunction("startDownload") { jobId: String, url: String, destPath: String, headers: Map<String, String>, resumeBytes: Long, parallel: Int ->
      jobs.remove(jobId)?.let { old ->
        synchronized(old.calls) { old.calls.forEach { it.cancel() } }
      }
      val job = JobState()
      jobs[jobId] = job
      try {
        start(jobId, job, url, destPath, headers, resumeBytes, parallel)
      } catch (err: Throwable) {
        fail(jobId, job, err.message ?: "download start failed")
      }
    }

    AsyncFunction("cancelDownload") { jobId: String ->
      jobs.remove(jobId)?.let { job ->
        synchronized(job.calls) { job.calls.forEach { it.cancel() } }
      }
    }

    AsyncFunction("cancelAll") {
      jobs.values.forEach { job ->
        synchronized(job.calls) { job.calls.forEach { it.cancel() } }
      }
      jobs.clear()
    }
  }

  private fun start(
    jobId: String,
    job: JobState,
    url: String,
    destPath: String,
    headers: Map<String, String>,
    resumeBytes: Long,
    parallel: Int
  ) {
    val dest = File(destPath)
    dest.parentFile?.let { parent ->
      if (!parent.exists() && !parent.mkdirs()) {
        throw CodedException("cannot create download dir: $parent")
      }
    }

    val allowed = setOf("user-agent", "accept", "referer", "cookie", "origin", "range")
    val baseRequest = Request.Builder().url(url).apply {
      headers.forEach { (name, value) ->
        if (allowed.contains(name.lowercase())) header(name, value)
      }
    }.build()

    // 1-byte probe: rangeless GETs get throttled to playback speed
    fun probe(attempt: Int) {
      if (!jobAlive(jobId, job)) return
      val probeCall = client.newCall(baseRequest.newBuilder().header("Range", "bytes=0-0").build())
      synchronized(job.calls) { job.calls.add(probeCall) }
      probeCall.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          if (call.isCanceled() || !jobAlive(jobId, job)) return
          if (attempt < REGION_MAX_RETRIES) {
            retryScheduler.schedule(Runnable { probe(attempt + 1) }, retryDelayMs(attempt), TimeUnit.MILLISECONDS)
          } else {
            fail(jobId, job, e.message ?: "network error")
          }
        }

        override fun onResponse(call: Call, response: Response) {
          response.use { resp ->
            if (!resp.isSuccessful) {
              fail(jobId, job, "download HTTP ${resp.code}", resp.code)
              return
            }
            val length = parseContentLength(resp.headers["Content-Range"])
            val n = if (parallel > 1) parallel.coerceIn(2, 8) else 1
            if (length <= 0 || n <= 1 || length - resumeBytes < n * 256 * 1024) {
              singleStream(jobId, job, baseRequest, dest, resumeBytes)
              return
            }
            parallelRegions(jobId, job, baseRequest, dest, length, resumeBytes, n)
          }
        }
      })
    }
    probe(0)
  }

  private fun parallelRegions(
    jobId: String,
    job: JobState,
    baseRequest: Request,
    dest: File,
    length: Long,
    resumeBytes: Long,
    workers: Int
  ) {
    if (resumeBytes == 0L) dest.delete()
    RandomAccessFile(dest.path, "rw").use { it.setLength(length) }
    job.finalSize = length
    RegionFetch(jobId, job, baseRequest, dest, length, resumeBytes, workers).start()
  }

  // member fns so fetchRegion/next can call each other (local fns can't)
  private inner class RegionFetch(
    private val jobId: String,
    private val job: JobState,
    private val baseRequest: Request,
    private val dest: File,
    private val length: Long,
    resumeBytes: Long,
    private val workers: Int
  ) {
    // 4MB regions dodge throttling; shared cursor keeps resume offset
    private val region = 4L * 1024 * 1024
    private val cursor = AtomicLong(resumeBytes)
    private val active = AtomicInteger(workers)
    private val done = AtomicBoolean(false)

    fun start() {
      repeat(workers) { next() }
    }

    private fun next() {
      while (true) {
        if (done.get()) return
        val start = cursor.getAndAdd(region)
        if (start >= length) {
          if (active.decrementAndGet() == 0 && done.compareAndSet(false, true)) {
            finish(jobId, job, cancelled = false)
          }
          return
        }
        val end = minOf(start + region - 1, length - 1)
        fetchRegion(start, end, 0)
        return
      }
    }

    private fun fetchRegion(start: Long, end: Long, attempt: Int) {
      if (done.get() || !jobAlive(jobId, job)) return
      val regionCall = client.newCall(
        baseRequest.newBuilder().header("Range", "bytes=$start-$end").build()
      )
      synchronized(job.calls) { job.calls.add(regionCall) }
      regionCall.enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
          if (call.isCanceled() || done.get() || !jobAlive(jobId, job)) return
          // stall: retry region; http refusal fails fast, pipeline refreshes url
          if (attempt < REGION_MAX_RETRIES) {
            retryScheduler.schedule(
              Runnable { fetchRegion(start, end, attempt + 1) },
              retryDelayMs(attempt),
              TimeUnit.MILLISECONDS
            )
          } else if (done.compareAndSet(false, true)) {
            fail(jobId, job, e.message ?: "network error")
          }
        }

        override fun onResponse(call: Call, response: Response) {
          response.use { resp ->
            // 200 on ranged request = full body at wrong offset, corrupts file
            if (resp.code != 206) {
              if (done.compareAndSet(false, true)) {
                fail(jobId, job, "cdn ignored range ${resp.code}", resp.code)
              }
              return
            }
            try {
              val body: ResponseBody = resp.body ?: throw IOException("empty body")
              writeRegion(dest.path, start, body, job, jobId)
            } catch (err: Throwable) {
              if (done.compareAndSet(false, true)) {
                fail(jobId, job, err.message ?: "download failed")
              }
              return
            }
            next()
          }
        }
      })
    }
  }

  private fun singleStream(
    jobId: String,
    job: JobState,
    baseRequest: Request,
    dest: File,
    resumeBytes: Long,
    attempt: Int = 0
  ) {
    if (!jobAlive(jobId, job)) return
    val builder = baseRequest.newBuilder()
    if (resumeBytes > 0) builder.header("Range", "bytes=$resumeBytes-")
    val call = client.newCall(builder.build())
    synchronized(job.calls) { job.calls.add(call) }
    call.enqueue(object : Callback {
      override fun onFailure(call: Call, e: IOException) {
        if (call.isCanceled()) {
          finish(jobId, job, cancelled = true)
        } else if (!jobAlive(jobId, job)) {
          return
        } else if (attempt < REGION_MAX_RETRIES) {
          retryScheduler.schedule(
            Runnable { singleStream(jobId, job, baseRequest, dest, resumeBytes, attempt + 1) },
            retryDelayMs(attempt),
            TimeUnit.MILLISECONDS
          )
        } else {
          fail(jobId, job, e.message ?: "network error")
        }
      }

      override fun onResponse(call: Call, response: Response) {
        response.use { resp ->
          if (!resp.isSuccessful) {
            fail(jobId, job, "download HTTP ${resp.code}", resp.code)
            return
          }
          try {
            // stale range: wipe prefix or file corrupts
            var resume = resumeBytes
            if (resume > 0 && (resp.code == 200 || resp.code == 416)) {
              dest.delete()
              resume = 0
            }
            val added = resp.body?.contentLength() ?: -1
            job.finalSize = if (added >= 0) {
              if (resume > 0) resume + added else added
            } else {
              -1
            }
            emitProgress(jobId, job)
            val sink = java.io.FileOutputStream(dest, resume > 0)
            val src = resp.body?.byteStream() ?: throw IOException("empty body")
            sink.use { out ->
              src.use { input ->
                val buf = ByteArray(256 * 1024)
                while (true) {
                  val read = input.read(buf)
                  if (read == -1) break
                  out.write(buf, 0, read)
                  job.bytes.addAndGet(read.toLong())
                  val now = System.currentTimeMillis()
                  if (now - job.lastEmitAt >= 40) {
                    job.lastEmitAt = now
                    emitProgress(jobId, job)
                  }
                }
              }
            }
            finish(jobId, job, call.isCanceled())
          } catch (err: Throwable) {
            fail(jobId, job, err.message ?: "download failed")
          }
        }
      }
    })
  }

  private fun writeRegion(destPath: String, start: Long, body: ResponseBody, job: JobState, jobId: String) {
    RandomAccessFile(destPath, "rw").use { raf ->
      raf.seek(start)
      val buf = ByteArray(256 * 1024)
      body.byteStream().use { input ->
        while (true) {
          val read = input.read(buf)
          if (read == -1) break
          raf.write(buf, 0, read)
          job.bytes.addAndGet(read.toLong())
          val now = System.currentTimeMillis()
          if (now - job.lastEmitAt >= 40) {
            job.lastEmitAt = now
            emitProgress(jobId, job)
          }
        }
      }
    }
  }

  private fun parseContentLength(contentRange: String?): Long {
    if (contentRange == null) return 0
    val slash = contentRange.lastIndexOf('/')
    if (slash >= 0) {
      return contentRange.substring(slash + 1).toLongOrNull() ?: 0
    }
    return 0
  }

  // first to remove job reports, rest stay silent
  private fun finish(jobId: String, job: JobState, cancelled: Boolean) {
    val removed = jobs.remove(jobId)
    if (removed == null || removed !== job) return
    sendEvent(
      "onDownloadDone",
      mapOf(
        "jobId" to jobId,
        "state" to if (cancelled) MediaDownloadState.cancelled.name else MediaDownloadState.done.name,
        "bytes" to job.bytes.get(),
        "total" to job.finalSize
      )
    )
  }

  // event fields must match MediaDownloader.ts (error, httpCode)
  private fun fail(jobId: String, job: JobState, message: String, httpCode: Int = 0) {
    val removed = jobs.remove(jobId)
    if (removed == null || removed !== job) return
    synchronized(job.calls) { job.calls.forEach { it.cancel() } }
    sendEvent(
      "onDownloadDone",
      mapOf(
        "jobId" to jobId,
        "state" to MediaDownloadState.failed.name,
        "bytes" to job.bytes.get(),
        "total" to job.finalSize,
        "error" to message,
        "httpCode" to httpCode
      )
    )
  }

  private fun emitProgress(jobId: String, job: JobState) {
    sendEvent(
      "onDownloadProgress",
      mapOf(
        "jobId" to jobId,
        "bytes" to job.bytes.get(),
        "total" to job.finalSize
      )
    )
  }
}