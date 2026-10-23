// Copyright (c) 2021 Slack Technologies, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#include <string>
#include <vector>

#include "base/dcheck_is_on.h"
#include "base/logging.h"
#include "base/strings/string_number_conversions.h"
#include "shell/common/gin_helper/dictionary.h"
#include "shell/common/gin_helper/error_thrower.h"
#include "shell/common/node_includes.h"
#include "v8/include/v8.h"

#if DCHECK_IS_ON()
namespace node::crypto {
NODE_EXTERN void AddBlockedSPKIForTesting(const uint8_t* sha256_hash);
NODE_EXTERN void ClearBlockedSPKIsForTesting();
}  // namespace node::crypto

namespace {

void Log(int severity, std::string text) {
  switch (severity) {
    case logging::LOGGING_VERBOSE:
      VLOG(1) << text;
      break;
    case logging::LOGGING_INFO:
      LOG(INFO) << text;
      break;
    case logging::LOGGING_WARNING:
      LOG(WARNING) << text;
      break;
    case logging::LOGGING_ERROR:
      LOG(ERROR) << text;
      break;
    case logging::LOGGING_FATAL:
      LOG(FATAL) << text;
      break;
    default:
      LOG(ERROR) << "Unrecognized severity: " << severity;
      break;
  }
}

void AddNodeBlockedSPKIForTesting(gin_helper::ErrorThrower thrower,
                                  const std::string& hex) {
  std::vector<uint8_t> hash;
  if (!base::HexStringToBytes(hex, &hash) || hash.size() != 32) {
    thrower.ThrowTypeError("expected a 64 character hex SHA-256");
    return;
  }
  node::crypto::AddBlockedSPKIForTesting(hash.data());
}

void ClearNodeBlockedSPKIsForTesting() {
  node::crypto::ClearBlockedSPKIsForTesting();
}

void Initialize(v8::Local<v8::Object> exports,
                v8::Local<v8::Value> unused,
                v8::Local<v8::Context> context,
                void* priv) {
  gin_helper::Dictionary dict(context->GetIsolate(), exports);
  dict.SetMethod("log", &Log);
  dict.SetMethod("addNodeBlockedSPKI", &AddNodeBlockedSPKIForTesting);
  dict.SetMethod("clearNodeBlockedSPKIs", &ClearNodeBlockedSPKIsForTesting);
}

}  // namespace

NODE_LINKED_BINDING_CONTEXT_AWARE(electron_common_testing, Initialize)
#endif
