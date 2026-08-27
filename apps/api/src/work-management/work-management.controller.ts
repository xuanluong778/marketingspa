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
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { createUploadMulterOptions } from '../common/uploads/upload-policy';
import { WorkManagementService } from './work-management.service';
import { WorkCollabService } from './work-collab.service';
import { WORK_PERMISSIONS } from './work-management.constants';
import {
  CreateWorkCommentDto,
  CreateWorkProjectDto,
  CreateWorkTaskDto,
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
  ) {}

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
  @UseInterceptors(FileInterceptor('file', createUploadMulterOptions('work')))
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
  @UseInterceptors(FileInterceptor('file', createUploadMulterOptions('work')))
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
