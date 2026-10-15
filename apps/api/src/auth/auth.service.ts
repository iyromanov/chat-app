import { AuthGateway } from './auth.gateway';
import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CurrentUser, Login, Registration } from '@chat/contracts';
import { LIFETIME } from './auth.constants';
import { Clock } from '../common/clock';
import { UsersService } from '../users/users.service';

type LoginResult = {
  expiresAt: Date;
  user: CurrentUser;
  token: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    private readonly sockets: AuthGateway,
  ) {}

  logout(loginId: string): void {
    this.sockets.logout(loginId);
  }

  async register(input: Registration): Promise<LoginResult> {
    return this.login(await this.users.register(input));
  }

  async validateCredentials(input: Login): Promise<CurrentUser> {
    const user = await this.users.findByCredentials(input);
    if (!user) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid email or password',
      });
    }
    return user;
  }

  async login(user: CurrentUser): Promise<LoginResult> {
    const issuedAt = Math.floor(this.clock.now().getTime() / 1000);
    return {
      expiresAt: new Date((issuedAt + LIFETIME) * 1000),
      user,
      token: await this.jwt.signAsync({
        sub: user.id,
        jti: randomUUID(),
        iat: issuedAt,
      }),
    };
  }
}
