// Copyright (c) 2025 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#ifndef ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_
#define ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_

#include <memory>

#include "base/memory/memory_pressure_listener.h"
#include "gin/wrappable.h"
#include "shell/browser/event_emitter_mixin.h"
#include "shell/common/gin_helper/pinnable.h"

namespace electron::api {

class MemoryPressureMonitor
    : public gin::Wrappable<MemoryPressureMonitor>,
      public gin_helper::EventEmitterMixin<MemoryPressureMonitor>,
      public gin_helper::Pinnable<MemoryPressureMonitor> {
 public:
  static v8::Local<v8::Value> Create(v8::Isolate* isolate);

  // gin::Wrappable
  static gin::WrapperInfo kWrapperInfo;
  gin::ObjectTemplateBuilder GetObjectTemplateBuilder(
      v8::Isolate* isolate) override;
  const char* GetTypeName() override;

  // disable copy
  MemoryPressureMonitor(const MemoryPressureMonitor&) = delete;
  MemoryPressureMonitor& operator=(const MemoryPressureMonitor&) = delete;

 private:
  explicit MemoryPressureMonitor(v8::Isolate* isolate);
  ~MemoryPressureMonitor() override;

  // Returns the current memory pressure level as a string.
  std::string GetCurrentPressureLevel();

  // Broadcasts a memory pressure notification to all listeners in this process.
  void NotifyMemoryPressure(const std::string& level);

  // Callback invoked by base::MemoryPressureListener when system memory
  // pressure changes.
  void OnMemoryPressure(
      base::MemoryPressureListener::MemoryPressureLevel level);

  std::unique_ptr<base::MemoryPressureListener> listener_;

  // Tracks the last level set via notifyMemoryPressure(). The OS-level
  // base::MemoryPressureMonitor has no way to store externally-supplied
  // levels, so we maintain our own copy.
  base::MemoryPressureListener::MemoryPressureLevel current_level_ =
      base::MemoryPressureListener::MEMORY_PRESSURE_LEVEL_NONE;
};

}  // namespace electron::api

#endif  // ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_
