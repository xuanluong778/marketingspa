# Prompt 1 — Thiết kế AI Assistant / Trợ lý điều hành

**Trạng thái:** thiết kế only (Prompt 1)  
**Phạm vi:** lập kế hoạch · data contracts · security rules  
**Không làm trong bước này:** code · migration · wire UI · deploy  
**Không sửa:** Chatbot CSKH · Ads MCP · logic domain hiện có (CRM, finance, work, HRM…)

---

## 1. Mục tiêu & ranh giới sản phẩm

### 1.1 Đối tượng

Trợ lý điều hành phục vụ **người dùng nội bộ của organization (doanh nghiệp đa ngành)** — không giới hạn spa. Mọi dữ liệu và quyền trong **một tenant** = `organizationId` trên JWT của user.

Ví dụ ngành: spa/salon, giáo dục, thương mại, dịch vụ… — cùng multi-tenant CRM / đơn hàng / việc / NV / Ads / inbox.

### 1.2 Mục tiêu

- Trả lời câu hỏi vận hành nội bộ bằng cách gọi **tool đã đăng ký**, không truy cập database trực tiếp.
- Tôn trọng **RBAC + tenant isolation** giống (và chặt hơn) API hiện có.
- Tách hoàn toàn channel **Chatbot CSKH** (trả lời khách trên web/Messenger).

### 1.3 Ranh giới

| | **Trợ lý điều hành** | **Chatbot CSKH (giữ nguyên, không sửa)** |
|--|----------------------|------------------------------------------|
| Audience | User nội bộ org (đa ngành) | Khách hàng end-user |
| Kênh | JWT app (`/assistant/*` — implement sau) | Widget public, FB webhook, inbox staff CSKH |
| Lịch sử chat | Bảng `assistant_*` (đề xuất) | `chatbot_conversations` / `chatbot_messages` |
| Ghi dữ liệu (phase-1) | **Read-only tools** | Bot reply / takeover (ngoài scope) |
| AI free-text | Chỉ tóm tắt từ **tool result**; cấm bịa số | Logic CSKH hiện có (không đụng) |

### 1.4 Tái sử dụng (không refactor domain)

- `OpenAiService` (inject only).
- `AuthUser` + `JwtAuthGuard` + `TenantGuard` + `PermissionsGuard`.
- Pattern tool/RBAC của **Ads MCP** (tham chiếu design) — **không sửa** `apps/api/src/ads-mcp/**` hay `@marketingspa/shared` ads-mcp schemas hiện có; phase implement *thêm* registry assistant riêng (có thể *gọi* gateway qua adapter).
- Domain services: `CustomersService`, `LeadsService`, `FinanceService`, `WorkManagementService`, HRM/Employees, CSKH **inbox read** methods, Ads MCP gateway (delegate).

---

## 2. Kiến trúc (không đổi ý chính)

```
Client (sau này) ──JWT──► AssistantController
                              │
                    AssistantOrchestrator (LLM + tool loop)
                              │
                    ToolRegistry + ToolRuntime
                       │  (ctx, RBAC, PII mask, timeout)
          ┌────────────┼────────────┬──────────┬──────────┐
          ▼            ▼            ▼          ▼          ▼
     CRM services  Finance     Work/HRM   AdsMcpGw*  CSKH inbox*
                              (read)     (delegate) (read only)
* không sửa module nguồn; chỉ call method
```

**Cấm:** tool handler import `PrismaService` để query domain (chỉ persistence assistant session/audit dùng Prisma trong module assistant).

---

## 3. Auth, tenant & RBAC (cập nhật)

### 3.1 Context bắt buộc trên mọi tool

```ts
AssistantToolContext = {
  userId: uuid;            // từ JWT AuthUser.id — không tin LLM
  organizationId: uuid;    // từ JWT AuthUser.organizationId — không tin LLM / body
  timezone: string;        // IANA (vd Asia/Ho_Chi_Minh)
  role: string;
  permissions: string[];
  employeeId?: uuid | null;
  locale: string;          // default 'vi'
  requestId: uuid;         // trace / audit
  // derived, không từ client:
  piiReveal: { phone: boolean; email: boolean; /* … */ };
}
```

Nguồn:

| Field | Nguồn hợp lệ |
|-------|----------------|
| `userId`, `organizationId`, `role`, `permissions`, `employeeId` | `AuthUser` sau JWT validate |
| `timezone` | (1) org setting nếu có; (2) header client IANA đã whitelist; (3) default `Asia/Ho_Chi_Minh` |
| `organizationId` trong body/query/LLM args | **Bị bỏ qua / từ chối** nếu khác JWT |

### 3.2 OWNER / SUPER_ADMIN — chỉ bypass permission

| Bypass được | Không bao giờ bypass |
|-------------|----------------------|
| Kiểm tra **permission code** (`assistant.use`, `lead.read`, …) giống `PermissionsGuard` hiện tại (OWNER / SUPER_ADMIN) | **Tenant isolation** |
| | Lọc `where: { organizationId }` |
| | Đọc/ghi cross-org |
| | Tool args có `organizationId` khác JWT |

**Luật cứng:** OWNER và SUPER_ADMIN **vẫn** bị ràng buộc `organizationId` của token (và `TenantGuard`). SUPER_ADMIN platform cross-tenant chỉ tồn tại ở module `/admin` platform — **không** áp dụng vào Trợ lý điều hành.

Orchestrator / ToolRuntime pseudo:

```
assert organizationId === authUser.organizationId  // always
if (!OWNER && !SUPER_ADMIN) assert hasPermission(required)
// OWNER/SUPER_ADMIN: skip permission string check only
// still: never query without org filter; never accept foreign orgId
```

### 3.3 Permissions (seed đề xuất — chưa implement)

| Code | Mô tả |
|------|--------|
| `assistant.use` | Mở chat Trợ lý, gọi orchestrator |
| `assistant.admin` | (phase 2) audit org-wide / quản trị session |
| `chatbot.inbox.read` | **Mới:** đọc inbox fanpage/CSKH qua tool `inbox.*` (staff observe). Không cấp quyền gửi tin / bot public. |

| Tool family | Permissions bắt buộc (AND) |
|-------------|----------------------------|
| Hầu hết tool domain | `assistant.use` **và** perm domain (`customer.read`, `lead.read`, `order.read`, `work.*`, `ads.read` / `ads.analyze`, `hrm.employee.read`, …) |
| `inbox.*` | **`assistant.use` AND `chatbot.inbox.read`** (bắt buộc cả hai; OWNER chỉ bypass *check string* nhưng vẫn 1 tenant) |

Default grant gợi ý (product, chưa hardcode):

- `assistant.use`: OWNER, MANAGER (+ SALE/MARKETING tuỳ gói).
- `chatbot.inbox.read`: OWNER, MANAGER, SALE (và role đang vận hành inbox); **không** gắn mặc định cho mọi role có `assistant.use`.

Không đổi permission CSKH endpoint hiện tại trong Prompt 1; seed `chatbot.inbox.read` chỉ phục vụ tool assistant (và có thể gắn sau lên API inbox nếu product thống nhất).

---

## 4. PII & che dữ liệu (cập nhật)

### 4.1 Mặc định mask

Trước khi tool result đến LLM **và** trước khi trả UI, mask:

| Field | Mặc định (không đủ quyền reveal) | Ví dụ |
|-------|----------------------------------|--------|
| Phone | Mask | `09****678` |
| Email | Mask local-part | `ng***@domain.com` |
| CCCD/CMND, tax id | Redact | `[REDACTED]` |
| Message body khách (inbox) | Preview rút gọn + mask PII trong text | |

### 4.2 Reveal đầy đủ

Chỉ khi user có quyền **phù hợp** (đề xuất product, map phase implement):

| PII | Gợi ý perm (chưa chốt seed phụ) |
|-----|----------------------------------|
| Phone/email khách CRM | `customer.read` **và** flag/permission reveal PII org (vd `assistant.pii.reveal` *hoặc* OWNER-only explicit) — **không** coi OWNER bypass tenant; vẫn 1 org |
| Inbox identifiers | `chatbot.inbox.read` + cùng policy reveal |

Thiếu quyền → field masked; tool **không** nhét giá trị đầy đủ vào prompt.

### 4.3 Audit log — cấm lưu PII nhạy cảm

`AssistantAuditLog` (đề xuất) chỉ lưu:

- `organizationId`, `userId`, `requestId`, `toolName`, permission outcome, `ok`, `errorCode`, `durationMs`, timestamp  
- Optional: **hashed** entity ids, count metrics  
- **Không:** phone, email, full message body, raw tool args/result có PII  

Session messages: content assistant đã mask; tool payload truncated + redacted.

---

## 5. Chống ảo giác số liệu (cập nhật)

### 5.1 System / orchestrator rules (bắt buộc trong prompt nội bộ)

1. Mọi con số, tiền, %, SLA, số lead/đơn/ads **chỉ** lấy từ `tool.result.data` của lượt hiện tại (hoặc lượt tool trong cùng turn đã verify `ok: true`).
2. Tool **lỗi**, **timeout**, **FORBIDDEN**, **empty**:
   - Trả lời user **rõ ràng**: không có dữ liệu / lỗi quyền / timeout / lỗi hệ thống.
   - **Tuyệt đối không** bịa số, không ước lượng thay số thật, không “điền cho có”.
3. Thiếu tool (user không có perm → tool không expose cho LLM): nói không đủ quyền xem domain đó.
4. So sánh kỳ: chỉ khi tool trả đủ hai kỳ hoặc delta chính thức trong result.

### 5.2 Tool error envelope (đưa nguyên văn ý cho model)

```ts
{
  ok: false,
  code: 'FORBIDDEN' | 'VALIDATION' | 'TIMEOUT' | 'NOT_FOUND' | 'EMPTY' | 'UPSTREAM',
  message: string,       // human, non-PII
  tool: string,
  organizationId: uuid,  // echo JWT org only
  retryable: boolean
}
```

`EMPTY`: query thành công nhưng 0 bản ghi — AI nói “không có dữ liệu trong khoảng…” chứ không bịa.

Orchestrator: nếu sau tool loop không có evidence số → model chỉ được trả lời qualitative / hướng dẫn mở báo cáo qua `links` (nếu có), không invent metrics.

---

## 6. Tool result envelope + `links` (cập nhật)

### 6.1 Envelope chuẩn

```ts
type AssistantToolResult<T> = {
  ok: true;
  tool: string;
  organizationId: string;      // luôn = ctx.organizationId
  timezone: string;
  generatedAt: string;         // ISO
  data: T;                     // đã mask PII theo policy
  evidence?: Array<{
    label: string;
    value: number | string | null;
    unit?: string;
  }>;
  /** Deep-link nội bộ — mở đúng resource trong tenant, có kiểm tra quyền phía web */
  links?: AssistantLink[];
  source: 'AssistantToolRegistry' | 'AdsMcpGateway'; // Ads khi delegate
  pii: {
    masked: boolean;
    revealedFields: string[];  // rỗng nếu full mask
  };
};

type AssistantLink = {
  rel:
    | 'report'
    | 'customer'
    | 'lead'
    | 'order'
    | 'project'
    | 'task'
    | 'employee'
    | 'conversation'
    | 'ads_campaign'
    | 'list';
  label: string;               // UI ngắn, vi
  href: string;                // path app-relative, vd /customers/{id}
  entityType: string;
  entityId?: string;
  /** Gợi ý perm phía client ẩn nút nếu user thiếu quyền (server đã filter khi tạo link) */
  requiredPermission?: string | string[];
};
```

### 6.2 Quy tắc `links`

1. Path **trong app** theo tenant hiện tại (không absolute cross-host lạ; origin do frontend gắn).
2. Chỉ emit link nếu **cùng `organizationId`** và user **có quyền** mở resource (cùng bộ perm đọc tool).
3. Ví dụ mapping (implement sau):

| Tool / entity | `href` gợi ý |
|---------------|--------------|
| Customer | `/customers/{id}` |
| Lead list / funnel | `/leads`, `/funnel` |
| Finance dashboard / orders | `/finance` |
| Work task / project | `/work-management/...` |
| Conversation inbox | `/chatbot-cskh?tab=inbox&conversationId={id}` (hoặc query tương đương hiện UI) |
| Ads | `/ads` (+ campaign query nếu có) |

4. Không gắn token/query PII.  
5. Link không thay thế RBAC server: trang đích vẫn `AuthGuard` + perm UI.

---

## 7. Tool Registry (phase-1 read-only) — cập nhật

### 7.1 Tool definition

```ts
{
  name: string;
  description: string;
  /** AND list; assistant.use always first for all tools */
  permissions: string[];
  mutates: false; // phase-1
  argsSchema: ZodType;
  resultSchema: ZodType;
  maxRows: number;
  maxDateSpanDays: number;
  timeoutMs: number;
  handler(ctx, args): Promise<AssistantToolResult>;
}
```

Runtime AND:

```
permissions.every(p => hasPermission(user, p))
// hasPermission: OWNER/SUPER_ADMIN → true for p; else p ∈ user.permissions
// organizationId always enforced outside this function
```

### 7.2 Catalog

| Tool | Services (reuse, no refactor) | Permissions (AND) | Links điển hình |
|------|-------------------------------|-------------------|-----------------|
| `crm.search_customers` | CustomersService | `assistant.use`, `customer.read` | customer, list `/customers` |
| `crm.get_customer_360` | Customer360Service | `assistant.use`, `customer.read` | customer |
| `crm.list_leads` | LeadsService | `assistant.use`, `lead.read` | lead, list `/leads` |
| `crm.funnel_stats` | PipelineService | `assistant.use`, `lead.read` | report `/funnel` |
| `finance.dashboard` | FinanceService | `assistant.use`, `order.read`* | report `/finance` |
| `finance.list_orders` | FinanceService | `assistant.use`, `order.read`* | order / finance |
| `finance.list_payments` | FinanceService | `assistant.use`, `order.read`* | `/finance` |
| `finance.list_expenses` | FinanceService | `assistant.use`, (`expense.read` \| `order.read`) | `/finance` |
| `work.my_work` | WorkManagementService | `assistant.use`, `work.task.read` | task, list |
| `work.dashboard` | Work insights | `assistant.use`, `work.project.read` | report work dashboard |
| `work.list_projects` | WM | `assistant.use`, `work.project.read` | project |
| `work.list_tasks` | WM | `assistant.use`, `work.task.read` | task |
| `work.calendar` | WM | `assistant.use`, `work.task.read` | calendar |
| `hrm.list_employees` | Employees/HRM | `assistant.use`, `hrm.employee.read` | employee list |
| `hrm.get_employee_summary` | HRM | `assistant.use`, `hrm.employee.read` | employee |
| `ads.*` | **Delegate** AdsMcpGateway (no MCP code change) | `assistant.use` + map `ads.read` / `ads.analyze` | `/ads` |
| `inbox.list_conversations` | CSKH service **read** only | **`assistant.use` + `chatbot.inbox.read`** | conversation list / inbox |
| `inbox.get_conversation` | CSKH service **read** only | **`assistant.use` + `chatbot.inbox.read`** | conversation |

\*Tool layer enforce perm kể cả khi HTTP controller finance chưa gắn decorator.

### 7.3 Limits

```
maxDateSpanDays: 90
maxRows: 50
defaultLimit: 20
timeoutMs: 8_000
maxToolCallsPerTurn: 8
maxChatHistoryMessages: 40
```

Date range: convert theo `ctx.timezone` (local day bound).

---

## 8. API surface (contract only)

| Method | Path | Auth |
|--------|------|------|
| `POST` | `/api/v1/assistant/chat` | JWT + Tenant + `assistant.use` |
| `GET/POST` | `/api/v1/assistant/sessions` | same |
| `GET` | `/api/v1/assistant/sessions/:id` | same + ownership user (hoặc `assistant.admin` sau) |
| `GET` | `/api/v1/assistant/tools` | same (filtered by perm) |

Request chat: `{ sessionId?, message }` — **không** nhận `organizationId`.  
Response: `{ sessionId, messageId, content, toolTraces?, links? }` — `content` không chứa PII unmasked nếu không đủ quyền.

---

## 9. Persistence đề xuất (chưa migration)

- `assistant_sessions` — org + user  
- `assistant_messages` — redacted content  
- `assistant_audit_logs` — **no PII payloads**  

Không dùng bảng `chatbot_*` cho session trợ lý.

---

## 10. File list dự kiến (implement sau Prompt 1)

```
packages/shared/src/assistant-tools.ts          # context, envelope, links, permission maps
packages/database/prisma/schema.prisma          # + assistant_* models (sau)
packages/database/prisma/seed.ts                # assistant.use, assistant.admin, chatbot.inbox.read
apps/api/src/assistant/**
  assistant.module.ts
  assistant.controller.ts
  assistant.orchestrator.service.ts
  assistant.session.service.ts
  assistant.audit.service.ts
  assistant.prompt.ts                           # no-hallucination + tenant rules
  tool-registry/tool-registry.ts
  tool-registry/tool-runtime.ts                 # RBAC permission-only OWNER bypass; never tenant bypass
  tool-registry/context.ts
  tool-registry/pii.ts                          # mask/reveal
  tool-registry/tools/{crm,finance,work,hrm,ads-delegate,inbox}.tools.ts
apps/web …/assistant/…                          # phase UI sau — chưa wire
```

**Không đụng:**

```
apps/api/src/chatbot-cskh/**     # except future read-only method calls
apps/api/src/ads-mcp/**
apps/api/src/finance|work-management|leads|customers/** logic
```

---

## 11. Security rules (checklist)

1. Tenant: mọi query tool scoped `organizationId` JWT; **OWNER/SUPER_ADMIN không bypass tenant**.  
2. Permission: OWNER/SUPER_ADMIN chỉ bypass **permission check**.  
3. Không Prisma domain trong tool.  
4. Không tin `organizationId` / `userId` từ LLM args.  
5. PII mask mặc định; reveal theo quyền; **audit không lưu PII**.  
6. Tool fail / timeout / empty → AI nói rõ, **không bịa số liệu**.  
7. `inbox.*` cần `assistant.use` **và** `chatbot.inbox.read`.  
8. `links` chỉ entity cùng tenant + đủ quyền.  
9. Phase-1 không write domain / không gửi tin khách / không ads action approve.  
10. Tách session, prompt, route khỏi CSKH.

---

## 12. Phased delivery (sau Prompt 1)

| Phase | Việc | UI / deploy |
|-------|------|-------------|
| **Prompt 1** (doc này) | Thiết kế + contracts | Không |
| 2 | Shared contracts + module + tools read + tests | API only |
| 3 | Web `/assistant` + nav | Có UI |
| 4 | Write-with-confirm (optional) | Optional |

---

## 13. Đồng bộ 6 điểm sửa (Prompt 1 delta)

| # | Yêu cầu | Mục doc |
|---|---------|---------|
| 1 | Phạm vi org đa ngành, không “spa” | §1.1, §1.2 |
| 2 | OWNER/SUPER_ADMIN chỉ bypass permission, không bypass tenant | §3.2, §11 |
| 3 | `chatbot.inbox.read` + `inbox.*` = `assistant.use` ∧ `chatbot.inbox.read` | §3.3, §7.2 |
| 4 | Mask PII mặc định; reveal có quyền; audit không sensitive | §4 |
| 5 | Lỗi/timeout/empty: báo rõ, không bịa số | §5 |
| 6 | `links` trong result envelope | §6, §7.2 |

---

## 14. Việc không làm trong Prompt 1

- Không code, migration, seed apply, UI, deploy  
- Không sửa Chatbot CSKH, Ads MCP, domain services  
- Không mở public endpoint assistant  
