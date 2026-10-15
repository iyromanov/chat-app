import { Controller, Get, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthRequest } from '../auth/auth-request';
import { ErrorDto } from '../common/dto/error.dto';
import { UsersService } from './users.service';
import { UsersQueryDto, UsersPageDto } from './users.dto';
@Controller('users')
@ApiCookieAuth('chat_token')
export class UsersController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @ApiOkResponse({ type: UsersPageDto })
  @ApiBadRequestResponse({ type: ErrorDto })
  @ApiUnauthorizedResponse({ type: ErrorDto })
  list(@Req() request: AuthRequest, @Query() query: UsersQueryDto) {
    return this.users.list(request.user.id, query.search ?? '', query.cursor);
  }
}
