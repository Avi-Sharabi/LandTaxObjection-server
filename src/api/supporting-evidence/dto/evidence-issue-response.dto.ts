import { ApiProperty } from '@nestjs/swagger';
import { DisputeEvidenceIssue } from '../entities/dispute-evidence-issue.entity';

export class EvidenceIssueResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  dispute_case_id: string;

  @ApiProperty()
  issue_type: string;

  @ApiProperty()
  is_tick: boolean;

  @ApiProperty({ nullable: true })
  confidence: string | null;

  @ApiProperty({ nullable: true })
  trigger: string | null;

  @ApiProperty({ nullable: true })
  text_box_content: string | null;

  @ApiProperty({ type: [String], nullable: true })
  documents_to_attach: string[] | null;

  @ApiProperty()
  run_id: number;

  @ApiProperty()
  created_at: Date;

  static fromEntity(entity: DisputeEvidenceIssue): EvidenceIssueResponseDto {
    const dto = new EvidenceIssueResponseDto();
    dto.id = entity.id;
    dto.dispute_case_id = entity.dispute_case_id;
    dto.issue_type = entity.issue_type;
    dto.is_tick = entity.is_tick;
    dto.confidence = entity.confidence;
    dto.trigger = entity.trigger;
    dto.text_box_content = entity.text_box_content;
    dto.documents_to_attach = entity.documents_to_attach;
    dto.run_id = entity.run_id;
    dto.created_at = entity.created_at;
    return dto;
  }
}
