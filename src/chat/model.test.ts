import { describe, expect, it } from 'vitest';
import {
  chatReducer,
  initialChatState,
  normalizePhone,
  type ChatAction,
  type Message,
} from './model';

const message: Message = {
  id: 'm1',
  chatId: '10000000',
  text: 'Привет',
  timestamp: 1_760_000_000_000,
  direction: 'incoming',
};
const incoming: ChatAction = {
  type: 'receiveMessage',
  message,
  title: 'Собеседник',
  phone: '79991234567',
};

describe('chat state', () => {
  it('does not duplicate a message when acknowledgement has to be retried', () => {
    const state = chatReducer(initialChatState, incoming);
    const duplicate = chatReducer(state, incoming);
    expect(duplicate).toBe(state);
    expect(duplicate.chats[0]?.messages).toHaveLength(1);
    expect(duplicate.chats[0]?.unread).toBe(1);
  });

  it('reuses a chat created by an incoming message when it is opened by phone', () => {
    const state = chatReducer(initialChatState, incoming);
    const opened = chatReducer(state, {
      type: 'openChat',
      chatId: message.chatId,
      phone: '79991234567',
    });
    expect(opened.chats).toHaveLength(1);
    expect(opened.chats[0]?.messages).toHaveLength(1);
    expect(opened.chats[0]?.unread).toBe(0);
    expect(opened.activeChatId).toBe(message.chatId);
  });

  it('keeps messages in their own chats and orders them by time', () => {
    let state = chatReducer(initialChatState, incoming);
    state = chatReducer(state, {
      ...incoming,
      message: { ...message, id: 'older', timestamp: message.timestamp - 1000 },
    });
    state = chatReducer(state, {
      ...incoming,
      message: { ...message, id: 'other', chatId: '20000000' },
    });
    expect(state.chats[0]?.messages.map((item) => item.id)).toEqual([
      'older',
      'm1',
    ]);
    expect(state.chats[1]?.messages.map((item) => item.id)).toEqual(['other']);
  });

  it('does not mark active-chat or outgoing messages as unread', () => {
    let state = chatReducer(initialChatState, {
      type: 'openChat',
      chatId: message.chatId,
      phone: '79991234567',
    });
    state = chatReducer(state, incoming);
    state = chatReducer(state, {
      type: 'sendMessage',
      message: { ...message, id: 'outgoing', direction: 'outgoing' },
    });
    expect(state.chats[0]?.unread).toBe(0);
    expect(state.chats[0]?.messages).toHaveLength(2);
  });
});

describe('phone numbers', () => {
  it.each([
    ['+7 (999) 123-45-67', '79991234567'],
    ['+375 29 123-45-67', '375291234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });
  it.each([
    '89991234567',
    '+1 555 123 45 67',
    '7999123abc7',
    '',
    '+799912345678',
  ])('rejects %s', (input) => {
    expect(() => normalizePhone(input)).toThrow();
  });
});
