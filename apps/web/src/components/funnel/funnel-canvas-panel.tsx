'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  canConnectFunnelNodes,
  createFunnelCanvasNode,
  type FunnelCompleteConnection,
  type FunnelCompleteNode,
  type FunnelCompleteSpec,
  type FunnelNodeType,
} from '@marketingspa/shared';
import { FunnelCanvasInspector } from '@/components/funnel/funnel-canvas-inspector';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LoadingState, EmptyState } from '@/components/shared/page-state';
import { FunnelAdvancedSection } from '@/components/funnel/funnel-advanced-section';
import { FunnelCapturePanel } from '@/components/funnel/funnel-capture-panel';
import { FunnelConsultantPanel } from '@/components/funnel/funnel-consultant-panel';
import { FunnelLifecycleBar } from '@/components/funnel/funnel-lifecycle-bar';
import { FunnelDirectEditButton } from '@/components/funnel/funnel-direct-edit-button';
import {
  useFunnelRecommendation,
  useFunnelRecommendations,
  useSaveFunnelCompleteDraft,
} from '@/hooks/use-funnel-builder';
import {
  FUNNEL_ADVANCED_NODE_TYPES,
  FUNNEL_SIMPLE_STEPS,
  canvasEventLabel,
  canvasStepLabel,
  defaultEdgeEvent,
  defaultGoalConversion,
} from '@/lib/funnel-canvas-labels';
import { funnelHref, type FunnelAdvancedPane } from '@/lib/funnel-tabs';
import { cn } from '@/lib/utils';
import { ChevronDown, Sparkles } from 'lucide-react';

const NODE_COLORS: Record<string, string> = {
  TRAFFIC: '#3b82f6',
  LANDING: '#06b6d4',
  FORM: '#8b5cf6',
  STAGE: '#f59e0b',
  BOOKING: '#d97706',
  OFFER: '#f97316',
  CONTENT: '#64748b',
  QUIZ: '#a855f7',
  GAME: '#ec4899',
  CTA: '#ef4444',
  AUTOMATION: '#14b8a6',
  GOAL: '#22c55e',
  RETARGET: '#6366f1',
  REFERRAL: '#0ea5e9',
};

type CanvasNodeData = {
  label: string;
  nodeType: FunnelNodeType;
  description?: string;
  specMeta?: FunnelCompleteSpec['nodes'][number];
};

function FunnelFlowNode({ data, selected }: NodeProps) {
  const d = data as CanvasNodeData;
  const color = NODE_COLORS[d.nodeType] ?? '#94a3b8';
  return (
    <div
      className={cn(
        'min-w-[150px] rounded-md border bg-card px-3 py-2 shadow-sm',
        selected && 'ring-2 ring-primary',
      )}
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground" />
      <div className="text-[10px] font-semibold tracking-wide" style={{ color }}>
        {canvasStepLabel(d.nodeType)}
      </div>
      <div className="max-w-[180px] truncate text-sm font-medium">{d.label}</div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { funnel: FunnelFlowNode };

type CanvasEdgeData = {
  event?: string;
  condition?: FunnelCompleteSpec['connections'][number]['condition'];
  delayMinutes?: number;
  timeoutMinutes?: number;
  branch?: FunnelCompleteSpec['connections'][number]['branch'];
};

function specToFlow(spec: FunnelCompleteSpec): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = spec.nodes.map((n, i) => ({
    id: n.id,
    type: 'funnel',
    position: n.position ?? { x: 80 + (i % 5) * 220, y: 80 + Math.floor(i / 5) * 120 },
    data: {
      label: n.label,
      nodeType: n.type,
      description: n.description,
      specMeta: n,
    } satisfies CanvasNodeData,
  }));
  const edges: Edge[] = spec.connections.map((c) => ({
    id: c.id,
    source: c.from,
    target: c.to,
    label: c.label || canvasEventLabel(c.event),
    markerEnd: { type: MarkerType.ArrowClosed },
    data: {
      event: c.event,
      condition: c.condition,
      delayMinutes: c.delayMinutes,
      timeoutMinutes: c.timeoutMinutes,
      branch: c.branch,
    } satisfies CanvasEdgeData,
  }));
  return { nodes, edges };
}

function flowToSpecGraph(
  base: FunnelCompleteSpec,
  nodes: Node[],
  edges: Edge[],
): Pick<FunnelCompleteSpec, 'nodes' | 'connections'> {
  const nodeMap = new Map(base.nodes.map((n) => [n.id, n]));
  const connMap = new Map(base.connections.map((c) => [c.id, c]));
  const nextNodes = nodes.map((n) => {
    const data = n.data as CanvasNodeData;
    const prev = data.specMeta ?? nodeMap.get(n.id);
    return {
      id: n.id,
      type: data.nodeType,
      label: data.label,
      description: data.description,
      stage: prev?.stage,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      meta: prev?.meta,
    };
  });
  const nextConns = edges.map((e) => {
    const extra = e.data as CanvasEdgeData | undefined;
    const prev = connMap.get(e.id);
    const label = typeof e.label === 'string' ? e.label : prev?.label;
    const conn: FunnelCompleteSpec['connections'][number] = {
      id: e.id,
      from: e.source,
      to: e.target,
    };
    if (label) conn.label = label;
    const event = extra ? extra.event : prev?.event;
    if (event) conn.event = event;
    const condition = extra ? extra.condition : prev?.condition;
    if (condition) conn.condition = condition;
    const delayMinutes = extra ? extra.delayMinutes : prev?.delayMinutes;
    if (typeof delayMinutes === 'number') conn.delayMinutes = delayMinutes;
    const timeoutMinutes = extra ? extra.timeoutMinutes : prev?.timeoutMinutes;
    if (typeof timeoutMinutes === 'number') conn.timeoutMinutes = timeoutMinutes;
    const branch = extra ? extra.branch : prev?.branch;
    if (branch) conn.branch = branch;
    return conn;
  });
  return { nodes: nextNodes, connections: nextConns };
}

export function FunnelCanvasPanel({
  advancedOpen = false,
  advancedPane = 'scoring',
  recommendationId: recommendationIdProp,
  embedded = false,
  visible = true,
}: {
  advancedOpen?: boolean;
  advancedPane?: FunnelAdvancedPane;
  recommendationId?: string | null;
  embedded?: boolean;
  visible?: boolean;
}) {
  if (recommendationIdProp) {
    return (
      <FunnelCanvasPanelInner
        advancedOpen={advancedOpen}
        advancedPane={advancedPane}
        draftId={recommendationIdProp}
        embedded={embedded}
        visible={visible}
      />
    );
  }

  return (
    <Suspense fallback={<LoadingState message="Đang tải thiết kế phễu…" />}>
      <FunnelCanvasPanelFromQuery
        advancedOpen={advancedOpen}
        advancedPane={advancedPane}
        embedded={embedded}
        visible={visible}
      />
    </Suspense>
  );
}

function FunnelCanvasPanelFromQuery({
  advancedOpen = false,
  advancedPane = 'scoring',
  embedded = false,
  visible = true,
}: {
  advancedOpen?: boolean;
  advancedPane?: FunnelAdvancedPane;
  embedded?: boolean;
  visible?: boolean;
}) {
  const searchParams = useSearchParams();
  return (
    <FunnelCanvasPanelInner
      advancedOpen={advancedOpen}
      advancedPane={advancedPane}
      draftId={searchParams.get('draft')}
      embedded={embedded}
      visible={visible}
    />
  );
}

function FunnelCanvasPanelInner({
  advancedOpen = false,
  advancedPane = 'scoring',
  draftId,
  embedded = false,
  visible = true,
}: {
  advancedOpen?: boolean;
  advancedPane?: FunnelAdvancedPane;
  draftId: string | null;
  embedded?: boolean;
  visible?: boolean;
}) {
  const router = useRouter();

  const list = useFunnelRecommendations();
  const detail = useFunnelRecommendation(draftId);
  const save = useSaveFunnelCompleteDraft();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [spec, setSpec] = useState<FunnelCompleteSpec | null>(null);
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [advancedPalette, setAdvancedPalette] = useState(false);
  const [showAiHelp, setShowAiHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const draftsWithComplete = useMemo(
    () => (list.data ?? []).filter((r) => Boolean(r.completeGeneratedAt)),
    [list.data],
  );

  useEffect(() => {
    const complete = detail.data?.completeSpec;
    if (!complete || !draftId) return;
    setSpec(complete);
    const flow = specToFlow(complete);
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setDirty(false);
    setError(null);
  }, [detail.data?.completeSpec, draftId, setNodes, setEdges]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target || !spec) return;
      const graph = flowToSpecGraph(spec, nodes, edges);
      const check = canConnectFunnelNodes(
        graph.nodes,
        graph.connections,
        connection.source,
        connection.target,
      );
      if (!check.ok) {
        setError(check.reason);
        return;
      }
      const id = `e-${connection.source}-${connection.target}-${Date.now().toString(36)}`;
      const sourceNode = nodes.find((n) => n.id === connection.source);
      const sourceType = (sourceNode?.data as CanvasNodeData | undefined)?.nodeType;
      const event = sourceType ? defaultEdgeEvent(sourceType) : undefined;
      setEdges((eds) => [
        ...eds,
        {
          id,
          source: connection.source!,
          target: connection.target!,
          label: event ? canvasEventLabel(event) : undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: { event } satisfies CanvasEdgeData,
        },
      ]);
      setDirty(true);
      setError(null);
    },
    [edges, nodes, setEdges, spec],
  );

  function markNodesDirty(
    updater: (prev: Node[]) => Node[],
  ) {
    setNodes((prev) => updater(prev));
    setDirty(true);
  }

  function addNode(type: FunnelNodeType) {
    if (!spec) return;
    if (nodes.length >= 40) {
      setError('Tối đa 40 bước');
      return;
    }
    const existing = new Set(nodes.map((n) => n.id));
    const created = createFunnelCanvasNode({
      type,
      label: canvasStepLabel(type),
      existingIds: existing,
      position: { x: 120 + nodes.length * 24, y: 160 + (nodes.length % 4) * 40 },
    });
    const conversion = defaultGoalConversion(type);
    const specMeta =
      conversion && created.meta
        ? { ...created, meta: { ...created.meta, conversion } }
        : conversion
          ? { ...created, meta: { conversion } }
          : created;
    markNodesDirty((prev) => [
      ...prev,
      {
        id: specMeta.id,
        type: 'funnel',
        position: specMeta.position ?? { x: 120, y: 120 },
        data: {
          label: specMeta.label,
          nodeType: specMeta.type,
          description: specMeta.description,
          specMeta,
        } satisfies CanvasNodeData,
      },
    ]);
    setSelectedId(specMeta.id);
    setError(null);
  }

  function updateEdge(edgeId: string, patch: Partial<FunnelCompleteConnection>) {
    setEdges((eds) =>
      eds.map((e) => {
        if (e.id !== edgeId) return e;
        const extra = (e.data ?? {}) as CanvasEdgeData;
        const next: CanvasEdgeData = { ...extra };
        if ('event' in patch) next.event = patch.event;
        if ('delayMinutes' in patch) next.delayMinutes = patch.delayMinutes;
        if ('condition' in patch) next.condition = patch.condition;
        if ('timeoutMinutes' in patch) next.timeoutMinutes = patch.timeoutMinutes;
        if ('branch' in patch) next.branch = patch.branch;
        return {
          ...e,
          label: 'event' in patch ? canvasEventLabel(patch.event) : e.label,
          data: next,
        };
      }),
    );
    setDirty(true);
  }

  function deleteSelected() {
    if (!selectedId) return;
    markNodesDirty((prev) => prev.filter((n) => n.id !== selectedId));
    setEdges((eds) => {
      setDirty(true);
      return eds.filter((e) => e.source !== selectedId && e.target !== selectedId);
    });
    setSelectedId(null);
  }

  function updateSelected(patch: Partial<CanvasNodeData>) {
    if (!selectedId) return;
    markNodesDirty((prev) =>
      prev.map((n) => {
        if (n.id !== selectedId) return n;
        const current = n.data as CanvasNodeData;
        const nextLabel = (patch.label ?? current.label).slice(0, 160);
        const nextDesc =
          patch.description !== undefined
            ? patch.description.slice(0, 400)
            : current.description;
        const specMeta = patch.specMeta ?? current.specMeta;
        return {
          ...n,
          data: {
            ...current,
            ...patch,
            label: specMeta?.label ?? nextLabel,
            description: specMeta?.description ?? nextDesc,
            specMeta: specMeta
              ? { ...specMeta, label: specMeta.label ?? nextLabel, description: specMeta.description ?? nextDesc }
              : specMeta,
          },
        };
      }),
    );
  }

  function updateSelectedSpec(specMeta: FunnelCompleteNode) {
    updateSelected({
      label: specMeta.label,
      description: specMeta.description,
      specMeta,
    });
  }

  async function onSave() {
    if (!spec || !draftId) return;
    setError(null);
    setInfo(null);
    const graph = flowToSpecGraph(spec, nodes, edges);
    const complete: FunnelCompleteSpec = {
      ...spec,
      ...graph,
      schemaVersion: 'funnel-complete.v1',
      mode: 'draft',
    };
    try {
      const res = await save.mutateAsync({ id: draftId, complete });
      setSpec(res.complete);
      const flow = specToFlow(res.complete);
      setNodes(flow.nodes);
      setEdges(flow.edges);
      setDirty(false);
      setInfo(
        res.liveFrozen
          ? 'Đã lưu nháp. Phễu đang chạy không bị ghi đè.'
          : 'Đã lưu nháp.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được nháp');
    }
  }

  if (!embedded && list.isLoading) return <LoadingState message="Đang tải draft…" />;

  if (!draftId && !embedded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Thiết kế phễu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Chọn phễu đã tạo xong để kéo-thả node, nối hành trình và kích hoạt.
          </p>
          {draftsWithComplete.length === 0 ? (
            <EmptyState
              title="Chưa có phễu để thiết kế"
              description="Vào Tạo phễu → AI đề xuất → chọn mẫu → Tạo Funnel hoàn chỉnh"
            />
          ) : (
            <ul className="space-y-2">
              {draftsWithComplete.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="flex w-full items-start justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
                    onClick={() =>
                      router.replace(funnelHref({ tab: 'mine', design: d.id }))
                    }
                  >
                    <span className="line-clamp-2">{d.prompt.slice(0, 140)}</span>
                    <Badge variant="outline">{d.selectedSlug ?? 'nháp'}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" onClick={() => router.replace(funnelHref({ tab: 'create', create: true }))}>
            Tạo phễu
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (detail.isLoading || !spec) {
    return <LoadingState message="Đang tải thiết kế phễu…" />;
  }

  if (!detail.data?.completeSpec) {
    return (
      <EmptyState
        title="Phễu chưa có bản thiết kế"
        description="Quay lại Tạo phễu và chọn “Tạo Funnel hoàn chỉnh” trước khi thiết kế."
      />
    );
  }

  const selData = selectedNode?.data as CanvasNodeData | undefined;

  return (
    <div className={cn('space-y-3', embedded && 'rounded-lg border bg-muted/20 p-3', !visible && 'hidden')}>
      {!embedded && (
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Thiết kế phễu</h2>
        <p className="text-sm text-muted-foreground">
          Thêm bước dễ hiểu, nối hành trình, rồi kích hoạt. Nâng cao dành cho bước kỹ thuật.
        </p>
      </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{spec.name}</span>
        {dirty && <Badge>Chưa lưu</Badge>}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!embedded && <FunnelDirectEditButton funnelId={draftId!} />}
          <Button
            size="sm"
            variant={showAiHelp ? 'secondary' : 'outline'}
            onClick={() => setShowAiHelp((v) => !v)}
          >
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            Gợi ý AI
          </Button>
          <Button size="sm" onClick={onSave} disabled={!dirty || save.isPending}>
            {save.isPending ? 'Đang lưu…' : 'Lưu nháp'}
          </Button>
          {!embedded && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.replace(funnelHref({ tab: 'mine' }))}
          >
            Quay lại danh sách
          </Button>
          )}
        </div>
      </div>
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <p className="text-xs font-medium text-muted-foreground">Thêm bước</p>
        <div className="flex flex-wrap gap-2">
          {FUNNEL_SIMPLE_STEPS.map((step) => (
            <Button
              key={step.type}
              size="sm"
              variant="secondary"
              title={step.hint}
              onClick={() => addNode(step.type)}
            >
              {step.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAdvancedPalette((v) => !v)}
          >
            Nâng cao
            <ChevronDown className={cn('ml-1 h-4 w-4 transition-transform', advancedPalette && 'rotate-180')} />
          </Button>
        </div>
        {advancedPalette && (
          <div className="flex flex-wrap gap-2 border-t pt-2">
            {FUNNEL_ADVANCED_NODE_TYPES.map((type) => (
              <Button key={type} size="sm" variant="outline" onClick={() => addNode(type)}>
                {canvasStepLabel(type)}
              </Button>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {info && <p className="text-sm text-green-700">{info}</p>}

      {draftId && !embedded && (
        <FunnelLifecycleBar
          recommendationId={draftId}
          status={detail.data?.status}
          onSpec={(complete) => {
            setSpec(complete);
            const flow = specToFlow(complete);
            setNodes(flow.nodes);
            setEdges(flow.edges);
            setDirty(false);
          }}
        />
      )}

      <div className={cn('grid gap-4', showAiHelp && 'xl:grid-cols-[minmax(0,1fr)_380px]')}>
      <div className="h-[620px] overflow-hidden rounded-lg border bg-background">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            if (changes.some((c) => c.type === 'position' || c.type === 'remove')) {
              setDirty(true);
            }
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            if (changes.some((c) => c.type === 'remove')) setDirty(true);
          }}
          onConnect={onConnect}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={['Backspace', 'Delete']}
          onNodesDelete={() => setDirty(true)}
          onEdgesDelete={() => setDirty(true)}
          isValidConnection={(c) => {
            if (!c.source || !c.target || !spec) return false;
            const graph = flowToSpecGraph(spec, nodes, edges);
            return canConnectFunnelNodes(graph.nodes, graph.connections, c.source, c.target).ok;
          }}
        >
          <Background gap={18} size={1} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable />
          <Panel position="top-left" className="rounded-md bg-card/90 px-2 py-1 text-xs shadow">
            Thiết kế phễu · thêm bước · nối handle · bấm bước để cấu hình
          </Panel>
        </ReactFlow>
      </div>
        {showAiHelp && draftId && (
          <FunnelConsultantPanel
            recommendationId={draftId}
            spec={spec}
            dirty={dirty}
            onApplied={(complete) => {
              setSpec(complete);
              const flow = specToFlow(complete);
              setNodes(flow.nodes);
              setEdges(flow.edges);
              setDirty(false);
              setInfo('Đã áp gợi ý AI vào nháp (chưa kích hoạt).');
            }}
          />
        )}
      </div>

      <Sheet open={Boolean(selectedNode)} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Cấu hình bước</SheetTitle>
          </SheetHeader>
          {selData && selectedNode && (
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="node-label">Tên bước</Label>
                <Input
                  id="node-label"
                  value={selData.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    updateSelected({
                      label,
                      specMeta: selData.specMeta
                        ? { ...selData.specMeta, label: label.slice(0, 160) }
                        : selData.specMeta,
                    });
                  }}
                />
              </div>
              <FunnelCanvasInspector
                nodeType={selData.nodeType}
                spec={spec}
                specMeta={selData.specMeta}
                funnelId={draftId}
                outgoing={edges
                  .filter((e) => e.source === selectedNode.id)
                  .map((e) => {
                    const extra = (e.data ?? {}) as CanvasEdgeData;
                    const target = nodes.find((n) => n.id === e.target);
                    const targetData = target?.data as CanvasNodeData | undefined;
                    return {
                      id: e.id,
                      targetLabel:
                        targetData?.label ||
                        (targetData ? canvasStepLabel(targetData.nodeType) : e.target),
                      event: extra.event,
                      delayMinutes: extra.delayMinutes,
                      condition: extra.condition,
                    };
                  })}
                onChange={updateSelectedSpec}
                onEdgeChange={updateEdge}
              />
              <Button variant="destructive" onClick={deleteSelected}>
                Xóa bước
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FunnelCapturePanel
        recommendationId={draftId}
        spec={spec}
        chatbotBotId={detail.data?.chatbotBotId ?? null}
      />

      <FunnelAdvancedSection
        funnelId={draftId}
        defaultOpen={advancedOpen}
        initialPane={advancedPane}
        status={detail.data?.status}
        publishedVersion={detail.data?.publishedVersion}
        liveFrozen={detail.data?.liveFrozen}
        onSpec={(complete) => {
          setSpec(complete);
          const flow = specToFlow(complete);
          setNodes(flow.nodes);
          setEdges(flow.edges);
          setDirty(false);
        }}
      />
    </div>
  );
}
