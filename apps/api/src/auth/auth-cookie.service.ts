import { Inject, Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { CONFIG, type Config } from '../common/config';
import { COOKIE, LIFETIME } from './auth.constants';

@Injectable()
export class AuthCookieService {
  private readonly options: CookieOptions;

  constructor(@Inject(CONFIG) config: Config) {
    this.options = {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.COOKIE_SECURE === 'true',
      path: '/',
    };
  }

  set(response: Response, token: string): void {
    response.cookie(COOKIE, token, {
      ...this.options,
      maxAge: LIFETIME * 1000,
    });
  }

  clear(response: Response): void {
    response.clearCookie(COOKIE, this.options);
  }
}
