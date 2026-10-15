import { Injectable, ConflictException, Inject } from '@nestjs/common';
import { CONFIG, type Config } from '../common/config';
import { paginate } from '../common/pagination';
import type {
  CurrentUser,
  Login,
  PublicUser,
  Registration,
  UsersPage,
} from '@chat/contracts';
import { UsersRepository } from './users.repository';
import { publicUser } from './user.mapper';
import { hashPassword, verifyPassword } from './password-hasher';

/** Handles registration, credential verification and user discovery. */
@Injectable()
export class UsersService {
  constructor(
    private readonly users: UsersRepository,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  /** Registers an account or rejects an email or username already in use. */
  async register(input: Registration): Promise<CurrentUser> {
    const passwordHash: string = await hashPassword(input.password);
    const user = await this.users.createIfUnique({
      email: input.email,
      username: input.username,
      passwordHash,
    });
    if (!user)
      throw new ConflictException({
        code: 'USER_EXISTS',
        message: 'Email or username is already taken',
      });
    return publicUser(user);
  }

  /** Returns the account only when the supplied password matches. */
  async findByCredentials(input: Login): Promise<CurrentUser | null> {
    const user = await this.users.findByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return null;
    }
    return publicUser(user);
  }

  /** Returns a page of other users with a cursor bound to viewer and search. */
  async list(
    currentId: string,
    search: string,
    cursor?: string,
  ): Promise<UsersPage> {
    const normalized: string = search.toLowerCase();
    const page = await paginate({
      cursor,
      scope: `users:${currentId}:${normalized}`,
      secret: this.config.JWT_SECRET,
      load: ({ limit, after }) =>
        this.users.listOthers({
          currentId,
          normalizedSearch: normalized,
          limit,
          after: after
            ? { normalizedUsername: after.key, id: after.id }
            : undefined,
        }),
      position: (user) => ({ key: user.normalizedUsername, id: user.id }),
    });
    return {
      items: page.items.map((user) => ({
        id: user.id,
        username: user.username,
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** Provides user summaries to other application modules. */
  async findPublicByIds(ids: string[]): Promise<PublicUser[]> {
    return this.users.findPublicByIds(ids);
  }

  /** Restores the current account without exposing credentials. */
  async findCurrent(id: string): Promise<CurrentUser | null> {
    const user = await this.users.findById(id);
    return user ? publicUser(user) : null;
  }
}
