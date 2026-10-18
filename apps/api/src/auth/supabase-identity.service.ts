import { Injectable } from "@nestjs/common";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

@Injectable()
export class SupabaseIdentityService {
  private readonly client: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.");
    }

    this.client = createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  async verifyAccessToken(accessToken: string): Promise<Pick<User, "id" | "email" | "email_confirmed_at" | "user_metadata"> | null> {
    const { data, error } = await this.client.auth.getUser(accessToken);
    if (error || !data.user?.id) return null;
    return { id: data.user.id, email: data.user.email, email_confirmed_at: data.user.email_confirmed_at, user_metadata: data.user.user_metadata };
  }
}
