import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthRequest } from '../auth/auth-request';
import { ErrorDto } from '../common/dto/error.dto';
import { ConversationsService } from './conversations.service';
import {
  StartConversationDto,
  ConversationDto,
  ConversationsPageDto,
  ConversationsQueryDto,
} from './conversations.dto';
@Controller('conversations')
@ApiCookieAuth('chat_token')
@ApiUnauthorizedResponse({ type: ErrorDto })
@ApiBadRequestResponse({ type: ErrorDto })
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}
  @Post()
  @ApiCreatedResponse({ type: ConversationDto })
  @ApiNotFoundResponse({ type: ErrorDto })
  start(@Req() request: AuthRequest, @Body() input: StartConversationDto) {
    return this.conversations.start(request.user.id, input.userId);
  }
  @Get()
  @ApiOkResponse({ type: ConversationsPageDto })
  list(@Req() request: AuthRequest, @Query() query: ConversationsQueryDto) {
    return this.conversations.list(request.user.id, query.cursor);
  }
}
