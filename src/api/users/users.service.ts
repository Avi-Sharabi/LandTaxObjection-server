import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user with email already exists
    const existingUser = await this.usersRepository.findOne({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException(`User with email ${createUserDto.email} already exists`);
    }

    const user = this.usersRepository.create(createUserDto);
    return this.usersRepository.save(user);
  }

  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User #${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Check email uniqueness if email is being updated
    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.usersRepository.findOne({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException(`User with email ${updateUserDto.email} already exists`);
      }
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<{ message: string }> {
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
    return { message: `User #${id} removed` };
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async savePasswordResetToken(userId: string, hashedToken: string, expires: Date): Promise<void> {
    await this.usersRepository.update(userId, {
      passwordResetToken: hashedToken,
      passwordResetExpires: expires,
      passwordResetUsedAt: null,
    });
  }

  async findByResetTokenHash(hashedToken: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordResetExpires')
      .addSelect('user.passwordResetUsedAt')
      .where('user.passwordResetToken = :hashedToken', { hashedToken })
      .getOne();
  }

  async resetPasswordAndMarkUsed(userId: string, hashedPassword: string): Promise<void> {
    await this.usersRepository.update(userId, {
      password: hashedPassword,
      passwordResetUsedAt: new Date(),
    });
  }
}
