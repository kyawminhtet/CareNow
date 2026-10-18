import { Body, Controller, ForbiddenException, Get, Headers, Param, ParseUUIDPipe, Post, Query, UnauthorizedException } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthService } from "../auth/auth.service";
import { ChatService } from "./chat.service";

@ApiTags("chat")
@ApiBearerAuth()
@Controller("chat")
export class ChatController {
  constructor(private readonly auth: AuthService, private readonly chat: ChatService) {}

  @Get("conversations")
  @ApiOperation({ summary: "List appointment-linked chats for the signed-in patient or doctor" })
  async conversations(@Headers("authorization") authorization?: string, @Query("limit") limit?: string) {
    const session = await this.participant(authorization);
    return this.chat.listConversations(session.user.id, limit);
  }

  @Get("unread-count")
  @ApiOperation({ summary: "Get the signed-in participant's unread chat message count" })
  async unreadCount(@Headers("authorization") authorization?: string) {
    const session = await this.participant(authorization);
    return this.chat.unreadCount(session.user.id);
  }

  @Get("conversations/:conversationId/messages")
  @ApiOperation({ summary: "List a conversation's messages in chronological order" })
  async messages(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
    @Query("limit") limit?: string,
    @Query("before") before?: string,
    @Query("after") after?: string,
  ) {
    const session = await this.participant(authorization);
    return this.chat.messages(session.user.id, conversationId, limit, before, after);
  }

  @Post("conversations/:conversationId/messages")
  @ApiOperation({ summary: "Send a text message in an open appointment chat" })
  async sendMessage(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
    @Body() body: unknown,
  ) {
    const session = await this.participant(authorization);
    return this.chat.sendMessage(session.user.id, conversationId, body);
  }

  @Post("conversations/:conversationId/read")
  @ApiOperation({ summary: "Mark received messages in a conversation as read" })
  async markRead(
    @Headers("authorization") authorization: string | undefined,
    @Param("conversationId", ParseUUIDPipe) conversationId: string,
  ) {
    const session = await this.participant(authorization);
    return this.chat.markRead(session.user.id, conversationId);
  }

  private async participant(authorization?: string) {
    const token = this.bearer(authorization);
    const preliminary = await this.auth.resolveSession(token);
    if (preliminary.user.role === "PATIENT") return this.auth.requirePatient(token);
    if (preliminary.user.role === "DOCTOR") return this.auth.requireVerifiedDoctor(token);
    throw new ForbiddenException({ code: "CHAT_PARTICIPANT_REQUIRED" });
  }

  private bearer(value?: string) {
    const match = value?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw new UnauthorizedException({ code: "AUTH_TOKEN_REQUIRED" });
    return match[1];
  }
}
