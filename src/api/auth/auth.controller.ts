import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiCookieAuth,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ValidateResetTokenQueryDto } from './dto/validate-reset-token-query.dto';
import { ValidateResetTokenResponseDto } from './dto/validate-reset-token-response.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { MessageResponseDto } from './dto/message-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful — sets httpOnly access_token cookie', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({
    status: 429,
    description: 'Too many requests, or account temporarily locked',
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
    @Req() request: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.login(dto, response, request.ip ?? 'unknown');
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getMe(@Req() req: Request & { user: AuthResponseDto }): AuthResponseDto {
    return req.user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Logout — clears the access_token cookie' })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  logout(@Res({ passthrough: true }) response: Response): void {
    this.authService.logout(response);
  }

  // Public endpoint — unauthenticated. Intentionally reveals nothing about whether the email exists.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link via email' })
  @ApiResponse({ status: 200, type: MessageResponseDto, description: 'Reset link sent if the email exists' })
  @ApiResponse({ status: 400, description: 'Validation error (invalid email format)' })
  forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() request: Request,
  ): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto, request.ip ?? 'unknown');
  }

  // Public endpoint — token-gated by the signed reset link delivered via email.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using the token from the reset email' })
  @ApiResponse({ status: 200, type: MessageResponseDto, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid, expired, or already-used reset token' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }

  // Public endpoint — read-only check; does not consume/mark the token.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('reset-password/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a password reset token without consuming it' })
  @ApiResponse({ status: 200, type: ValidateResetTokenResponseDto, description: 'Token is valid and unused' })
  @ApiResponse({ status: 400, description: 'Token not found, expired, or already used' })
  validateResetToken(@Query() query: ValidateResetTokenQueryDto): Promise<ValidateResetTokenResponseDto> {
    return this.authService.validateResetToken(query.token);
  }
}
