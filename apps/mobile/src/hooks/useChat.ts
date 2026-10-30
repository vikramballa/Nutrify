import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChatHistorySchema, ChatTurnSchema } from '@nutrichef/shared';
import { apiFetch, parseWith } from '../api/client';

const KEY = ['chat'];

export function useChatHistory() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => parseWith(ChatHistorySchema, await apiFetch('/chat'), 'chat'),
    staleTime: 30_000,
  });
}

/** Every mutation lands the same way: refetch the thread. */
function useChatMutation<TInput>(request: (input: TInput) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useSendMessage() {
  return useChatMutation(async (message: string) =>
    parseWith(
      ChatTurnSchema,
      await apiFetch('/chat', { method: 'POST', body: JSON.stringify({ message }) }),
      'chat:send',
    ),
  );
}

/** Rewrite a question; the server drops later turns and answers again. */
export function useEditMessage() {
  return useChatMutation(async ({ id, message }: { id: string; message: string }) =>
    parseWith(
      ChatTurnSchema,
      await apiFetch(`/chat/${id}`, { method: 'PATCH', body: JSON.stringify({ message }) }),
      'chat:edit',
    ),
  );
}

export function useDeleteMessage() {
  return useChatMutation((id: string) => apiFetch(`/chat/${id}`, { method: 'DELETE' }));
}

export function useClearChat() {
  return useChatMutation(() => apiFetch('/chat', { method: 'DELETE' }));
}
