import { Module } from '@nestjs/common';
import { HrmEmployeesController } from './hrm-employees.controller';
import { HrmEmployeesService } from './hrm-employees.service';
import { HrmDepartmentsController } from './hrm-departments.controller';
import { HrmDepartmentsService } from './hrm-departments.service';
import { HrmContractsController } from './hrm-contracts.controller';
import { HrmContractsService } from './hrm-contracts.service';
import { HrmDocumentsController } from './hrm-documents.controller';
import { HrmDocumentsService } from './hrm-documents.service';
import { HrmAuditController } from './hrm-audit.controller';
import { HrmAuditService } from './hrm-audit.service';
import { HrmShiftPoliciesController } from './hrm-shift-policies.controller';
import { HrmShiftPoliciesService } from './hrm-shift-policies.service';
import { HrmShiftAssignmentsController } from './hrm-shift-assignments.controller';
import { HrmShiftAssignmentsService } from './hrm-shift-assignments.service';
import { HrmAttendanceController } from './hrm-attendance.controller';
import { HrmAttendanceService } from './hrm-attendance.service';
import { HrmTimesheetController } from './hrm-timesheet.controller';
import { HrmTimesheetService } from './hrm-timesheet.service';
import { HrmLeaveController, HrmOvertimeController } from './hrm-leave.controller';
import { HrmLeaveService } from './hrm-leave.service';

@Module({
  controllers: [
    HrmEmployeesController,
    HrmDepartmentsController,
    HrmContractsController,
    HrmDocumentsController,
    HrmAuditController,
    HrmShiftPoliciesController,
    HrmShiftAssignmentsController,
    HrmAttendanceController,
    HrmTimesheetController,
    HrmLeaveController,
    HrmOvertimeController,
  ],
  providers: [
    HrmEmployeesService,
    HrmDepartmentsService,
    HrmContractsService,
    HrmDocumentsService,
    HrmAuditService,
    HrmShiftPoliciesService,
    HrmShiftAssignmentsService,
    HrmAttendanceService,
    HrmTimesheetService,
    HrmLeaveService,
  ],
  exports: [
    HrmEmployeesService,
    HrmDepartmentsService,
    HrmContractsService,
    HrmDocumentsService,
    HrmAuditService,
    HrmAttendanceService,
    HrmTimesheetService,
    HrmLeaveService,
  ],
})
export class HrmModule {}
