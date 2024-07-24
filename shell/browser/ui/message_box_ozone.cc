// Copyright (c) 2015 GitHub, Inc.
// Use of this source code is governed by the MIT license that can be
// found in the LICENSE file.

#include "shell/browser/ui/message_box.h"

#include "base/functional/callback.h"

#if defined(USE_OZONE)
#include "ui/base/ui_base_features.h"
#endif

namespace electron {

MessageBoxSettings::MessageBoxSettings() = default;
MessageBoxSettings::MessageBoxSettings(const MessageBoxSettings&) = default;
MessageBoxSettings::~MessageBoxSettings() = default;

int ShowMessageBoxSync(const MessageBoxSettings& settings) {}

void ShowMessageBox(const MessageBoxSettings& settings,
                    MessageBoxCallback callback) {}

void CloseMessageBox(int id) {}

// Like ShowMessageBox with simplest settings, but safe to call at very early
// stage of application.
void ShowErrorBox(const std::u16string& title, const std::u16string& content) {}

}  // namespace electron
