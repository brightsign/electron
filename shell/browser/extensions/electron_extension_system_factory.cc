// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "shell/browser/extensions/electron_extension_system_factory.h"

#include "components/keyed_service/content/browser_context_dependency_manager.h"
#include "extensions/browser/extension_prefs_factory.h"
#include "extensions/browser/extension_registry_factory.h"
#include "extensions/browser/extensions_browser_client.h"
#include "shell/browser/extensions/electron_extension_system.h"

using content::BrowserContext;

namespace extensions {

ExtensionSystem* ElectronExtensionSystemFactory::GetForBrowserContext(
    BrowserContext* context) {
  return static_cast<ElectronExtensionSystem*>(
      GetInstance()->GetServiceForBrowserContext(context, true));
}

// static
ElectronExtensionSystemFactory* ElectronExtensionSystemFactory::GetInstance() {
  return base::Singleton<ElectronExtensionSystemFactory>::get();
}

ElectronExtensionSystemFactory::ElectronExtensionSystemFactory()
    : ExtensionSystemProvider("ElectronExtensionSystem",
                              BrowserContextDependencyManager::GetInstance()) {
  DependsOn(ExtensionPrefsFactory::GetInstance());
  DependsOn(ExtensionRegistryFactory::GetInstance());
}

ElectronExtensionSystemFactory::~ElectronExtensionSystemFactory() = default;

KeyedService* ElectronExtensionSystemFactory::BuildServiceInstanceFor(
    BrowserContext* context) const {
  return new ElectronExtensionSystem(context);
}

BrowserContext* ElectronExtensionSystemFactory::GetBrowserContextToUse(
    BrowserContext* context) const {
  // Redirect incognito/in-memory contexts to the original so they share the
  // fully-initialized extension system (and its component extensions like the
  // PDF viewer) rather than getting an uninitialized instance of their own.
  return ExtensionsBrowserClient::Get()->GetContextRedirectedToOriginal(
      context, /*force_guest_profile=*/true);
}

bool ElectronExtensionSystemFactory::ServiceIsCreatedWithBrowserContext()
    const {
  return true;
}

}  // namespace extensions
