// Copyright (c) 2025 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#include "shell/browser/api/electron_api_memory_pressure_monitor.h"

#include "base/memory/memory_pressure_listener.h"
#include "content/browser/renderer_host/render_process_host_impl.h"
#include "content/public/browser/render_process_host.h"
#include "gin/data_object_builder.h"
#include "gin/handle.h"
#include "gin/public/wrappable_pointer_tags.h"
#include "shell/browser/javascript_environment.h"
#include "shell/common/gin_helper/dictionary.h"
#include "shell/common/gin_helper/object_template_builder.h"
#include "shell/common/node_includes.h"
#include "v8/include/cppgc/allocation.h"

namespace gin {

template <>
struct Converter<base::MemoryPressureLevel> {
  static v8::Local<v8::Value> ToV8(v8::Isolate* isolate,
                                   const base::MemoryPressureLevel& in) {
    switch (in) {
      case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE:
        return StringToV8(isolate, "none");
      case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_MODERATE:
        return StringToV8(isolate, "moderate");
      case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_CRITICAL:
        return StringToV8(isolate, "critical");
    }
  }

  static bool FromV8(v8::Isolate* isolate,
                     v8::Local<v8::Value> val,
                     base::MemoryPressureLevel* out) {
    std::string level;
    if (!ConvertFromV8(isolate, val, &level))
      return false;

    if (level == "none") {
      *out = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE;
    } else if (level == "moderate") {
      *out = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_MODERATE;
    } else if (level == "critical") {
      *out = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_CRITICAL;
    } else {
      return false;
    }
    return true;
  }
};

}  // namespace gin

namespace electron::api {

gin::WrapperInfo MemoryPressureMonitor::kWrapperInfo = {
    {gin::kEmbedderNativeGin},
    gin::kElectronMemoryPressureMonitor};

MemoryPressureMonitor::MemoryPressureMonitor(v8::Isolate* isolate)
    : listener_registration_(
          FROM_HERE,
          base::MemoryPressureListenerTag::kElectronMemoryPressureMonitor,
          this) {}

MemoryPressureMonitor::~MemoryPressureMonitor() = default;

void MemoryPressureMonitor::OnMemoryPressure(base::MemoryPressureLevel level) {
  v8::Isolate* isolate = JavascriptEnvironment::GetIsolate();
  v8::HandleScope scope(isolate);
  EmitWithoutEvent("memory-pressure", gin::ConvertToV8(isolate, level));
}

std::string MemoryPressureMonitor::GetCurrentPressureLevel() {
  switch (current_level_) {
    case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE:
      return "none";
    case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_MODERATE:
      return "moderate";
    case base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_CRITICAL:
      return "critical";
  }
}

void MemoryPressureMonitor::NotifyMemoryPressure(const std::string& level) {
  base::MemoryPressureLevel pressure_level;
  if (level == "none") {
    pressure_level = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE;
  } else if (level == "moderate") {
    pressure_level = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_MODERATE;
  } else if (level == "critical") {
    pressure_level = base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_CRITICAL;
  } else {
    v8::Isolate* isolate = JavascriptEnvironment::GetIsolate();
    isolate->ThrowException(v8::Exception::TypeError(
        gin::StringToV8(isolate,
                        "Invalid memory pressure level, must be "
                        "'none', 'moderate', or 'critical'")));
    return;
  }

  // Always store the level so getCurrentPressureLevel() reflects it.
  current_level_ = pressure_level;

  // Chromium's NotifyMemoryPressure has a DCHECK that rejects
  // MEMORY_PRESSURE_LEVEL_NONE, so only forward non-none levels.
  if (pressure_level == base::MemoryPressureLevel::MEMORY_PRESSURE_LEVEL_NONE) {
    return;
  }

  // Notify the browser (main) process.
  base::MemoryPressureListener::NotifyMemoryPressure(pressure_level);

  // Notify all renderer processes via Mojo IPC.
  for (content::RenderProcessHost::iterator iter =
           content::RenderProcessHost::AllHostsIterator();
       !iter.IsAtEnd(); iter.Advance()) {
    content::RenderProcessHost* host = iter.GetCurrentValue();
    if (!host || !host->IsInitializedAndNotDead())
      continue;
    if (!host->GetProcess().IsValid())
      continue;
    static_cast<content::RenderProcessHostImpl*>(host)
        ->NotifyMemoryPressureToRenderer(pressure_level);
  }
}

// static
v8::Local<v8::Value> MemoryPressureMonitor::Create(v8::Isolate* isolate) {
  auto* monitor = cppgc::MakeGarbageCollected<MemoryPressureMonitor>(
      isolate->GetCppHeap()->GetAllocationHandle(), isolate);
  auto handle = gin::CreateHandle(isolate, monitor).ToV8();
  monitor->Pin(isolate);
  return handle;
}

gin::ObjectTemplateBuilder MemoryPressureMonitor::GetObjectTemplateBuilder(
    v8::Isolate* isolate) {
  return gin_helper::EventEmitterMixin<
             MemoryPressureMonitor>::GetObjectTemplateBuilder(isolate)
      .SetMethod("getCurrentPressureLevel",
                 &MemoryPressureMonitor::GetCurrentPressureLevel)
      .SetMethod("notifyMemoryPressure",
                 &MemoryPressureMonitor::NotifyMemoryPressure);
}

const gin::WrapperInfo* MemoryPressureMonitor::wrapper_info() const {
  return &kWrapperInfo;
}

}  // namespace electron::api

namespace {

using electron::api::MemoryPressureMonitor;

void Initialize(v8::Local<v8::Object> exports,
                v8::Local<v8::Value> unused,
                v8::Local<v8::Context> context,
                void* priv) {
  v8::Isolate* isolate = v8::Isolate::GetCurrent();
  gin_helper::Dictionary dict(isolate, exports);
  dict.SetMethod("createMemoryPressureMonitor",
                 base::BindRepeating(&MemoryPressureMonitor::Create));
}

}  // namespace

NODE_LINKED_BINDING_CONTEXT_AWARE(electron_browser_memory_pressure_monitor,
                                  Initialize)
