import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-errors';
import { User } from './schemas/user.schema';
import type { UserRecord } from './user.record';

const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

type NewUser = Omit<UserRecord, 'id'> & { passwordHash: string };
type UserCredentials = UserRecord & { passwordHash: string };
type ListedUser = Pick<UserRecord, 'id' | 'username'> & {
  normalizedUsername: string;
};
type UserPosition = { normalizedUsername: string; id: string };
type UserSummary = Pick<UserRecord, 'id' | 'username'>;

function toRecord(user: User & { _id: Types.ObjectId }): UserRecord {
  return {
    id: user._id.toString(),
    email: user.email,
    username: user.username,
  };
}

/** Owns user persistence and keeps database details inside the users module. */
@Injectable()
export class UsersRepository implements OnModuleInit {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}

  async onModuleInit(): Promise<void> {
    await this.users.init();
  }

  /** Returns null when the email or username is already taken. */
  async createIfUnique(input: NewUser): Promise<UserRecord | null> {
    const email: string = input.email.toLowerCase();
    let inserted: User & { _id: Types.ObjectId };
    try {
      inserted = (
        await this.users.create({
          ...input,
          email,
          normalizedEmail: email,
          normalizedUsername: input.username.toLowerCase(),
        })
      ).toObject();
    } catch (error) {
      if (isDuplicateKeyError(error)) return null;
      throw error;
    }
    return toRecord(inserted);
  }

  /** Loads credentials only for password verification. */
  async findByEmail(email: string): Promise<UserCredentials | null> {
    const user = await this.users
      .findOne({ normalizedEmail: email.toLowerCase() })
      .select('+passwordHash')
      .lean()
      .exec();
    return user ? { ...toRecord(user), passwordHash: user.passwordHash } : null;
  }

  /** Lists other users by literal substring in stable username and ID order. */
  async listOthers(input: {
    currentId: string;
    normalizedSearch: string;
    limit: number;
    after?: UserPosition;
  }): Promise<ListedUser[]> {
    const { currentId, normalizedSearch, limit, after } = input;
    const escaped: string = normalizedSearch.replace(
      REGEXP_SPECIAL_CHARACTERS,
      '\\$&',
    );
    const users = await this.users
      .find({
        _id: { $ne: currentId },
        normalizedUsername: { $regex: escaped },
        ...(after
          ? {
              $or: [
                { normalizedUsername: { $gt: after.normalizedUsername } },
                {
                  normalizedUsername: after.normalizedUsername,
                  _id: { $gt: after.id },
                },
              ],
            }
          : {}),
      })
      .select('username normalizedUsername')
      .sort({ normalizedUsername: 1, _id: 1 })
      .limit(limit)
      .lean()
      .exec();
    return users.map((user) => ({
      id: user._id.toString(),
      username: user.username,
      normalizedUsername: user.normalizedUsername,
    }));
  }

  /** Loads public user summaries without credentials or email addresses. */
  async findPublicByIds(ids: string[]): Promise<UserSummary[]> {
    const users = await this.users
      .find({ _id: { $in: ids } })
      .select('username')
      .lean()
      .exec();
    return users.map((user) => ({
      id: user._id.toString(),
      username: user.username,
    }));
  }

  /** Loads the account fields needed to restore the current user. */
  async findById(id: string): Promise<UserRecord | null> {
    const user = await this.users.findById(id).lean().exec();
    return user ? toRecord(user) : null;
  }
}
