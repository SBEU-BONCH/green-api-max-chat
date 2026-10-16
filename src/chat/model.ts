export interface Message {
  id: string;
  chatId: string;
  text: string;
  timestamp: number;
  direction: 'incoming' | 'outgoing';
}

export interface Chat {
  id: string;
  title: string;
  phone?: string;
  messages: Message[];
  unread: number;
}

export interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
}

export type ChatAction =
  | { type: 'openChat'; chatId: string; phone: string }
  | { type: 'selectChat'; chatId: string | null }
  | { type: 'receiveMessage'; message: Message; title: string; phone?: string }
  | { type: 'sendMessage'; message: Message };

export const initialChatState: ChatState = { chats: [], activeChatId: null };

function appendMessage(
  chat: Chat,
  message: Message,
  activeChatId: string | null,
): Chat {
  if (chat.messages.some((item) => item.id === message.id)) return chat;

  return {
    ...chat,
    messages: [...chat.messages, message].sort(
      (a, b) => a.timestamp - b.timestamp,
    ),
    unread:
      chat.unread +
      Number(message.direction === 'incoming' && chat.id !== activeChatId),
  };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'openChat': {
      const existing = state.chats.some((chat) => chat.id === action.chatId);
      const chats = existing
        ? state.chats
        : [
            ...state.chats,
            {
              id: action.chatId,
              title: `+${action.phone}`,
              phone: action.phone,
              messages: [],
              unread: 0,
            },
          ];
      return {
        chats: chats.map((chat) =>
          chat.id === action.chatId ? { ...chat, unread: 0 } : chat,
        ),
        activeChatId: action.chatId,
      };
    }
    case 'selectChat':
      return {
        ...state,
        activeChatId: action.chatId,
        chats: state.chats.map((chat) =>
          chat.id === action.chatId ? { ...chat, unread: 0 } : chat,
        ),
      };
    case 'receiveMessage': {
      const existing = state.chats.find(
        (chat) => chat.id === action.message.chatId,
      );
      const chat = existing ?? {
        id: action.message.chatId,
        title: action.title,
        phone: action.phone,
        messages: [],
        unread: 0,
      };
      const updated = appendMessage(chat, action.message, state.activeChatId);
      if (updated === existing) return state;
      return {
        ...state,
        chats: existing
          ? state.chats.map((item) => (item.id === updated.id ? updated : item))
          : [...state.chats, updated],
      };
    }
    case 'sendMessage':
      return {
        ...state,
        chats: state.chats.map((chat) =>
          chat.id === action.message.chatId
            ? appendMessage(chat, action.message, state.activeChatId)
            : chat,
        ),
      };
  }
}

export function normalizePhone(value: string): string {
  const phone = value.replace(/[\s()+-]/g, '');
  if (!/^(7\d{10}|375\d{9})$/.test(phone)) {
    throw new Error(
      'Введите номер с кодом страны: +7 и 10 цифр или +375 и 9 цифр.',
    );
  }
  return phone;
}
