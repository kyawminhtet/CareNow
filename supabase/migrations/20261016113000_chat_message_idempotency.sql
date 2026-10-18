-- Allows clients to retry a message after a lost response without creating a duplicate.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_client_message_unique
  ON public.chat_messages (conversation_id, sender_user_id, client_message_id);
