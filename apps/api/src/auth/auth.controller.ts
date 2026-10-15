import {
  Body,
  Controller,
  Get,
  Inject,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CONFIG, type Config } from '../common/config';
import { ErrorDto } from '../common/dto/error.dto';
import { AUTH_EXPIRES_HEADER, type CurrentUser } from '@chat/contracts';
import { Public } from './public';
import { LocalAuthGuard } from './local-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { COOKIE, LIFETIME } from './auth.constants';
import type { AuthRequest } from './auth-request';
import { RegistrationDto } from './dto/registration.dto';
import { CurrentUserDto } from './dto/current-user.dto';

const authHeaders = {
  [AUTH_EXPIRES_HEADER]: {
    description:
      'Original JWT expiry; restoring authentication does not renew it',
    required: true,
    schema: { type: 'string', format: 'date-time' },
  },
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}
  @Public()
  @Post('register')
  @ApiCreatedResponse({ type: CurrentUserDto, headers: authHeaders })
  @ApiBadRequestResponse({ type: ErrorDto })
  @ApiConflictResponse({ type: ErrorDto })
  async register(
    @Body() input: RegistrationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token, expiresAt } = await this.auth.register(input);
    this.setCookie(response, token);
    response.setHeader(AUTH_EXPIRES_HEADER, expiresAt.toISOString());
    return user;
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: CurrentUserDto, headers: authHeaders })
  @ApiBadRequestResponse({ type: ErrorDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async login(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const { user, token, expiresAt } = await this.auth.login(request.user);
    this.setCookie(response, token);
    response.setHeader(AUTH_EXPIRES_HEADER, expiresAt.toISOString());
    return user;
  }

  private setCookie(response: Response, token: string) {
    response.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.COOKIE_SECURE === 'true',
      maxAge: LIFETIME * 1000,
      path: '/',
    });
  }
  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(COOKIE)
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({ type: ErrorDto })
  logout(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.auth.logout(request.auth.loginId);
    response.clearCookie(COOKIE, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.COOKIE_SECURE === 'true',
      path: '/',
    });
  }

  @Get('me')
  @ApiCookieAuth(COOKIE)
  @ApiOkResponse({ type: CurrentUserDto, headers: authHeaders })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  me(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader(
      AUTH_EXPIRES_HEADER,
      request.auth.expiresAt.toISOString(),
    );
    return request.user;
  }
}
