import { Injectable, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Login, Registration } from '@chat/contracts';
import { User } from './schemas/user.schema';
import { publicUser } from './user.mapper';
import { hashPassword, verifyPassword } from './password-hasher';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}
  async onModuleInit() {
    await this.users.init();
  }
  async register(input: Registration) {
    try {
      return publicUser(
        await this.users.create({
          email: input.email.toLowerCase(),
          username: input.username,
          normalizedEmail: input.email.toLowerCase(),
          normalizedUsername: input.username.toLowerCase(),
          passwordHash: await hashPassword(input.password),
        }),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 11000
      ) {
        throw new ConflictException({
          code: 'USER_EXISTS',
          message: 'Email or username is already taken',
        });
      }
      throw error;
    }
  }
  async findByCredentials(input: Login) {
    const user = await this.users
      .findOne({ normalizedEmail: input.email.toLowerCase() })
      .select('+passwordHash')
      .exec();
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return null;
    }
    return publicUser(user);
  }

  async findCurrent(id: string) {
    const user = await this.users.findById(id).exec();
    return user ? publicUser(user) : null;
  }
}
