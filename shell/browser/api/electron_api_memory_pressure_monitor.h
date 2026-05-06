// Copyright (c) 2025 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#ifndef ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_
#define ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_

#include <string>

#include "base/memory/memory_pressure_level.h"
#include "base/memory/memory_pressure_listener.h"
#include "gin/wrappable.h"
#include "shell/browser/event_emitter_mixin.h"
#include "shell/common/gin_helper/pinnable.h"

namespace electron::api {

class MemoryPressureMonitor
    : public gin::Wrappable<MemoryPressureMonitor>,
      public gin_helper::EventEmitterMixin<MemoryPressureMonitor>,
      public gin_helper::Pinnable<MemoryPressureMonitor>,
      public base::MemoryPressureListener {
 public:
  static v8::Local<v8::Value> Create(v8::Isolate* isolate);

  static const char* GetClassName() { return "MemoryPressureMonitor"; }

  // gin::Wrappable
  static gin::WrapperInfo kWrapperInfo;
  gin::ObjectTemplateBuilder GetObjectTemplateBuilder(
      v8::Isolate* isolate) override;
  const gin::WrapperInfo* wrapper_info() const override;

  // disable copy
  MemoryPressureMonitor(const MemoryPressureMonitor&) = delete;
  MemoryPressureMonitor& operator=(const MemoryPressureMonitor&) = delete;

  // Public for cppgc::MakeGarbageCollected.
  explicit MemoryPressureMonitor(v8::Isolate* isolate);
  ~MemoryPressureMonitor() override;

 private:
  // Returns the current memory pressure level as a string.
  std::string GetCurrentPressureLevel();

  // Broadcasts a memory pressure notification to all listeners in the browser
  // process and all renderer processes.
  void NotifyMemoryPressure(const std::string& level);

  // base::MemoryPressureListener:
  void OnMemoryPressure(base::MemoryPressureLevel level) override;

  base::MemoryPressureListenerRegistration listener_registration_;

  // Tracks the last level set via notifyMemoryPressure(). The OS-level
  // base::MemoryPressureMonitor has no way to store externally-supplied
  // levels, so we maintain our own copy.
  base::MemoryPressureLevel current_level_ =
      base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE;
};

}  // namespace electron::api

#endif  // ELECTRON_SHELL_BROWSER_API_ELECTRON_API_MEMORY_PRESSURE_MONITOR_H_
