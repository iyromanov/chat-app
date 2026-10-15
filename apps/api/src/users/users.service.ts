import {
  Injectable,
  ConflictException,
  OnModuleInit,
  Inject,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { CONFIG, type Config } from '../common/config';
import { encodeCursor, decodeCursor } from '../common/cursor';
import { Model } from 'mongoose';
import type { Login, Registration } from '@chat/contracts';
import { User } from './schemas/user.schema';
import { publicUser } from './user.mapper';
import { hashPassword, verifyPassword } from './password-hasher';

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectModel(User.name) private readonly users: Model<User>,
    @Inject(CONFIG) private readonly config: Config,
  ) {}
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

  async list(currentId: string, search: string, cursor?: string) {
    const normalized = search.toLowerCase();
    const scope = `users:${currentId}:${normalized}`;
    const after = decodeCursor(cursor, scope, this.config.JWT_SECRET);
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await this.users
      .find({
        _id: { $ne: currentId },
        normalizedUsername: { $regex: escaped },
        ...(after
          ? {
              $or: [
                { normalizedUsername: { $gt: after.key } },
                { normalizedUsername: after.key, _id: { $gt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ normalizedUsername: 1, _id: 1 })
      .limit(51)
      .lean()
      .exec();
    const page = users.slice(0, 50);
    const last = page.at(-1);
    return {
      items: page.map((user) => ({
        id: user._id.toString(),
        username: user.username,
      })),
      nextCursor:
        users.length > 50 && last
          ? encodeCursor(
              { scope, key: last.normalizedUsername, id: last._id.toString() },
              this.config.JWT_SECRET,
            )
          : null,
    };
  }
  async findPublicByIds(ids: string[]) {
    return (
      await this.users
        .find({ _id: { $in: ids } })
        .select('username')
        .lean()
        .exec()
    ).map((user) => ({ id: user._id.toString(), username: user.username }));
  }
  async findCurrent(id: string) {
    const user = await this.users.findById(id).exec();
    return user ? publicUser(user) : null;
  }
}
