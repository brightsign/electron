
// Copyright 2013 The Chromium Authors
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef ELECTRON_SHELL_BROWSER_MEDIA_RESOURCE_GETTER_IMPL_H_
#define ELECTRON_SHELL_BROWSER_MEDIA_RESOURCE_GETTER_IMPL_H_

#include "base/functional/callback.h"
#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/synchronization/waitable_event.h"
#include "net/base/auth.h"
#include "net/base/io_buffer.h"
#include "net/cookies/canonical_cookie.h"
#include "net/cookies/site_for_cookies.h"
#include "net/storage_access_api/status.h"

namespace content {

class BrowserContext;
class ResourceContext;

// This class implements media::MediaResourceGetter to retrieve resources
// asynchronously on the UI thread.
class MediaResourceGetterImpl {
 public:
  typedef base::RepeatingCallback<void(scoped_refptr<net::IOBufferWithSize>)>
      GetMediaDataCB;

  // Callback to get the cookies. Args: cookies string.
  typedef base::OnceCallback<void(const std::string&)> GetCookieCB;

  // Callback to get the auth credentials. Args: username and password.
  typedef base::OnceCallback<void(const std::u16string&, const std::u16string&)>
      GetAuthCredentialsCB;

  // Callback to get the media metadata. Args: duration, width, height, and
  // whether the information is retrieved successfully.
  typedef base::OnceCallback<void(base::TimeDelta, int, int, bool)>
      ExtractMediaMetadataCB;

  // Construct a MediaResourceGetterImpl object. `browser_context` and
  // `render_process_id` are passed to retrieve the CookieStore.
  MediaResourceGetterImpl(BrowserContext* browser_context,
                          int render_process_id,
                          int render_frame_id);

  MediaResourceGetterImpl(const MediaResourceGetterImpl&) = delete;
  MediaResourceGetterImpl& operator=(const MediaResourceGetterImpl&) = delete;

  ~MediaResourceGetterImpl();

  // media::MediaResourceGetter implementation.
  // Must be called on the UI thread.
  void GetAuthCredentials(const GURL& url, GetAuthCredentialsCB callback);
  void GetCookies(const GURL& url,
                  const net::SiteForCookies& site_for_cookies,
                  const url::Origin& top_frame_origin,
                  net::StorageAccessApiStatus storage_access_api_status,
                  GetCookieCB callback);

  void ReadMediaData(const std::string& blob_url,
                     uint64_t location,
                     uint64_t size,
                     GetMediaDataCB callback);

 private:
  // Called when GetAuthCredentials() finishes.
  void GetAuthCredentialsCallback(
      GetAuthCredentialsCB callback,
      const std::optional<net::AuthCredentials>& credentials);

  // BrowserContext to retrieve URLRequestContext and ResourceContext.
  raw_ptr<BrowserContext> browser_context_;

  // Render process id, used to check whether the process can access cookies.
  int render_process_id_;

  // Render frame id, used to check tab specific cookie policy.
  int render_frame_id_;

  // NOTE: Weak pointers must be invalidated before all other member variables.
  base::WeakPtrFactory<MediaResourceGetterImpl> weak_factory_{this};
};

}  // namespace content

#endif  // ELECTRON_SHELL_BROWSER_MEDIA_RESOURCE_GETTER_IMPL_H_
