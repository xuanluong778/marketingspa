# Lead CRM UX Upgrade (Prompt UI)

## Phase 1 — Layout / Filter / Kanban / Card / Drawer / Responsive

### Components mới
- `lead-page-header.tsx` — tiêu đề + 4 KPI + Import/Export/Thêm
- `lead-filter-bar.tsx` — filter chính + drawer nâng cao + chips
- `lead-card.tsx` — card gọn + hover actions + mobile status menu
- `lead-kanban.tsx` — cột ~300px, scroll ngang, sticky header, load-more
- `lead-detail-drawer.tsx` — Sheet phải, lazy fetch khi mở
- `ui/checkbox.tsx` — chọn nhiều dòng bảng

### Page
- `apps/web/src/app/(app)/leads/page.tsx` — orchestration mới

### Test Phase 1
- Filter chip + debounce (client)
- Kanban/table cùng `filterQuery`
- Drawer `enabled: open && !!leadId`
- Mobile: 1 cột + menu đổi TT

## Phase 2 — API Kanban / Cursor / Saved view / Bulk / Optimistic

### Migration
- `20260722230000_lead_saved_views` → bảng `lead_saved_views`

### API mới
| Method | Path | Permission |
|--------|------|------------|
| GET | `/leads/kanban` | lead.read |
| GET | `/leads/kanban/:status` | lead.read |
| POST | `/leads/bulk` | lead.write |
| GET/POST | `/leads/saved-views` | read/write |
| PATCH/DELETE | `/leads/saved-views/:id` | lead.write |

### Hooks
- `useLeadKanban`, optimistic `useUpdateLeadStatus`, saved views, bulk

### Test
```bash
pnpm test:leads-ux
pnpm --filter @marketingspa/api build
pnpm --filter @marketingspa/web build
```

## Rollback
1. Revert UI files / page.tsx về commit trước
2. Tắt routes mới trong controller nếu cần
3. DB: `DROP TABLE IF EXISTS lead_saved_views;`
4. Restart api + web

## Rủi ro
- Bulk đổi sang LOST có thể yêu cầu `lostReason` (API hiện có)
- Import CSV mới là placeholder
- Optimistic drag phụ thuộc queryKey `['leads','kanban']`
