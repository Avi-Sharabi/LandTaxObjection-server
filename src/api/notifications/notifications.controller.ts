import {
  Controller,
  Get,
  Patch,
  Param,
  UseGuards,
  Request,
  Sse,
  MessageEvent,
  OnModuleDestroy,
} from '@nestjs/common';
import { Request as ExpressRequest } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
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
export class NotificationsController implements OnModuleDestroy {
  /**
   * Tracks every active SSE cleanup function so that when the server shuts
   * down (onModuleDestroy) all open HTTP response streams are closed cleanly,
   * preventing the process from hanging on dangling keep-alive connections.
   */
  private readonly activeCleanups = new Set<() => void>();

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

  @Sse('stream')
  @ApiOperation({
    summary: 'Open a Server-Sent Events stream for real-time notifications',
    description:
      'Persistent one-way stream that pushes `notification` events when new notifications ' +
      'are created and `heartbeat` events every 30 seconds to keep the connection alive. ' +
      'Authenticates via the httpOnly `access_token` cookie — the browser EventSource API ' +
      'sends cookies automatically so no extra headers are required.',
  })
  @ApiResponse({ status: 200, description: 'SSE stream established' })
  stream(@Request() req: AuthenticatedRequest): Observable<MessageEvent> {
    const { observable, cleanup } = this.notificationsService.createStream(req.user.id);

    this.activeCleanups.add(cleanup);

    // Express fires 'close' when the TCP connection is terminated by the client
    // (tab closed, navigation, network drop). This is the correct place to free
    // resources tied to a specific HTTP request.
    req.on('close', () => {
      cleanup();
      this.activeCleanups.delete(cleanup);
    });

    return observable;
  }

  onModuleDestroy(): void {
    for (const cleanup of this.activeCleanups) {
      cleanup();
    }
    this.activeCleanups.clear();
  }
}
