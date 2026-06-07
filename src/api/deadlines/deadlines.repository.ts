import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { DeadlineEntityType, DeadlinePriority, DeadlineStatus, DeadlineType } from './entities/deadline.entity';
import { DEADLINE_COMPLETED_CASE_STATUSES, TERMINAL_STATUSES } from './deadlines.constants';

export type DashboardRow = {
  deadlineId: string;
  caseId: string;
  deadlineStatus: DeadlineStatus | null;
  dueDate: string;
  priority: string;
  assignedOwnerId: string | null;
  caseReference: string;
  caseStatus: string;
  clientName: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  assignedOwnerName: string | null;
};

@Injectable()
export class DeadlinesRepository {
  constructor(private readonly dataSource: DataSource) {}

  getDashboardRows(): Promise<DashboardRow[]> {
    return this.dataSource
      .createQueryBuilder()
      .select([
        'COALESCE(d.id::text, dc.id::text)                                         AS "deadlineId"',
        'dc.id                                                                      AS "caseId"',
        'd.status                                                                   AS "deadlineStatus"',
        'COALESCE(d.due_date, dc.statutory_deadline::TIMESTAMPTZ)                  AS "dueDate"',
        `COALESCE(d.priority, 'critical')                                          AS "priority"`,
        'COALESCE(d.assigned_owner_id, dc.assigned_accountant_id)                 AS "assignedOwnerId"',
        'dc.case_reference                                                          AS "caseReference"',
        'dc.status                                                                  AS "caseStatus"',
        `COALESCE(NULLIF(TRIM(CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, ''))), ''), c.name) AS "clientName"`,
        'p.address                                                                  AS "address"',
        'p.suburb                                                                   AS "suburb"',
        'p.state                                                                    AS "state"',
        'p.postcode                                                                 AS "postcode"',
        'u.full_name                                                                AS "assignedOwnerName"',
      ])
      .from('dispute_cases', 'dc')
      .innerJoin('clients', 'c', 'c.id = dc.client_id')
      .innerJoin('properties', 'p', 'p.id = dc.property_id')
      .leftJoin(
        'deadlines',
        'd',
        'd.entity_id = dc.id AND d.entity_type = :entityType AND d.deadline_type = :deadlineType AND d.status NOT IN (:...terminalStatuses)',
        {
          entityType: DeadlineEntityType.DISPUTE_CASE,
          deadlineType: DeadlineType.STATUTORY_OBJECTION,
          terminalStatuses: TERMINAL_STATUSES,
        },
      )
      .leftJoin('users', 'u', 'u.id = COALESCE(d.assigned_owner_id, dc.assigned_accountant_id)')
      .where('dc.statutory_deadline IS NOT NULL')
      .andWhere(
        'NOT (dc.status IN (:...completedStatuses) AND dc.updated_at < NOW() - INTERVAL \'30 days\')',
        { completedStatuses: DEADLINE_COMPLETED_CASE_STATUSES },
      )
      .orderBy('COALESCE(d.due_date, dc.statutory_deadline::TIMESTAMPTZ)', 'ASC')
      .getRawMany<DashboardRow>();
  }
}
