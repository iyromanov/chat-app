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
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CONFIG, type Config } from '../common/config';
import { ErrorDto } from '../common/dto/error.dto';
import type { CurrentUser } from '@chat/contracts';
import { LocalAuthGuard } from './local-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { COOKIE, LIFETIME } from './auth.constants';
import type { AuthRequest } from './auth-request';
import { RegistrationDto } from './dto/registration.dto';
import { CurrentUserDto } from './dto/current-user.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: Config,
  ) {}
  @Post('register')
  @ApiCreatedResponse({ type: CurrentUserDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  @ApiConflictResponse({ type: ErrorDto })
  async register(
    @Body() input: RegistrationDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token } = await this.auth.register(input);
    this.setCookie(response, token);
    return user;
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(LocalAuthGuard)
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  async login(
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUser> {
    const { user, token } = await this.auth.login(request.user);
    this.setCookie(response, token);
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
  @Get('me')
  @UseGuards(AuthGuard)
  @ApiCookieAuth(COOKIE)
  @ApiOkResponse({ type: CurrentUserDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  me(@Req() request: AuthRequest) {
    return request.user;
  }
}
