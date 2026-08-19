import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { WorkManagementService } from './work-management.service';
import { WorkCollabService } from './work-collab.service';
import { WorkInsightsService } from './work-insights.service';
import { WORK_PERMISSIONS } from './work-management.constants';
import { WORK_UPLOAD_MAX_BYTES } from './work-file-policy';
import {
  CreateWorkCommentDto,
  CreateWorkProjectDto,
  CreateWorkTaskDto,
  ManualTimeDto,
  MoveWorkTaskDto,
  ReviewDecisionDto,
  SubmitReviewDto,
  UpdateWorkCommentDto,
  UpdateWorkProjectDto,
  UpdateWorkTaskDto,
  WorkTaskQueryDto,
} from './dto/work-management.dto';

@Controller('work-management')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
export class WorkManagementController {
  constructor(
    private readonly service: WorkManagementService,
    private readonly collab: WorkCollabService,
    private readonly insights: WorkInsightsService,
  ) {}

  // ── Insights: my-work, dashboard, calendar, export ───────────────────────

  @Get('my-work')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  myWork(@CurrentUser() user: AuthUser) {
    return this.insights.myWork(user.organizationId, user);
  }

  @Get('dashboard')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  dashboard(
    @CurrentUser() user: AuthUser,
    @Query('groupBy') groupBy?: 'project' | 'department' | 'employee',
  ) {
    return this.insights.dashboard(user.organizationId, user, groupBy || 'project');
  }

  @Get('calendar')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  calendar(@CurrentUser() user: AuthUser, @Query('from') from?: string, @Query('to') to?: string) {
    return this.insights.calendar(user.organizationId, user, {
      from: from || '',
      to: to || '',
    });
  }

  @Get('employees/:employeeId/stats')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  employeeStats(@CurrentUser() user: AuthUser, @Param('employeeId') employeeId: string) {
    return this.insights.employeeStats(user.organizationId, user, employeeId);
  }

  @Get('reports/export')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  async exportReport(
    @CurrentUser() user: AuthUser,
    @Query('format') format: 'csv' | 'xlsx' = 'csv',
    @Res() res: Response,
  ) {
    const out = await this.insights.exportReport(
      user.organizationId,
      user,
      format === 'xlsx' ? 'xlsx' : 'csv',
    );
    res.setHeader('Content-Type', out.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${out.filename}"`);
    res.send(out.body);
  }

  @Get('audit-logs')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  auditLogs(
    @CurrentUser() user: AuthUser,
    @Query('taskId') taskId?: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.insights.listAuditLogs(user.organizationId, user, { taskId, projectId });
  }

  @Post('recurrence/materialize')
  @RequirePermissions(WORK_PERMISSIONS.TASK_MANAGE)
  materialize(@CurrentUser() user: AuthUser) {
    return this.insights.materializeRecurrences(user.organizationId);
  }

  // ── Projects / Tasks (existing) ─────────────────────────────────────────

  @Get('projects')
  @RequirePermissions(WORK_PERMISSIONS.PROJECT_READ)
  listProjects(@CurrentUser() user: AuthUser, @Query('includeArchived') includeArchived?: string) {
    return this.service.listProjects(
      user.organizationId,
      user,
      includeArchived === '1' || includeArchived === 'true',
    );
  }

  @Get('projects/:id')
  @RequirePermissions(WORK_PERMISSIONS.PROJECT_READ)
  getProject(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getProject(user.organizationId, user, id);
  }

  @Post('projects')
  @RequirePermissions(WORK_PERMISSIONS.PROJECT_WRITE)
  createProject(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkProjectDto) {
    return this.service.createProject(user.organizationId, user, dto);
  }

  @Patch('projects/:id')
  @RequirePermissions(WORK_PERMISSIONS.PROJECT_WRITE)
  updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkProjectDto,
  ) {
    return this.service.updateProject(user.organizationId, user, id, dto);
  }

  @Get('projects/:id/documents')
  @RequirePermissions(WORK_PERMISSIONS.PROJECT_READ)
  listProjectDocuments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.listProjectDocuments(user.organizationId, user, id);
  }

  @Post('projects/:id/documents')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: WORK_UPLOAD_MAX_BYTES },
    }),
  )
  uploadProjectDocument(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.collab.uploadFile(user.organizationId, user, file, { projectId: id });
  }

  @Get('tasks')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  listTasks(@CurrentUser() user: AuthUser, @Query() query: WorkTaskQueryDto) {
    return this.service.listTasks(user.organizationId, user, query);
  }

  @Get('tasks/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  getTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.getTask(user.organizationId, user, id);
  }

  @Post('tasks')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  createTask(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkTaskDto) {
    return this.service.createTask(user.organizationId, user, dto);
  }

  @Patch('tasks/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  updateTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkTaskDto,
  ) {
    return this.service.updateTask(user.organizationId, user, id, dto);
  }

  @Post('tasks/:id/move')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  moveTask(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveWorkTaskDto) {
    return this.service.moveTask(user.organizationId, user, id, dto);
  }

  @Post('tasks/:id/copy')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  copyTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.copyTask(user.organizationId, user, id);
  }

  @Post('tasks/:id/archive')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  archiveTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveTask(user.organizationId, user, id, true);
  }

  @Post('tasks/:id/unarchive')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  unarchiveTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.archiveTask(user.organizationId, user, id, false);
  }

  @Delete('tasks/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  softDeleteTask(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.softDeleteTask(user.organizationId, user, id);
  }

  // ── Time tracking ────────────────────────────────────────────────────────

  @Post('tasks/:id/time/start')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  startTimer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.startTimer(user.organizationId, user, id);
  }

  @Post('tasks/:id/time/pause')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  pauseTimer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.pauseTimer(user.organizationId, user, id);
  }

  @Post('tasks/:id/time/stop')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  stopTimer(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.stopTimer(user.organizationId, user, id);
  }

  @Post('tasks/:id/time/manual')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  manualTime(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ManualTimeDto) {
    return this.insights.manualTime(user.organizationId, user, id, dto);
  }

  @Get('tasks/:id/time-logs')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  timeLogs(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.insights.listTimeLogs(user.organizationId, user, id);
  }

  // ── Review ───────────────────────────────────────────────────────────────

  @Post('tasks/:id/submit-review')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  submitReview(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: SubmitReviewDto,
  ) {
    return this.collab.submitForReview(user.organizationId, user, id, dto);
  }

  @Post('tasks/:id/approve')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewDecisionDto) {
    return this.collab.approveTask(user.organizationId, user, id, dto);
  }

  @Post('tasks/:id/request-fix')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  requestFix(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: ReviewDecisionDto,
  ) {
    return this.collab.requestFix(user.organizationId, user, id, dto);
  }

  @Get('tasks/:id/status-history')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  statusHistory(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.listStatusHistory(user.organizationId, user, id);
  }

  @Get('tasks/:id/review-events')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  reviewEvents(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.listReviewEvents(user.organizationId, user, id);
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  @Get('tasks/:id/comments')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  listComments(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.listComments(user.organizationId, user, id);
  }

  @Post('tasks/:id/comments')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  createComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateWorkCommentDto,
  ) {
    return this.collab.createComment(user.organizationId, user, id, dto);
  }

  @Patch('comments/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  updateComment(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkCommentDto,
  ) {
    return this.collab.updateComment(user.organizationId, user, id, dto);
  }

  @Delete('comments/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  deleteComment(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.deleteComment(user.organizationId, user, id);
  }

  // ── Files ────────────────────────────────────────────────────────────────

  @Get('tasks/:id/files')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  listTaskFiles(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.listTaskFiles(user.organizationId, user, id);
  }

  @Post('tasks/:id/files')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: WORK_UPLOAD_MAX_BYTES },
    }),
  )
  async uploadTaskFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const task = await this.service.getTask(user.organizationId, user, id);
    return this.collab.uploadFile(user.organizationId, user, file, {
      projectId: task.projectId,
      taskId: id,
    });
  }

  @Get('files/:id/download')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  async downloadFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.collab.downloadAttachment(user.organizationId, user, id);
    res.set({
      'Content-Type': result.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(result.originalName)}"`,
    });
    return result.file;
  }

  @Delete('files/:id')
  @RequirePermissions(WORK_PERMISSIONS.TASK_WRITE)
  deleteFile(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.softDeleteAttachment(user.organizationId, user, id);
  }

  // ── Notifications ────────────────────────────────────────────────────────

  @Get('notifications')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  listNotifications(@CurrentUser() user: AuthUser, @Query('unreadOnly') unreadOnly?: string) {
    return this.collab.listNotifications(
      user.organizationId,
      user,
      unreadOnly === '1' || unreadOnly === 'true',
    );
  }

  @Post('notifications/:id/read')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.collab.markNotificationRead(user.organizationId, user, id);
  }

  @Post('notifications/read-all')
  @RequirePermissions(WORK_PERMISSIONS.TASK_READ)
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.collab.markAllNotificationsRead(user.organizationId, user);
  }
}
