import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { z } from 'zod';
import { CONFIG, type Config } from '../common/config';
import { Clock } from '../common/clock';
import { UsersService } from '../users/users.service';
import { COOKIE, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants';
import type { AuthRequest } from './auth-request';
import { ClockJwtStrategy } from './clock-jwt.strategy';

const claimsSchema = z.object({
  sub: z.string().regex(/^[a-f0-9]{24}$/i),
  exp: z.number().int(),
  jti: z.string().uuid(),
});

@Injectable()
export class JwtStrategy extends PassportStrategy(ClockJwtStrategy, 'jwt') {
  constructor(
    @Inject(CONFIG) config: Config,
    clock: Clock,
    private readonly users: UsersService,
  ) {
    super({
      clock,
      passReqToCallback: true,
      secretOrKey: config.JWT_SECRET,
      algorithms: ['HS256'],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      jwtFromRequest: (request: Request) => {
        const token: unknown = request.cookies?.[COOKIE];
        return typeof token === 'string' ? token : null;
      },
    });
  }

  async validate(request: AuthRequest, payload: unknown) {
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    request.auth = {
      loginId: claims.data.jti,
      expiresAt: new Date(claims.data.exp * 1000),
    };
    return this.users.findCurrent(claims.data.sub);
  }
}
