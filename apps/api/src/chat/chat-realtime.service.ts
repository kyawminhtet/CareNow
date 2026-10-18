import { Injectable, Logger } from "@nestjs/common";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

@Injectable()
export class ChatRealtimeService {
  private readonly logger = new Logger(ChatRealtimeService.name);
  private readonly client: SupabaseClient | null;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.client = url && serviceRoleKey
      ? createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
    if (!this.client) this.logger.warn("Chat Realtime broadcasts are disabled; configure SUPABASE_SERVICE_ROLE_KEY on the API.");
  }

  async broadcast(conversationId: string, event: "message.created" | "messages.read", payload: Record<string, unknown>) {
    if (!this.client) return;
    const retryDelays = [0, 250, 750];
    for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
      if (retryDelays[attempt]) await new Promise((resolve) => setTimeout(resolve, retryDelays[attempt]));
      const channel = this.client.channel(`chat:${conversationId}`, { config: { private: true } });
      try {
        const result = await channel.httpSend(event, payload);
        if (result.success) return;
        if (attempt === retryDelays.length - 1) this.logger.warn(`Realtime broadcast failed for ${event} after retries: ${result.error}`);
      } catch (error) {
        if (attempt === retryDelays.length - 1) this.logger.warn(`Realtime ${event} broadcast failed after retries: ${error instanceof Error ? error.message : "unknown error"}`);
      } finally {
        await this.client.removeChannel(channel).catch(() => undefined);
      }
    }
  }
}
