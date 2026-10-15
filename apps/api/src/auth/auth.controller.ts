import {
  Body,
  Controller,
  Get,
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
import { ErrorDto } from '../common/dto/error.dto';
import { AUTH_EXPIRES_HEADER } from '@chat/contracts/auth';
import { type CurrentUser } from '@chat/contracts/users';
import { Public } from './public';
import { LocalAuthGuard } from './local-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthCookieService } from './auth-cookie.service';
import { COOKIE } from './auth.constants';
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
    private readonly cookies: AuthCookieService,
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
    this.cookies.set(response, token);
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
    this.cookies.set(response, token);
    response.setHeader(AUTH_EXPIRES_HEADER, expiresAt.toISOString());
    return user;
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
    this.cookies.clear(response);
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
