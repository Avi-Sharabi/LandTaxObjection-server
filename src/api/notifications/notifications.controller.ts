import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { NotificationResponseDto } from './dto/notification-response.dto';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';

interface AuthenticatedRequest extends ExpressRequest {
  user: AuthResponseDto;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all unread notifications for the authenticated user' })
  @ApiResponse({ status: 200, type: [NotificationResponseDto] })
  getUnread(@Request() req: AuthenticatedRequest): Promise<NotificationResponseDto[]> {
    return this.notificationsService.getUnread(req.user.id);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiResponse({ status: 200, type: NotificationResponseDto })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(
    @Param('id') id: string,
    @Request() req: AuthenticatedRequest,
  ): Promise<NotificationResponseDto> {
    return this.notificationsService.markAsRead(id, req.user.id);
  }
}
