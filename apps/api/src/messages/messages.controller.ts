import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import type { Message, MessagesPage } from '@chat/contracts/messages';
import type { AuthRequest } from '../auth/auth-request';
import { COOKIE } from '../auth/auth.constants';
import { ErrorDto } from '../common/dto/error.dto';
import { MessagesService } from './messages.service';
import {
  MessageParamsDto,
  SendMessageDto,
  MessageDto,
  MessagesPageDto,
  MessagesQueryDto,
} from './messages.dto';
@Controller('conversations/:conversationId/messages')
@ApiCookieAuth(COOKIE)
@ApiUnauthorizedResponse({ type: ErrorDto })
@ApiBadRequestResponse({ type: ErrorDto })
@ApiNotFoundResponse({ type: ErrorDto })
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}
  @Post()
  @ApiCreatedResponse({ type: MessageDto })
  @ApiConflictResponse({ type: ErrorDto })
  send(
    @Req() request: AuthRequest,
    @Param() params: MessageParamsDto,
    @Body() input: SendMessageDto,
  ): Promise<Message> {
    return this.messages.send(request.user.id, params.conversationId, input);
  }
  @Get()
  @ApiOkResponse({ type: MessagesPageDto })
  list(
    @Req() request: AuthRequest,
    @Param() params: MessageParamsDto,
    @Query() query: MessagesQueryDto,
  ): Promise<MessagesPage> {
    return this.messages.list(
      request.user.id,
      params.conversationId,
      query.cursor,
    );
  }
}
