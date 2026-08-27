export type WorkPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface WorkEmployeeRef {
  id: string;
  name: string;
}

export interface WorkBoardColumn {
  id: string;
  key: string;
  name: string;
  sortOrder: number;
}

export interface WorkChecklistItem {
  id: string;
  title: string;
  isDone: boolean;
  sortOrder: number;
}

export interface WorkTask {
  id: string;
  organizationId: string;
  projectId: string;
  columnId: string;
  columnKey: string;
  columnName: string;
  title: string;
  description?: string | null;
  assignerId?: string | null;
  assigner?: WorkEmployeeRef | null;
  createdById?: string | null;
  createdBy?: WorkEmployeeRef | null;
  startDate?: string | null;
  deadline?: string | null;
  priority: WorkPriority | string;
  labels: string[];
  progress: number;
  estimatedMinutes?: number | null;
  completedAt?: string | null;
  recurrenceRule?: string | null;
  recurrenceInterval?: number;
  isRecurrenceTemplate?: boolean;
  sortOrder: number;
  isArchived: boolean;
  copiedFromId?: string | null;
  revisionCount?: number;
  lastSubmittedById?: string | null;
  lastSubmittedBy?: WorkEmployeeRef | null;
  lastSubmittedAt?: string | null;
  lastReviewedById?: string | null;
  lastReviewedBy?: WorkEmployeeRef | null;
  lastReviewedAt?: string | null;
  lastReviewNote?: string | null;
  lastReviewAction?: string | null;
  canSubmitReview?: boolean;
  canReview?: boolean;
  createdAt: string;
  updatedAt: string;
  assignees: WorkEmployeeRef[];
  watchers: WorkEmployeeRef[];
  checklist: WorkChecklistItem[];
}

export interface WorkComment {
  id: string;
  taskId: string;
  parentId?: string | null;
  authorId: string;
  author: WorkEmployeeRef;
  body: string;
  mentionIds: string[];
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  replies?: WorkComment[];
}

export interface WorkAttachment {
  id: string;
  organizationId: string;
  projectId: string;
  taskId?: string | null;
  originalName: string;
  storedName: string;
  fileKey: string;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  uploadedById?: string | null;
  uploadedBy?: WorkEmployeeRef | null;
  task?: { id: string; title: string } | null;
  createdAt: string;
  canPreview?: boolean;
}

export interface WorkNotification {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  taskId?: string | null;
  projectId?: string | null;
  isRead: boolean;
  createdAt: string;
  actor?: WorkEmployeeRef | null;
}

export interface WorkStatusHistory {
  id: string;
  fromColumnKey?: string | null;
  toColumnKey: string;
  action: string;
  note?: string | null;
  createdAt: string;
  actor?: WorkEmployeeRef | null;
}

export interface WorkReviewEvent {
  id: string;
  type: string;
  note?: string | null;
  revisionNumber: number;
  createdAt: string;
  submittedBy?: WorkEmployeeRef | null;
  reviewedBy?: WorkEmployeeRef | null;
}

export interface WorkProject {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  columns?: WorkBoardColumn[];
  _count?: { tasks: number };
}

export interface WorkProjectDetail extends WorkProject {
  columns: WorkBoardColumn[];
  tasks: WorkTask[];
}

export interface CreateWorkProjectInput {
  name: string;
  description?: string;
}

export interface CreateWorkTaskInput {
  projectId: string;
  columnId?: string;
  title: string;
  description?: string;
  assignerId?: string | null;
  assigneeIds?: string[];
  watcherIds?: string[];
  startDate?: string | null;
  deadline?: string | null;
  priority?: string;
  labels?: string[];
  progress?: number;
  checklist?: Array<{ title: string; isDone?: boolean; sortOrder?: number }>;
}

export type UpdateWorkTaskInput = Partial<
  Omit<CreateWorkTaskInput, 'description' | 'assignerId' | 'startDate' | 'deadline'>
> & {
  description?: string | null;
  assignerId?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  isArchived?: boolean;
};

export interface MoveWorkTaskInput {
  columnId: string;
  sortOrder: number;
}

export const PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Thấp',
  MEDIUM: 'Trung bình',
  HIGH: 'Cao',
  URGENT: 'Khẩn cấp',
};
