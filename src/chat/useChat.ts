import { useEffect, useReducer, useRef, useState } from 'react';
import type { GreenApi } from '../api/greenApi';
import { chatReducer, initialChatState } from './model';
import { receiveMessages, type ReceivingStatus } from './notifications';

export function useChat(api: GreenApi) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [receiving, setReceiving] = useState<ReceivingStatus>({
    state: 'connected',
  });
  const sessionController = useRef(new AbortController());

  useEffect(() => {
    const controller = new AbortController();
    sessionController.current = controller;
    void receiveMessages(
      api,
      controller.signal,
      (incoming) => dispatch({ type: 'receiveMessage', ...incoming }),
      setReceiving,
    );
    return () => controller.abort();
  }, [api]);

  async function openChat(phone: string) {
    const signal = sessionController.current.signal;
    const existing = state.chats.find((chat) => chat.phone === phone);
    const chatId = existing?.id ?? (await api.resolveChat(phone, signal));
    signal.throwIfAborted();
    dispatch({ type: 'openChat', chatId, phone });
  }

  async function sendMessage(chatId: string, text: string) {
    const signal = sessionController.current.signal;
    const id = await api.sendMessage(chatId, text, signal);
    signal.throwIfAborted();
    dispatch({
      type: 'sendMessage',
      message: {
        id,
        chatId,
        text,
        // MAX возвращает время с точностью до секунды.
        timestamp: Math.floor(Date.now() / 1_000) * 1_000,
        direction: 'outgoing',
      },
    });
  }

  return {
    chats: state.chats,
    activeChat: state.chats.find((chat) => chat.id === state.activeChatId),
    receiving,
    openChat,
    sendMessage,
    selectChat: (chatId: string | null) =>
      dispatch({ type: 'selectChat', chatId }),
  };
}
