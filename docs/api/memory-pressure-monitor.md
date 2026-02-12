# memoryPressureMonitor

> Monitor and trigger system memory pressure events.

Process: [Main](../glossary.md#main-process)

## Events

The `memoryPressureMonitor` module emits the following events:

### Event: 'memory-pressure'

Returns:

* `level` string - The memory pressure level. Can be `moderate` or `critical`.

Emitted when the system reports a change in memory pressure. This is an
OS-level signal indicating that the system is running low on available memory.

At the `moderate` level, modules should free buffers that are cheap to
re-allocate and not immediately needed.

At the `critical` level, modules should free all possible memory. The
alternative is to be killed by the system, which means all memory will have to
be re-created, plus the cost of a cold start.

Apps may react by closing non-essential windows or tabs, clearing caches,
dropping undo history, or other memory-saving measures.

## Methods

The `memoryPressureMonitor` module has the following methods:

### `memoryPressureMonitor.getCurrentPressureLevel()`

Returns `string` - The current memory pressure level. Can be `none`, `moderate`,
or `critical`.

Returns the memory pressure level last set via `notifyMemoryPressure()`. Defaults
to `none` if no level has been set.

### `memoryPressureMonitor.notifyMemoryPressure(level)`

* `level` string - The pressure level to set. Must be `none`, `moderate`, or
  `critical`.

Broadcasts a memory pressure notification to all listeners in both the main
process and all renderer processes. This causes Chromium internals (blink
resource cache, V8 garbage collector, network cache, decoded image cache, etc.)
to release memory as if the OS had reported memory pressure.

When called with `none`, the level is stored (so `getCurrentPressureLevel()`
reflects it) but no notification is broadcast, since Chromium does not support
notifying "no pressure".

Use this when your application knows that external resources held by the
Electron process are causing system-wide memory pressure, and you want Electron
to proactively release caches and run garbage collection across all processes.

In the main process, this respects the notification-suppressed flag — if
notifications are suppressed (e.g. during memory measurement), the main-process
notification will be silently dropped. Renderer processes are always notified.

```js
const { memoryPressureMonitor } = require('electron')

// Listen for OS memory pressure events
memoryPressureMonitor.on('memory-pressure', (level) => {
  console.log(`Memory pressure: ${level}`)
  if (level === 'critical') {
    // Close non-essential windows, drop caches, etc.
  }
})

// Trigger memory pressure to force Electron to release caches
memoryPressureMonitor.notifyMemoryPressure('critical')

// Query current pressure level
console.log(memoryPressureMonitor.getCurrentPressureLevel())
```
