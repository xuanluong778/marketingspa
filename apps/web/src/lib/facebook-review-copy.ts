import type { FacebookReviewLocale } from './facebook-review-locale';
import {
  buildContentAutoPostHref,
  type ContentAutoPostTab,
} from './content-auto-post-routes';

export type FacebookReviewCopy = ReturnType<typeof getFacebookReviewCopy>;

export function facebookChannelsHref(locale: FacebookReviewLocale): string {
  const base = buildContentAutoPostHref('channels');
  return locale === 'en' ? `${base}&lang=en` : base;
}

export function contentAutoPostHref(
  tab: ContentAutoPostTab,
  locale: FacebookReviewLocale,
  params?: Record<string, string>,
): string {
  const href = buildContentAutoPostHref(tab, params);
  if (locale !== 'en') return href;
  return href.includes('lang=') ? href : `${href}&lang=en`;
}

export function getFacebookReviewCopy(locale: FacebookReviewLocale) {
  if (locale === 'en') {
    return {
      fanpage: {
        title: 'Connect Facebook Pages',
        subtitle:
          'Sign in with Facebook to connect and manage the Facebook Pages you are authorized to manage.',
        pagesYouManage: 'Facebook Pages you manage',
        selectPagesTitle: 'Select Facebook Pages to connect',
        connectedPage: 'Connected Facebook Page',
        connectedPages: (n: number) => `Connected Facebook Pages (${n})`,
        connectedBadge: 'Connected',
        connectFacebook: 'Connect Facebook Pages',
        reconnectFacebook: 'Reconnect Facebook Pages',
        reconnect: 'Reconnect Facebook Pages',
        refreshPages: 'Refresh Pages',
        selectMorePages: 'Select more Pages',
        disconnectAll: 'Disconnect all',
        disconnectPage: 'Disconnect',
        connectSelected: 'Connect selected Pages',
        close: 'Close',
        viewDetails: 'View details',
        syncPageInfo: 'Sync Page from Facebook',
        loadingChannels: 'Loading channel connections...',
        loadingPages: 'Loading Facebook Pages you manage...',
        oauthSuccessSelect:
          'Facebook sign-in successful — select the Facebook Pages you want to connect.',
        oauthConnected: 'Facebook Page connected successfully.',
        oauthUnavailable:
          'Facebook OAuth is not available for this account. Contact support if you need Page connection enabled.',
        selectAtLeastOne: 'Select at least one Facebook Page to connect.',
        noPagesToShow: 'No Pages to display.',
        noPagesManaged:
          'No Facebook Pages found that this account is allowed to manage.',
        missingPermission:
          'Facebook has not granted all required Page permissions (pages_show_list, pages_read_engagement, pages_manage_posts).',
        missingScopes: (scopes: string[]) => `Missing: ${scopes.join(', ')}`,
        tokenExpired: 'Your Facebook session expired — click Reconnect Facebook.',
        metaApiError: 'Could not load Pages from Facebook. Please try again.',
        lastError: (msg: string) => `Latest error: ${msg}`,
        accountLabel: (name: string) =>
          name?.trim()
            ? `Connected Facebook account: ${name.trim()}`
            : 'Connected Facebook account',
        oauthIncomplete:
          'Facebook authorization is not complete. Please reconnect Facebook.',
        noPagesSelected:
          'No Pages selected yet — click Connect Facebook Pages or Select more Pages.',
        lastSynced: (when: string) =>
          `Last updated: ${when} · Data refreshed live from Facebook`,
        notSyncedYet: 'Not synced from Facebook yet',
        latestPost: (when: string) => `Latest post: ${when}`,
        syncError: (msg: string) => `Sync error: ${msg}`,
        syncSuccess: (when?: string) =>
          when
            ? `Synced from Facebook\nLast updated: ${when} · Data refreshed live from Facebook`
            : 'Synced from Facebook',
        syncSuccessToast: 'Synced from Facebook successfully',
        permissionOk: 'Full Page permissions',
        permissionMissingPost: 'Missing publish permission',
        permissionFromFacebook: 'Permissions from Facebook',
        permissionLabel: (text: string) => `Permissions: ${text}`,
        pageId: (id: string) => `Page ID: ${id}`,
        selectMoreHint: 'Select additional Pages from your signed-in Facebook account.',
        scopeShowListTitle: 'PAGES_SHOW_LIST PERMISSION',
        scopeShowListBody:
          'MarketingAutoAZ uses pages_show_list to show Facebook Pages you manage. You choose which Pages to connect. We never auto-connect or publish to Pages you did not select.',
        scopeReadEngagementTitle: 'PAGES_READ_ENGAGEMENT PERMISSION',
        scopeReadEngagementBody:
          'Sync Page from Facebook and Refresh from Facebook call the Graph API with pages_read_engagement to read Page metadata and posts published by the Page. Auto Post uses pages_manage_posts separately to publish.',
        detailsTitle: 'Facebook Page details',
        detailsSubtitle:
          'Page data and posts from the latest Facebook sync (pages_read_engagement)',
        defaultPageName: 'Facebook Page',
        noCover: 'No cover photo from Facebook',
        pageInfo: 'Page information',
        postsFromFacebook: 'Posts from Facebook',
        refreshFromFacebook: 'Refresh from Facebook',
        noPosts:
          'This Page has no posts published by the Page itself (published_posts).',
        postsError: (msg: string) => `Could not load posts from Facebook: ${msg}`,
        postsHiddenApiError:
          'Posts hidden because Facebook API failed — stale data is not shown.',
        openOnFacebook: 'Open on Facebook',
        graphEndpoints: 'Facebook Graph API calls',
        noDetailsYet:
          'No details yet. Click Sync Page from Facebook to fetch live data.',
        syncFailed: 'Could not sync from Facebook',
        syncFailedKeepOld:
          'Facebook Graph API returned an error. Previous data is kept.',
        syncFailedKeepPrevious:
          'Could not sync from Facebook. Keeping previous data.',
        syncing: 'Syncing Page from Facebook...',
        loadingSynced: 'Loading synced data...',
        retryFromFacebook: 'Retry from Facebook',
        empty: 'Not available',
        connectFailed: 'Facebook connection failed',
        pageListRefreshed: 'Page list refreshed.',
        refreshFailed: 'Could not refresh Pages',
        facebookDisconnected: 'Facebook disconnected.',
        disconnectFacebookFailed: 'Could not disconnect Facebook',
        pageDisconnected: 'Page disconnected.',
        disconnectPageFailed: 'Could not disconnect Page',
        savePagesPartial: (ok: number, fail: number, reasons: string) =>
          `Connected ${ok} Page(s); ${fail} failed. ${reasons}`,
        savePagesSuccess: (ok: number) => `Connected ${ok} selected Page(s).`,
        savePagesFailed: 'Could not save selected Pages',
        loadPagesFailed: 'Could not load Page list',
        syncFailedKeepOldAction: 'Could not sync from Facebook. Previous data is kept.',
        postedAt: 'Posted at:',
        videoNoThumbnail: 'Video post — no thumbnail',
        noImage: 'No image',
        pageNameLabel: 'Page name',
        categoryLabel: 'Category',
        facebookLinkLabel: 'Facebook link',
        phoneLabel: 'Phone',
        locationLabel: 'Location',
        followersLabel: 'Followers',
        likesLabel: 'Likes',
        aboutLabel: 'About',
        descriptionLabel: 'Description',
        envOauthConnected:
          'Facebook Page connected (admin environment token — user OAuth flow unchanged).',
        envPageTokenBanner:
          'Environment Page token is configured for admin sync (reviewers use Connect Facebook Pages).',
        envAccountLabel: (name: string) => `Connected Facebook Page: ${name}`,
      },
      autoPost: {
        title: 'Connect Facebook Pages',
        connectedHint:
          'Facebook Page connected — you can publish from the library or manual post.',
        notConnectedHint:
          'Connect Facebook Pages under Connect channels. Do not paste Page Access Tokens in the browser.',
        connectChannels: 'Connect channels',
        checkConnection: 'Check connection',
        checkingConnection: 'Checking Facebook Page connection...',
        statusLabel: 'Status',
        pageNameLabel: 'Page name',
        connectedStatus: 'Connected',
        notConnectedStatus: 'Not connected',
        connectSuccess: (names: string) => `Connected — ${names}`,
        connectSuccessGeneric: 'Connected successfully.',
        notConnectedError:
          'No Facebook Page connected. Go to Connect channels to sign in with Facebook.',
        checkFailed: 'Could not verify Facebook Page connection',
        notConnectedBanner: 'Facebook is not connected.',
        connectBeforePublish: 'before publishing.',
        selectPage: 'Select Facebook Page',
        selectPagePlaceholder: 'Select Facebook Page',
        loadingPages: 'Loading Facebook Pages...',
        selectPageRequired:
          'Select a Facebook Page — connect under Connect channels if needed.',
        publishConfirm:
          'Publish this post to the selected Facebook Page now?',
        publishConfirmCancel: 'Cancel',
        publishSuccess: 'Post published successfully!',
        publishSuccessToast: 'Published to Facebook successfully',
        viewOnFacebook: 'View on Facebook',
        facebookPostId: (id: string) => `Facebook Post ID: ${id}`,
        publishedAt: (when: string) => `Published at: ${when}`,
        publishingToPage: 'Publishing to',
        sourcePrefix: 'Source:',
        captionReviewLabel: 'Caption (review before publishing)',
        pickPostPreviewEmpty: 'Select a post to preview.',
        pickFromLibraryHeading: 'Pick from library',
        postFromLibraryTab: 'Post from library',
        manualPostTab: 'Manual post',
        categoryAdSales: 'Sales ads',
        categoryBrandBuilding: 'Brand building',
        categoryAdvanced: 'Advanced writing',
        selectPostBeforeSave: 'Select a post and review content before saving.',
        selectPostFromLibrary: 'Please select a post from the library.',
        pickerEmptyCreateHint:
          'No AI Marketing posts yet. Create content under Create content first.',
        pickerCreateContent: 'Create content',
        contentScore: (n: number) => `Score: ${Math.round(n)}/100`,
        untitledFallback: 'Untitled',
        scheduleSuccess: 'Post scheduled! See the Schedule tab.',
        previewPageFallback: 'Your Facebook Page',
        previewFacebook: 'Preview Facebook',
        previewJustNow: 'Just now · 🌐',
        previewEmptyCaption: 'Post content will appear here...',
        libraryPublishHint:
          'The library stores approved AI posts. Pick a post to edit or send to the Auto Post tab to publish to your Facebook Page.',
        libraryTitle: 'Content library',
        libraryEmptyAd:
          'No ad posts yet — create under Create content or save to the library.',
        libraryEmptyAdvanced: 'No advanced posts in the library yet.',
        libraryEmptyPersonal:
          'No brand posts yet — create under Brand building in Create content.',
        pickFromLibrary: 'Pick a library post',
        refresh: 'Refresh',
        pageLabel: 'Facebook Page *',
        syncFromAutoPost: 'Sync Facebook Page from Auto Post',
        syncFailed: 'Sync failed',
        connectRenew: 'Connect / Renew Facebook Page',
        disconnect: 'Disconnect',
        connecting: 'Connecting…',
        manualWorkflowHint:
          'Enter content → select Facebook Page → adjust schedule (bar below) → publish now or schedule.',
        libraryWorkflowHint:
          'Pick a library post → review/edit caption → select Facebook Page → choose time (bar below) → schedule or publish now.',
        scheduleDeleteConfirm:
          'Remove this item from the schedule on the web? Posts already published to Facebook will not be deleted.',
        historyPageColumn: 'Facebook Page',
        historyEmpty: 'No posts yet. Create a draft or publish to see history.',
        captionRequired: 'Post content cannot be empty.',
        draftSaved: 'Draft saved!',
        schedulePanelIntro:
          'Track scheduled, publishing, published, or failed posts. The system worker publishes at the scheduled time after you approve.',
        scheduleTitle: 'Schedule & history',
        loadingSchedule: 'Loading schedule...',
        historyColSubject: 'Subject',
        historyColType: 'Type',
        historyColStatus: 'Status',
        historyColSchedule: 'Schedule / Published',
        historyColActions: 'Actions',
        statusFilterAll: 'All statuses',
        retry: 'Retry',
        cancelSchedule: 'Cancel schedule',
        delete: 'Delete',
        viewPost: 'View post',
        scheduleSuggestHint:
          'Suggested time +1 hour in the bar below. Review and click Schedule again.',
        scheduleInvalid: 'Invalid schedule time. Pick a time in the bar below.',
        scheduleFutureRequired:
          'Schedule time must be in the future. Suggested +1 hour — review and click Schedule again.',
        scheduleConfirm: (when: string) => `Schedule post for ${when}?`,
        contentLabel: 'Content *',
        contentPlaceholder: 'Type or paste post content (emoji and line breaks supported)...',
        closeAria: 'Close',
        saveDraft: 'Save draft',
        publishNow: 'Publish now',
        schedulePost: 'Schedule post',
        scheduleAtLabel: 'Schedule time',
        imageUrlLabel: 'Image URL (optional)',
        linkUrlLabel: 'Link URL (optional)',
        linkLandingLabel: 'Landing link (optional)',
        composeTitle: 'Compose post',
        publishSetupTitle: 'Publish settings',
        statusDraft: 'Draft',
        statusPending: 'Pending',
        statusScheduled: 'Scheduled',
        statusPublishing: 'Publishing',
        statusPublished: 'Published',
        statusFailed: 'Failed',
        statusCancelled: 'Cancelled',
        envPageNameFallback: 'Facebook Page',
      },
      messenger: {
        connectPage: 'Connect Facebook Page',
        inboxHint: 'Receive Messenger messages — connect below.',
        webhookReady: 'Facebook Page connected and webhook ready for Messenger.',
        webhookMissingScope:
          'Token missing scopes (pages_messaging / pages_manage_metadata). Reconnect Facebook OAuth to grant a new token.',
        webhookStandardAccess:
          'Token and webhook OK, but Meta App lacks Advanced Access for pages_messaging — only Admin/Developer/Tester can be replied to. Add a Tester in Meta App Roles or request Advanced Access.',
        webhookNotSubscribed:
          'Facebook Page connected but webhook not subscribed — click Reconnect.',
        serverConfiguredSelectBot:
          'Server configured. Select a chatbot then click Connect.',
        notConfiguredPaste:
          'No Facebook Page configured. Enter Page ID + Page Access Token below.',
        notConfigured:
          'No Facebook Page configured. Use Connect Facebook Pages under Content → Connect channels.',
        connectAtChannels: 'Connect Facebook Pages',
        connectViaOAuth:
          'Connect Facebook Pages via OAuth under Content → Connect channels. Do not paste Page Access Tokens in the browser.',
        adminPasteHint:
          'Admin allowlist may paste a Page Access Token to extend access. Tokens are never shown again after save.',
        tokenExpiredUser:
          'Facebook Page token expired or missing permissions. Contact admin or reconnect via OAuth under Content → Connect channels.',
        tokenExpiredAdmin:
          'Page Access Token expired or missing permissions — Meta cannot deliver messages. Paste a new token below then reconnect.',
        messengerLabel: 'Messenger',
        defaultPageName: 'Facebook Page',
        botPageLabel: 'Bot / Facebook Page',
        pageNamePrefix: (name: string) => ` · Facebook Page ${name}`,
        webhookNotRegisteredInline: '· webhook not subscribed',
        webhookOkInline: '· webhook OK',
        aiOnInline: 'AI on',
        aiOffInline: 'AI off',
        diag: {
          tokenPage: 'Page token',
          tokenValid: 'valid',
          tokenExpired: 'EXPIRED / MISSING PERMISSIONS',
          tokenDecodeFailed: 'decode error',
          tokenMissing: 'missing',
          webhookVerify: 'Webhook verify',
          configured: 'configured',
          notConfigured: 'missing',
          bot: 'Bot',
          botActive: 'ACTIVE',
          botNotActive: 'not ACTIVE',
          ai: 'AI',
          aiOn: 'on',
          aiOff: 'off',
          subscribedApps: 'subscribed_apps',
          webhookRegistered: 'subscribed',
          webhookNotRegistered: 'not subscribed',
          realtime: 'Realtime',
          lastMessageReceived: 'Last message received',
          neverReceived: 'never received',
          lastError: 'Latest error',
          none: 'none',
          callbackUrl: 'Callback URL',
          visitorAvatar: 'Messenger visitor avatar',
          avatarOk: 'Meta allows profile photos (profile_pic)',
          avatarBlocked:
            'Meta blocked photos — App Review «Business Asset User Profile Access» required',
          avatarNoData: 'no conversations to verify yet',
          avatarUnchecked: 'not checked yet',
          standardAccessError: 'MESSENGER_STANDARD_ACCESS (Advanced Access not granted)',
          missingScopeError: 'MISSING_SCOPE (reconnect OAuth)',
        },
        form: {
          pageIdPlaceholder: 'Page ID (e.g. 1234567890)',
          pageTokenPlaceholder: 'New Page Access Token (required if token expired)',
          pageNamePlaceholder: 'Page name (optional)',
        },
      },
      ads: {
        title: 'Meta Ads',
        connectOAuth: 'Connect with OAuth',
        disconnect: 'Disconnect',
        reconnectHint: 'Please reconnect',
        missingScopes: (scopes: string[]) =>
          `Missing: ${scopes.join(', ')} — reconnect OAuth`,
        readOnlyHint:
          'Reports remain available; all write actions (create/edit/pause) are blocked.',
        adsRead: 'ads_read',
        adsManagement: 'ads_management',
        businessManagement: 'business_management',
        loading: 'Loading connections...',
        noPermission: 'You do not have ads.connect permission',
        lastSync: (when: string) => `Last sync: ${when}`,
      },
    } as const;
  }

  return {
    fanpage: {
      title: 'Kết nối Facebook Fanpage',
      subtitle:
        'Đăng nhập Facebook để kết nối và quản lý các Fanpage bạn được cấp quyền.',
      pagesYouManage: 'Fanpage bạn được quản lý',
      selectPagesTitle: 'Chọn Fanpage muốn kết nối',
      connectedPage: 'Fanpage đã kết nối',
      connectedPages: (n: number) => `Fanpage đã kết nối (${n})`,
      connectedBadge: 'Đã kết nối',
      connectFacebook: 'Kết nối Facebook',
      reconnectFacebook: 'Kết nối lại Facebook',
      reconnect: 'Kết nối lại',
      refreshPages: 'Làm mới Fanpage',
      selectMorePages: 'Chọn thêm Fanpage',
      disconnectAll: 'Ngắt tất cả',
      disconnectPage: 'Ngắt kết nối',
      connectSelected: 'Kết nối Fanpage đã chọn',
      close: 'Đóng',
      viewDetails: 'Xem chi tiết',
      syncPageInfo: 'Đồng bộ thông tin Fanpage',
      loadingChannels: 'Đang tải kết nối kênh...',
      loadingPages: 'Đang tải danh sách Fanpage từ Facebook...',
      oauthSuccessSelect:
        'Đăng nhập Facebook thành công — chọn Fanpage muốn kết nối.',
      oauthConnected: 'Đã kết nối Facebook Fanpage thành công!',
      oauthUnavailable:
        'Kết nối Facebook OAuth chưa sẵn sàng trên tài khoản này. Liên hệ quản trị nếu cần bật quyền kết nối Fanpage.',
      selectAtLeastOne: 'Hãy chọn ít nhất một Fanpage để kết nối.',
      noPagesToShow: 'Không có Fanpage để hiển thị.',
      noPagesManaged:
        'Không có Fanpage nào mà tài khoản này được phép quản lý.',
      missingPermission:
        'Facebook chưa cấp đủ quyền (pages_show_list / pages_read_engagement / pages_manage_posts).',
      missingScopes: (scopes: string[]) => `Thiếu: ${scopes.join(', ')}`,
      tokenExpired: 'Phiên OAuth không còn hiệu lực — bấm Kết nối lại Facebook.',
      metaApiError: 'Lỗi khi gọi Facebook API.',
      lastError: (msg: string) => `Lỗi gần nhất: ${msg}`,
      accountLabel: (name: string) => `Tài khoản: ${name}`,
      noPagesSelected:
        'Chưa có Fanpage được chọn — bấm Kết nối Facebook hoặc Chọn thêm Fanpage.',
      lastSynced: (when: string) =>
        `Cập nhật lần cuối: ${when} · Dữ liệu được cập nhật trực tiếp từ Facebook`,
      notSyncedYet: 'Chưa đồng bộ từ Facebook',
      latestPost: (when: string) => `Bài đăng mới nhất: ${when}`,
      syncError: (msg: string) => `Lỗi đồng bộ: ${msg}`,
      syncSuccess: (when?: string) =>
        when
          ? `Đồng bộ thành công từ Facebook\nCập nhật lần cuối: ${when} · Dữ liệu được cập nhật trực tiếp từ Facebook`
          : 'Đồng bộ thành công từ Facebook',
      syncSuccessToast: 'Đồng bộ từ Facebook thành công',
      permissionOk: 'Đủ quyền quản lý',
      permissionMissingPost: 'Thiếu quyền đăng bài',
      permissionFromFacebook: 'Quyền từ Facebook',
      permissionLabel: (text: string) => `Quyền: ${text}`,
      pageId: (id: string) => `Page ID: ${id}`,
      selectMoreHint: 'Chọn thêm Fanpage từ tài khoản Facebook đã đăng nhập.',
      scopeShowListTitle: 'Quyền pages_show_list',
      scopeShowListBody:
        'MarketingAutoAZ sử dụng quyền pages_show_list để hiển thị những Fanpage mà người dùng được Facebook cho phép quản lý. Người dùng tự chọn Fanpage muốn kết nối. Hệ thống không tự động kết nối hoặc đăng bài lên Fanpage chưa được chọn.',
      scopeReadEngagementTitle: 'Quyền pages_read_engagement',
      scopeReadEngagementBody:
        'Nút Đồng bộ thông tin Fanpage và Làm mới từ Facebook gọi Facebook Graph API bằng Page Access Token (quyền pages_read_engagement) để đọc metadata Page và bài viết do chính Fanpage đã đăng. Auto Post vẫn dùng riêng quyền pages_manage_posts để đăng bài.',
      detailsTitle: 'Chi tiết Fanpage',
      detailsSubtitle:
        'Dữ liệu và bài viết từ lần đồng bộ Facebook gần nhất (pages_read_engagement)',
      defaultPageName: 'Fanpage',
      noCover: 'Chưa có ảnh bìa từ Facebook',
      pageInfo: 'Thông tin trang',
      postsFromFacebook: 'Bài viết từ Facebook',
      refreshFromFacebook: 'Làm mới từ Facebook',
      noPosts:
        'Fanpage chưa có bài viết do chính Page đăng (published_posts).',
      postsError: (msg: string) => `Không lấy được bài viết từ Facebook: ${msg}`,
      postsHiddenApiError:
        'Không hiển thị bài viết vì Facebook API lỗi — không dùng dữ liệu cũ.',
      openOnFacebook: 'Mở bài trên Facebook',
      graphEndpoints: 'Facebook Graph API đã gọi',
      noDetailsYet:
        'Chưa có thông tin chi tiết. Bấm Đồng bộ thông tin Fanpage để gọi Facebook API.',
      syncFailed: 'Không đồng bộ được từ Facebook',
      syncFailedKeepOld:
        'Facebook Graph API trả lỗi. Dữ liệu cũ được giữ nguyên.',
      syncFailedKeepPrevious:
        'Không đồng bộ được từ Facebook. Đang giữ dữ liệu lần trước.',
      syncing: 'Đang đồng bộ thông tin Fanpage từ Facebook...',
      loadingSynced: 'Đang tải dữ liệu đã đồng bộ...',
      retryFromFacebook: 'Thử lại từ Facebook',
      empty: 'Chưa có thông tin',
      connectFailed: 'Kết nối Facebook thất bại',
      pageListRefreshed: 'Đã làm mới danh sách Fanpage.',
      refreshFailed: 'Không thể làm mới Fanpage',
      facebookDisconnected: 'Đã ngắt kết nối Facebook.',
      disconnectFacebookFailed: 'Không thể ngắt kết nối Facebook',
      pageDisconnected: 'Đã ngắt kết nối Fanpage.',
      disconnectPageFailed: 'Không thể ngắt kết nối Fanpage',
      savePagesPartial: (ok: number, fail: number, reasons: string) =>
        `Đã lưu ${ok} Fanpage; ${fail} trang thất bại. ${reasons}`,
      savePagesSuccess: (ok: number) => `Đã kết nối ${ok} Fanpage đã chọn.`,
      savePagesFailed: 'Không thể lưu Fanpage đã chọn',
      loadPagesFailed: 'Không tải được danh sách Fanpage',
      syncFailedKeepOldAction:
        'Không đồng bộ được từ Facebook. Dữ liệu cũ được giữ nguyên.',
      postedAt: 'Thời gian đăng:',
      videoNoThumbnail: 'Bài video — không có thumbnail',
      noImage: 'Không có ảnh',
      pageNameLabel: 'Tên Page',
      categoryLabel: 'Danh mục',
      facebookLinkLabel: 'Link Facebook',
      phoneLabel: 'Điện thoại',
      locationLabel: 'Địa điểm',
      followersLabel: 'Người theo dõi',
      likesLabel: 'Lượt thích',
      aboutLabel: 'Giới thiệu',
      descriptionLabel: 'Mô tả',
      envOauthConnected:
        'Đã kết nối Fanpage bằng Page Token trên server (không cần OAuth).',
      envPageTokenBanner:
        'Server đã cấu hình Page Token — có thể đồng bộ Fanpage môi trường (admin).',
      envAccountLabel: (name: string) => `Fanpage (token máy chủ): ${name}`,
    },
    autoPost: {
      title: 'Kết nối Facebook Fanpage',
      connectedHint:
        'Fanpage đã kết nối — có thể đăng bài từ thư viện hoặc đăng thủ công.',
      notConnectedHint:
        'Kết nối Fanpage tại tab Kết nối kênh. Token không nhập trên trình duyệt.',
      connectChannels: 'Kết nối kênh',
      checkConnection: 'Kiểm tra kết nối',
      checkingConnection: 'Đang kiểm tra kết nối Fanpage...',
      statusLabel: 'Trạng thái',
      pageNameLabel: 'Tên Fanpage',
      connectedStatus: 'Kết nối thành công',
      notConnectedStatus: 'Chưa kết nối',
      connectSuccess: (names: string) => `Kết nối thành công — ${names}`,
      connectSuccessGeneric: 'Kết nối thành công.',
      notConnectedError:
        'Chưa kết nối Fanpage. Vào tab Kết nối kênh để đăng nhập Facebook.',
      checkFailed: 'Không kiểm tra được kết nối Fanpage',
      notConnectedBanner: 'Chưa kết nối Facebook.',
      connectBeforePublish: 'trước khi đăng bài.',
      selectPage: 'Chọn Fanpage',
      selectPagePlaceholder: 'Chọn Fanpage',
      loadingPages: 'Đang tải Fanpage...',
      selectPageRequired:
        'Vui lòng chọn Fanpage — kết nối tại tab Kết nối kênh nếu chưa có',
      publishConfirm:
        'Bạn đã duyệt nội dung và muốn đăng ngay lên Fanpage?',
      publishConfirmCancel: 'Hủy',
      publishSuccess: 'Đã đăng bài thành công!',
      publishSuccessToast: 'Đăng lên Facebook thành công',
      viewOnFacebook: 'Xem trên Facebook',
      facebookPostId: (id: string) => `Facebook Post ID: ${id}`,
      publishedAt: (when: string) => `Đăng lúc: ${when}`,
      publishingToPage: 'Đăng lên',
      sourcePrefix: 'Nguồn:',
      captionReviewLabel: 'Caption (duyệt trước khi đăng)',
      pickPostPreviewEmpty: 'Chọn bài để xem preview.',
      pickFromLibraryHeading: 'Chọn bài từ thư viện',
      postFromLibraryTab: 'Đăng từ thư viện',
      manualPostTab: 'Đăng thủ công',
      categoryAdSales: 'Quảng cáo bán hàng',
      categoryBrandBuilding: 'Xây dựng thương hiệu',
      categoryAdvanced: 'Viết bài nâng cao',
      selectPostBeforeSave: 'Chọn bài và kiểm tra nội dung trước khi lưu',
      selectPostFromLibrary: 'Vui lòng chọn bài từ thư viện',
      pickerEmptyCreateHint:
        'Chưa có bài từ AI Marketing. Hãy tạo bài tại tab Tạo Content trước.',
      pickerCreateContent: 'Tạo Content',
      contentScore: (n: number) => `Điểm: ${Math.round(n)}/100`,
      untitledFallback: 'Không có tiêu đề',
      scheduleSuccess: 'Đã lên lịch đăng bài! Xem tại tab Lịch đăng.',
      previewPageFallback: 'Fanpage spa',
      previewFacebook: 'Preview Facebook',
      previewJustNow: 'Vừa xong · 🌐',
      previewEmptyCaption: 'Nội dung bài đăng sẽ hiển thị ở đây...',
      libraryPublishHint:
        'Thư viện lưu các bài đã duyệt từ AI. Chọn bài để sửa hoặc gửi sang tab Auto Post để đăng Fanpage.',
      libraryTitle: 'Thư viện bài viết',
      libraryEmptyAd:
        'Chưa có bài quảng cáo — tạo tại tab Tạo Content hoặc lưu vào thư viện',
      libraryEmptyAdvanced: 'Chưa có bài nâng cao — tạo tại tab Tạo Content',
      libraryEmptyPersonal:
        'Chưa có bài thương hiệu — tạo tại tab Xây dựng thương hiệu',
      pickFromLibrary: 'Chọn bài từ thư viện',
      refresh: 'Làm mới',
      pageLabel: 'Fanpage *',
      syncFromAutoPost: 'Đồng bộ Fanpage từ Auto Post',
      syncFailed: 'Đồng bộ thất bại',
      connectRenew: 'Kết nối / Gia hạn Fanpage',
      disconnect: 'Ngắt kết nối',
      connecting: 'Đang kết nối…',
      manualWorkflowHint:
        'Nhập nội dung → chọn Fanpage → chỉnh thời gian (thanh dưới) → đăng ngay hoặc lên lịch.',
      libraryWorkflowHint:
        'Chọn bài từ thư viện → duyệt/sửa caption → chọn Fanpage → chọn thời gian (thanh dưới) → lên lịch hoặc đăng ngay.',
      scheduleDeleteConfirm:
        'Xóa bài này khỏi lịch đăng trên web? Bài đã đăng trên Facebook sẽ không bị xóa.',
      historyPageColumn: 'Fanpage',
      historyEmpty: 'Chưa có bài đăng nào. Tạo bài và lưu nháp hoặc đăng để xem lịch sử.',
      captionRequired: 'Nội dung bài đăng không được trống.',
      draftSaved: 'Đã lưu nháp đăng bài!',
      schedulePanelIntro:
        'Theo dõi bài đã lên lịch, đang đăng, đã đăng hoặc lỗi. Worker hệ thống tự đăng bài đúng giờ sau khi bạn duyệt.',
      scheduleTitle: 'Lịch đăng & lịch sử',
      loadingSchedule: 'Đang tải lịch đăng...',
      historyColSubject: 'Chủ đề',
      historyColType: 'Loại',
      historyColStatus: 'Trạng thái',
      historyColSchedule: 'Lịch / Đăng',
      historyColActions: 'Thao tác',
      statusFilterAll: 'Tất cả trạng thái',
      retry: 'Thử lại',
      cancelSchedule: 'Hủy lịch',
      delete: 'Xóa',
      viewPost: 'Xem bài viết',
      scheduleSuggestHint:
        'Đã gợi ý thời gian +1 giờ ở thanh dưới. Kiểm tra rồi bấm “Lên lịch đăng” lại.',
      scheduleInvalid: 'Thời gian lên lịch không hợp lệ. Chọn lại trên thanh dưới.',
      scheduleFutureRequired:
        'Thời gian phải ở tương lai. Đã gợi ý +1 giờ — kiểm tra rồi bấm Lên lịch đăng lại.',
      scheduleConfirm: (when: string) => `Lên lịch đăng lúc ${when}?`,
      contentLabel: 'Nội dung *',
      contentPlaceholder:
        'Gõ hoặc dán nội dung bài đăng (tiếng Việt, emoji, xuống dòng)...',
      closeAria: 'Đóng',
      saveDraft: 'Lưu nháp',
      publishNow: 'Đăng ngay',
      schedulePost: 'Lên lịch đăng',
      scheduleAtLabel: 'Thời gian đăng',
      imageUrlLabel: 'URL ảnh (tuỳ chọn)',
      linkUrlLabel: 'URL liên kết (tuỳ chọn)',
      linkLandingLabel: 'Link landing (tuỳ chọn)',
      composeTitle: 'Soạn bài',
      publishSetupTitle: 'Thiết lập đăng',
      statusDraft: 'Nháp',
      statusPending: 'Chờ duyệt',
      statusScheduled: 'Đã lên lịch',
      statusPublishing: 'Đang đăng',
      statusPublished: 'Đã đăng',
      statusFailed: 'Lỗi',
      statusCancelled: 'Đã hủy',
      envPageNameFallback: 'Fanpage (server)',
    },
    messenger: {
      connectPage: 'Kết nối trang Facebook',
      inboxHint: 'Nhận tin nhắn từ trang Facebook — kết nối bên dưới.',
      webhookReady: 'Fanpage đã kết nối và webhook sẵn sàng nhận tin Messenger.',
      webhookMissingScope:
        'Token thiếu scope (pages_messaging / pages_manage_metadata). Kết nối lại Facebook OAuth để cấp token mới.',
      webhookStandardAccess:
        'Token và webhook OK, nhưng Meta App chưa có Advanced Access pages_messaging — chỉ trả lời được Admin/Developer/Tester.',
      webhookNotSubscribed:
        'Fanpage đã kết nối nhưng chưa subscribe webhook — bấm Kết nối lại.',
      serverConfiguredSelectBot:
        'Hệ thống đã cấu hình Page. Chọn chatbot rồi bấm Kết nối.',
      notConfiguredPaste:
        'Chưa cấu hình Fanpage. Nhập Page ID + Page Access Token bên dưới.',
      notConfigured:
        'Chưa cấu hình Fanpage. Dùng «Kết nối Facebook» tại Nội dung → Kết nối kênh.',
      connectAtChannels: 'Kết nối Facebook',
      connectViaOAuth:
        'Kết nối Fanpage qua OAuth tại Nội dung → Kết nối kênh. Không nhập Page Access Token trên trình duyệt.',
      adminPasteHint:
        'Admin/allowlist có thể dán Page Access Token để gia hạn. Token không hiển thị lại sau khi lưu.',
      tokenExpiredUser:
        'Token Fanpage hết hạn / thiếu quyền. Liên hệ admin hoặc kết nối lại qua OAuth tại Nội dung → Kết nối kênh.',
      tokenExpiredAdmin:
        'Page Access Token đã hết hạn / thiếu quyền — Meta không gửi tin về hệ thống. Dán token mới bên dưới rồi Kết nối lại.',
      messengerLabel: 'Messenger',
      defaultPageName: 'Fanpage',
      botPageLabel: 'Bot / Fanpage',
      pageNamePrefix: (name: string) => ` · Fanpage ${name}`,
      webhookNotRegisteredInline: '· webhook chưa đăng ký',
      webhookOkInline: '· webhook OK',
      aiOnInline: 'AI bật',
      aiOffInline: 'AI tắt',
      diag: {
        tokenPage: 'Token Page',
        tokenValid: 'hợp lệ',
        tokenExpired: 'HẾT HẠN / THIẾU QUYỀN',
        tokenDecodeFailed: 'lỗi giải mã',
        tokenMissing: 'thiếu',
        webhookVerify: 'Webhook verify',
        configured: 'đã cấu hình',
        notConfigured: 'thiếu',
        bot: 'Bot',
        botActive: 'ACTIVE',
        botNotActive: 'chưa ACTIVE',
        ai: 'AI',
        aiOn: 'bật',
        aiOff: 'tắt',
        subscribedApps: 'subscribed_apps',
        webhookRegistered: 'đã đăng ký',
        webhookNotRegistered: 'chưa đăng ký',
        realtime: 'Realtime',
        lastMessageReceived: 'Lần nhận tin gần nhất',
        neverReceived: 'chưa nhận',
        lastError: 'Lỗi gần nhất',
        none: 'không',
        callbackUrl: 'Callback URL',
        visitorAvatar: 'Avatar khách Messenger',
        avatarOk: 'Meta cho phép lấy ảnh thật (profile_pic)',
        avatarBlocked:
          'Meta chặn ảnh — cần App Review «Business Asset User Profile Access»',
        avatarNoData: 'chưa có hội thoại để kiểm tra',
        avatarUnchecked: 'chưa kiểm tra',
        standardAccessError: 'MESSENGER_STANDARD_ACCESS (chưa Advanced Access)',
        missingScopeError: 'MISSING_SCOPE (reconnect OAuth)',
      },
      form: {
        pageIdPlaceholder: 'Page ID (vd: 1234567890)',
        pageTokenPlaceholder: 'Page Access Token mới (bắt buộc nếu token hết hạn)',
        pageNamePlaceholder: 'Tên trang (tuỳ chọn)',
      },
    },
    ads: {
      title: 'Meta Ads',
      connectOAuth: 'Kết nối OAuth',
      disconnect: 'Ngắt kết nối',
      reconnectHint: 'Vui lòng kết nối lại',
      missingScopes: (scopes: string[]) =>
        `Thiếu: ${scopes.join(', ')} — kết nối lại OAuth`,
      readOnlyHint:
        'Báo cáo vẫn xem được; mọi thao tác ghi (tạo/sửa/pause) bị khóa.',
      adsRead: 'ads_read',
      adsManagement: 'ads_management',
      businessManagement: 'business_management',
      loading: 'Đang tải kết nối...',
      noPermission: 'Bạn không có quyền ads.connect',
      lastSync: (when: string) => `Sync lần cuối: ${when}`,
    },
  } as const;
}

export const FACEBOOK_REVIEW_REQUIRED_EN_PHRASES = [
  'Connect Facebook Pages',
  'Facebook Pages you manage',
  'Select Facebook Pages to connect',
  'Connected Facebook Page',
  'PAGES_SHOW_LIST PERMISSION',
  'PAGES_READ_ENGAGEMENT PERMISSION',
  'Facebook authorization is not complete. Please reconnect Facebook.',
] as const;

export const FACEBOOK_VI_FORBIDDEN_IN_EN = [
  'Kết nối Facebook Fanpage',
  'Chọn Fanpage',
  'Fanpage đã kết nối',
  'Quyền pages_show_list',
  'Đăng nhập Facebook thành công',
  'Chưa hoàn tất đăng nhập Facebook',
  'Ngắt kết nối',
  'Đồng bộ thông tin Fanpage',
  'Nội dung bài đăng không được trống',
  'Đã lưu nháp đăng bài',
  'Lưu nháp đăng',
  'Lên lịch đăng',
  'Chủ đề',
  'Tất cả trạng thái',
  'Đang tải lịch đăng',
  'Thư viện bài viết',
  'Tạo Content',
  'Content Studio — tạo nội dung',
] as const;
