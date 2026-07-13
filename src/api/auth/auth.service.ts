import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { AzureEmailService } from '../../common/azure-email/azure-email.service';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { BCRYPT_SALT_ROUNDS, PASSWORD_RESET_EXPIRY_MINUTES } from './constants/password-reset.constants';
import {
  FORGOT_PASSWORD_MAX_EMAILS,
  FORGOT_PASSWORD_WINDOW_SECONDS,
  FORGOT_PASSWORD_MAX_IP_ATTEMPTS,
  FORGOT_PASSWORD_IP_WINDOW_SECONDS,
} from './constants/forgot-password-throttle.constants';
import {
  LOGIN_MAX_ATTEMPTS,
  LOGIN_ATTEMPTS_WINDOW_SECONDS,
  LOGIN_LOCK_DURATION_SECONDS,
} from './constants/login-lockout.constants';
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { InvalidResetTokenException } from './exceptions/invalid-reset-token.exception';
import { ResetTokenExpiredException } from './exceptions/reset-token-expired.exception';
import { ResetTokenAlreadyUsedException } from './exceptions/reset-token-already-used.exception';
import { AccountLockedException } from './exceptions/account-locked.exception';
import { LoginLockoutService } from './login-lockout.service';
import { ForgotPasswordThrottleService } from './forgot-password-throttle.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly azureEmailService: AzureEmailService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly forgotPasswordThrottleService: ForgotPasswordThrottleService,
  ) {}

  async login(
    dto: LoginDto,
    response: Response,
    ip: string,
  ): Promise<AuthResponseDto> {
    const emailKey = `email:${dto.email}`;

    if (await this.loginLockoutService.isLocked(emailKey)) {
      throw new AccountLockedException();
    }

    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user || !user.password) {
      await this.recordFailedLogin(ip, dto.email);
      throw new InvalidCredentialsException();
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      await this.recordFailedLogin(ip, dto.email);
      throw new InvalidCredentialsException();
    }

    if (!user.isActive) {
      await this.recordFailedLogin(ip, dto.email);
      throw new InvalidCredentialsException();
    }

    await this.loginLockoutService.resetAttempts(emailKey);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const token = this.jwtService.sign(payload);
    const isProduction = this.configService.get<string>('NODE_ENV') === 'production';

    response.cookie('access_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  private async recordFailedLogin(ip: string, email: string): Promise<void> {
    await Promise.all([
      this.loginLockoutService.recordFailedAttempt(
        `ip:${ip}`,
        LOGIN_MAX_ATTEMPTS,
        LOGIN_ATTEMPTS_WINDOW_SECONDS,
        LOGIN_LOCK_DURATION_SECONDS,
      ),
      this.loginLockoutService.recordFailedAttempt(
        `email:${email}`,
        LOGIN_MAX_ATTEMPTS,
        LOGIN_ATTEMPTS_WINDOW_SECONDS,
        LOGIN_LOCK_DURATION_SECONDS,
      ),
    ]);
  }

  async getMe(userId: string): Promise<AuthResponseDto> {
    const user = await this.usersService.findOne(userId);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  logout(response: Response): void {
    response.clearCookie('access_token', {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      path: '/',
    });
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
    ip: string,
  ): Promise<{ message: string }> {
    const withinIpLimit = await this.forgotPasswordThrottleService.recordAttemptAndCheck(
      `ip:${ip}`,
      FORGOT_PASSWORD_MAX_IP_ATTEMPTS,
      FORGOT_PASSWORD_IP_WINDOW_SECONDS,
    );

    if (withinIpLimit) {
      const user = await this.usersService.findByEmail(dto.email);

      if (user) {
        const withinEmailLimit = await this.forgotPasswordThrottleService.recordAttemptAndCheck(
          `email:${dto.email}`,
          FORGOT_PASSWORD_MAX_EMAILS,
          FORGOT_PASSWORD_WINDOW_SECONDS,
        );

        if (withinEmailLimit) {
          const plainToken = crypto.randomBytes(32).toString('hex');
          const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
          const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

          await this.usersService.savePasswordResetToken(user.id, hashedToken, expires);

          const frontendUrl =
            this.configService.getOrThrow<string>('FRONTEND_URL');
          const resetLink = `${frontendUrl}/reset-password?token=${plainToken}`;

          await this.azureEmailService.sendPasswordResetEmail({
            sendTo: user.email,
            fullName: user.fullName,
            resetLink,
            expiryMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
          });
        }
      }
    }

    return { message: 'If that email exists, a reset link has been sent.' };
  }

  private async getUserByValidResetToken(plainToken: string): Promise<User> {
    const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
    const user = await this.usersService.findByResetTokenHash(hashedToken);

    if (!user) {
      throw new InvalidResetTokenException();
    }
    if (user.passwordResetUsedAt) {
      throw new ResetTokenAlreadyUsedException();
    }
    if (!user.passwordResetExpires || user.passwordResetExpires.getTime() <= Date.now()) {
      throw new ResetTokenExpiredException();
    }

    return user;
  }

  async validateResetToken(token: string): Promise<{ valid: true }> {
    await this.getUserByValidResetToken(token);
    return { valid: true };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.getUserByValidResetToken(dto.token);
    const hashedPassword = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.usersService.resetPasswordAndMarkUsed(user.id, hashedPassword);

    return { message: 'Password has been reset successfully.' };
  }
}
