'use client';

import type { ReactNode } from 'react';
import {
  FUNNEL_AUTOMATION_TRIGGERS,
  FUNNEL_BOOKING_EVENTS,
  FUNNEL_CANVAS_EVENTS,
  FUNNEL_CONVERSION_CODES,
  readCanvasNodeMeta,
  type FunnelCompleteConnection,
  type FunnelCompleteNode,
  type FunnelCompleteSpec,
  type FunnelNodeType,
} from '@marketingspa/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAutomationFlows } from '@/hooks/use-automation';
import { usePipelineStages } from '@/hooks/use-funnel-builder';
import {
  CANVAS_BOOKING_LABEL,
  CANVAS_CONDITION_FIELD_LABEL,
  CANVAS_CONDITION_OP_LABEL,
  CANVAS_CONVERSION_LABEL,
  canvasEventLabel,
  canvasStepLabel,
} from '@/lib/funnel-canvas-labels';
import type { FunnelStageRow } from '@/types/funnel';

const NONE = '__none__';

const CONDITION_FIELDS = [
  { value: 'score', label: CANVAS_CONDITION_FIELD_LABEL.score },
  { value: 'qualification', label: CANVAS_CONDITION_FIELD_LABEL.qualification },
  { value: 'stage', label: CANVAS_CONDITION_FIELD_LABEL.stage },
  { value: 'event', label: CANVAS_CONDITION_FIELD_LABEL.event },
  { value: 'conversion', label: CANVAS_CONDITION_FIELD_LABEL.conversion },
  { value: 'revenue', label: CANVAS_CONDITION_FIELD_LABEL.revenue },
] as const;

const CONDITION_OPS = [
  { value: 'eq', label: CANVAS_CONDITION_OP_LABEL.eq },
  { value: 'neq', label: CANVAS_CONDITION_OP_LABEL.neq },
  { value: 'gte', label: CANVAS_CONDITION_OP_LABEL.gte },
  { value: 'lte', label: CANVAS_CONDITION_OP_LABEL.lte },
  { value: 'gt', label: CANVAS_CONDITION_OP_LABEL.gt },
  { value: 'lt', label: CANVAS_CONDITION_OP_LABEL.lt },
  { value: 'in', label: CANVAS_CONDITION_OP_LABEL.in },
  { value: 'contains', label: CANVAS_CONDITION_OP_LABEL.contains },
] as const;

const AUTOMATION_TRIGGERS = [...FUNNEL_AUTOMATION_TRIGGERS, 'LEAD_UNTOUCHED'] as const;

export type CanvasOutgoingEdge = {
  id: string;
  targetLabel: string;
  event?: string;
  delayMinutes?: number;
  condition?: FunnelCompleteSpec['connections'][number]['condition'];
};

type Props = {
  nodeType: FunnelNodeType;
  spec: FunnelCompleteSpec;
  specMeta?: FunnelCompleteNode;
  funnelId?: string | null;
  outgoing?: CanvasOutgoingEdge[];
  onChange: (specMeta: FunnelCompleteNode) => void;
  onEdgeChange?: (edgeId: string, patch: Partial<FunnelCompleteConnection>) => void;
};

function mergeMeta(
  node: FunnelCompleteNode,
  patch: Record<string, string | number | boolean | null | undefined>,
): FunnelCompleteNode {
  const meta: Record<string, string | number | boolean | null> = { ...(node.meta ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === '' || value === NONE) {
      delete meta[key];
    } else {
      meta[key] = value;
    }
  }
  return { ...node, meta };
}

function stageFromCrm(row: FunnelStageRow): NonNullable<FunnelCompleteNode['stage']> {
  const category = (row.category || 'OPEN') as NonNullable<FunnelCompleteNode['stage']>['category'];
  return {
    name: row.name.slice(0, 120),
    code: row.code,
    category,
    position: row.position,
    probability: row.probability ?? 20,
    color: row.color ?? undefined,
    slaMinutes: row.slaMinutes ?? undefined,
    isWon: row.isWon,
    isLost: row.isLost,
  };
}

function Question({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function FunnelCanvasInspector({
  nodeType,
  spec,
  specMeta,
  funnelId,
  outgoing = [],
  onChange,
  onEdgeChange,
}: Props) {
  const stages = usePipelineStages();
  const flows = useAutomationFlows();
  if (!specMeta) return null;

  const meta = readCanvasNodeMeta(specMeta);
  const crmStages = stages.data ?? [];
  const specStages = spec.stages ?? [];
  const flowList = (flows.data ?? []).filter(
    (f) => !f.funnelId || !funnelId || f.funnelId === funnelId,
  );
  const audiences = spec.remarketing?.audiences ?? [];
  const showScore =
    nodeType === 'FORM' ||
    nodeType === 'STAGE' ||
    nodeType === 'BOOKING' ||
    nodeType === 'GOAL' ||
    nodeType === 'AUTOMATION' ||
    nodeType === 'RETARGET' ||
    nodeType === 'CTA';

  return (
    <div className="space-y-3">
      <Question title="Khách làm gì?" hint={`Bước “${canvasStepLabel(nodeType)}” — mô tả hành động của khách.`}>
        <Textarea
          rows={2}
          placeholder="VD: Điền form nhận ưu đãi, đặt lịch tư vấn…"
          value={specMeta.description ?? ''}
          onChange={(e) =>
            onChange({ ...specMeta, description: e.target.value.slice(0, 400) || undefined })
          }
        />
        {nodeType === 'FORM' && (
          <div className="space-y-1.5">
            <Label>Khách điền form nào?</Label>
            <Select
              value={meta.formKey || 'public'}
              onValueChange={(v) => onChange(mergeMeta(specMeta, { formKey: v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn form" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">{spec.leadForm?.title || 'Form lấy SĐT'}</SelectItem>
                {spec.chatbotFlow ? (
                  <SelectItem value="chatbot">{spec.chatbotFlow.name || 'Chatbot hỏi đáp'}</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        )}
        {nodeType === 'BOOKING' && (
          <div className="space-y-1.5">
            <Label>Khách làm việc gì với lịch hẹn?</Label>
            <Select
              value={meta.bookingEvent || 'BOOKING_CREATED'}
              onValueChange={(v) => onChange(mergeMeta(specMeta, { bookingEvent: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FUNNEL_BOOKING_EVENTS.map((e) => (
                  <SelectItem key={e} value={e}>
                    {CANVAS_BOOKING_LABEL[e] ?? e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </Question>

      <Question title="Sau bước này hệ thống làm gì?" hint="Tự động chạy trong app — không đổi runtime.">
        {nodeType === 'TRAFFIC' && (
          <p className="text-sm text-muted-foreground">Đưa khách vào bước tiếp theo trên phễu.</p>
        )}
        {nodeType === 'FORM' && (
          <p className="text-sm text-muted-foreground">
            Lưu lead, cộng điểm (nếu có), rồi chạy bước nối tiếp.
          </p>
        )}
        {nodeType === 'AUTOMATION' && (
          <>
            <div className="space-y-1.5">
              <Label>Chăm sóc bằng luồng nào?</Label>
              <Select
                value={meta.flowId || NONE}
                onValueChange={(v) => onChange(mergeMeta(specMeta, { flowId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn luồng chăm sóc" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Luồng mặc định của phễu</SelectItem>
                  {flowList.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Khi nào bắt đầu chăm sóc?</Label>
              <Select
                value={meta.triggerType || 'LEAD_CREATED'}
                onValueChange={(v) => onChange(mergeMeta(specMeta, { triggerType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUTOMATION_TRIGGERS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {canvasEventLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
        {nodeType === 'GOAL' && (
          <p className="text-sm text-muted-foreground">Ghi nhận mốc chuyển đổi khi khách hoàn tất bước này.</p>
        )}
        {nodeType === 'RETARGET' && (
          <>
            <div className="space-y-1.5">
              <Label>Chờ bao lâu rồi nhắc lại? (phút)</Label>
              <Input
                type="number"
                min={0}
                value={meta.delayMinutes ?? 0}
                onChange={(e) =>
                  onChange(
                    mergeMeta(specMeta, {
                      delayMinutes: Math.max(0, Math.round(Number(e.target.value) || 0)),
                    }),
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nhắc bằng luồng nào?</Label>
              <Select
                value={meta.flowId || NONE}
                onValueChange={(v) => onChange(mergeMeta(specMeta, { flowId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nhắc mặc định (lead chưa chăm)</SelectItem>
                  {flowList.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {audiences.length > 0 && (
              <div className="space-y-1.5">
                <Label>Nhóm khách để nhắc</Label>
                <Select
                  value={meta.audienceKey || NONE}
                  onValueChange={(v) => onChange(mergeMeta(specMeta, { audienceKey: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Mặc định của phễu</SelectItem>
                    {audiences.map((a) => (
                      <SelectItem key={a.key} value={a.key}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Nhắc nếu</Label>
                <Select
                  value={meta.conditionField || 'score'}
                  onValueChange={(v) => onChange(mergeMeta(specMeta, { conditionField: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_FIELDS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>So sánh</Label>
                <Select
                  value={meta.conditionOp || 'gte'}
                  onValueChange={(v) => onChange(mergeMeta(specMeta, { conditionOp: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Giá trị</Label>
                <Input
                  value={meta.conditionValue == null ? '' : String(meta.conditionValue)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const asNum = Number(raw);
                    onChange(
                      mergeMeta(specMeta, {
                        conditionValue:
                          raw.trim() === ''
                            ? undefined
                            : Number.isFinite(asNum) && raw.trim() !== ''
                              ? asNum
                              : raw,
                      }),
                    );
                  }}
                />
              </div>
            </div>
          </>
        )}
        {nodeType !== 'TRAFFIC' &&
          nodeType !== 'FORM' &&
          nodeType !== 'AUTOMATION' &&
          nodeType !== 'GOAL' &&
          nodeType !== 'RETARGET' && (
            <p className="text-sm text-muted-foreground">
              Hệ thống chạy bước “{canvasStepLabel(nodeType)}” rồi chuyển sang bước đã nối.
            </p>
          )}
      </Question>

      <Question title="Chuyển khách sang trạng thái nào?">
        {nodeType === 'STAGE' && (
          <Select
            value={
              meta.stageId ||
              crmStages.find((s) => s.code === (meta.stageCode || specMeta.stage?.code))?.id ||
              meta.stageCode ||
              specMeta.stage?.code ||
              NONE
            }
            onValueChange={(v) => {
              if (v === NONE) {
                onChange(
                  mergeMeta({ ...specMeta, stage: specMeta.stage }, { stageId: undefined, stageCode: undefined }),
                );
                return;
              }
              const crm = crmStages.find((s) => s.id === v || s.code === v);
              const fromSpec = specStages.find((s) => s.code === v);
              if (crm) {
                onChange(
                  mergeMeta(
                    { ...specMeta, stage: stageFromCrm(crm), label: crm.name.slice(0, 160) },
                    { stageId: crm.id, stageCode: crm.code },
                  ),
                );
                return;
              }
              if (fromSpec) {
                onChange(
                  mergeMeta(
                    { ...specMeta, stage: fromSpec, label: fromSpec.name.slice(0, 160) },
                    { stageId: undefined, stageCode: fromSpec.code },
                  ),
                );
                return;
              }
              onChange(mergeMeta(specMeta, { stageCode: v }));
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn trạng thái CRM" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Chưa gán</SelectItem>
              {crmStages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
              {specStages
                .filter((s) => !crmStages.some((c) => c.code === s.code))
                .map((s) => (
                  <SelectItem key={s.code} value={s.code}>
                    {s.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
        {nodeType === 'GOAL' && (
          <Select
            value={meta.conversion || 'PURCHASE'}
            onValueChange={(v) => onChange(mergeMeta(specMeta, { conversion: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FUNNEL_CONVERSION_CODES.map((c) => (
                <SelectItem key={c} value={c}>
                  {CANVAS_CONVERSION_LABEL[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {nodeType === 'FORM' && (
          <p className="text-sm text-muted-foreground">Khách thành lead mới sau khi gửi form.</p>
        )}
        {nodeType === 'BOOKING' && (
          <p className="text-sm text-muted-foreground">
            CRM ghi nhận lịch hẹn theo việc khách làm ở trên (đặt / xác nhận / đến spa).
          </p>
        )}
        {nodeType !== 'STAGE' && nodeType !== 'GOAL' && nodeType !== 'FORM' && nodeType !== 'BOOKING' && (
          <p className="text-sm text-muted-foreground">Bước này không đổi trạng thái CRM.</p>
        )}
      </Question>

      <Question title="Cộng bao nhiêu điểm?" hint="Cộng khi bước chạy thành công, rồi kiểm tra MQL/SQL.">
        {showScore ? (
          <Input
            type="number"
            value={meta.scoreDelta ?? ''}
            placeholder="0"
            onChange={(e) => {
              const raw = e.target.value.trim();
              onChange(
                mergeMeta(specMeta, {
                  scoreDelta: raw === '' ? undefined : Math.round(Number(raw) || 0),
                }),
              );
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Bước này không cộng điểm.</p>
        )}
      </Question>

      <Question
        title="Điều kiện để đi bước tiếp theo?"
        hint="Nối handle trên canvas, rồi chọn khi nào được đi tiếp."
      >
        {outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa nối bước sau. Kéo từ chấm bên phải của bước này sang bước tiếp theo.
          </p>
        ) : (
          <div className="space-y-3">
            {outgoing.map((edge) => (
              <div key={edge.id} className="space-y-2 rounded-md bg-muted/40 p-2">
                <p className="text-xs font-medium">Sang: {edge.targetLabel}</p>
                <div className="space-y-1.5">
                  <Label>Khi nào?</Label>
                  <Select
                    value={edge.event || NONE}
                    onValueChange={(v) => onEdgeChange?.(edge.id, { event: v === NONE ? undefined : v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Khi bước này xong</SelectItem>
                      {FUNNEL_CANVAS_EVENTS.map((e) => (
                        <SelectItem key={e} value={e}>
                          {canvasEventLabel(e)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Chờ thêm (phút)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={edge.delayMinutes ?? 0}
                    onChange={(e) =>
                      onEdgeChange?.(edge.id, {
                        delayMinutes: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Điều kiện thêm</Label>
                  <Select
                    value={edge.condition?.field || NONE}
                    onValueChange={(v) => {
                      if (v === NONE) {
                        onEdgeChange?.(edge.id, { condition: undefined });
                        return;
                      }
                      onEdgeChange?.(edge.id, {
                        condition: {
                          field: v,
                          op: edge.condition?.op ?? 'gte',
                          value: edge.condition?.value ?? 0,
                        },
                      });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Không cần</SelectItem>
                      {CONDITION_FIELDS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {edge.condition ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label>So sánh</Label>
                      <Select
                        value={edge.condition.op}
                        onValueChange={(v) =>
                          onEdgeChange?.(edge.id, {
                            condition: {
                              ...edge.condition!,
                              op: v as NonNullable<FunnelCompleteConnection['condition']>['op'],
                            },
                          })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_OPS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Giá trị</Label>
                      <Input
                        value={
                          edge.condition.value == null ? '' : String(edge.condition.value)
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          const asNum = Number(raw);
                          onEdgeChange?.(edge.id, {
                            condition: {
                              ...edge.condition!,
                              value:
                                raw.trim() === ''
                                  ? 0
                                  : Number.isFinite(asNum) && raw.trim() !== ''
                                    ? asNum
                                    : raw,
                            },
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Question>
    </div>
  );
}
