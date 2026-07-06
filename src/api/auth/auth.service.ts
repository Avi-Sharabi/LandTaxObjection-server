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
import { InvalidCredentialsException } from './exceptions/invalid-credentials.exception';
import { InvalidResetTokenException } from './exceptions/invalid-reset-token.exception';
import { ResetTokenExpiredException } from './exceptions/reset-token-expired.exception';
import { ResetTokenAlreadyUsedException } from './exceptions/reset-token-already-used.exception';
import { JwtPayload } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly azureEmailService: AzureEmailService,
  ) {}

  async login(dto: LoginDto, response: Response): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user || !user.password) {
      throw new InvalidCredentialsException();
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.password);
    if (!passwordMatch) {
      throw new InvalidCredentialsException();
    }

    if (!user.isActive) {
      throw new InvalidCredentialsException();
    }

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

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.usersService.findByEmail(dto.email);

    if (user) {
      const plainToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');
      const expires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

      await this.usersService.savePasswordResetToken(user.id, hashedToken, expires);

      const frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
      const resetLink = `${frontendUrl}/reset-password?token=${plainToken}`;

      await this.azureEmailService.sendPasswordResetEmail({
        sendTo: user.email,
        fullName: user.fullName,
        resetLink,
        expiryMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
      });
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
