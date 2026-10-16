import { ApiError, errorMessage, type GreenApi } from '../api/greenApi';
import type { Message } from './model';

interface IncomingMessage {
  message: Message;
  title: string;
  phone?: string;
}

export type ReceivingStatus =
  | { state: 'connected' }
  | { state: 'reconnecting'; message: string }
  | { state: 'stopped'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseIncomingMessage(body: unknown): IncomingMessage | null {
  if (!isRecord(body) || body.typeWebhook !== 'incomingMessageReceived')
    return null;
  const { senderData, messageData, idMessage, timestamp } = body;
  if (!isRecord(senderData) || !isRecord(messageData)) return null;
  if (senderData.chatType !== 'user' || typeof senderData.chatId !== 'string')
    return null;
  if (typeof idMessage !== 'string' || typeof timestamp !== 'number')
    return null;
  if (
    messageData.typeMessage !== 'textMessage' &&
    messageData.typeMessage !== 'extendedTextMessage'
  )
    return null;

  const data =
    messageData.typeMessage === 'textMessage'
      ? messageData.textMessageData
      : messageData.extendedTextMessageData;
  if (!isRecord(data)) return null;
  const text =
    messageData.typeMessage === 'textMessage' ? data.textMessage : data.text;
  if (typeof text !== 'string') return null;

  const rawPhone = senderData.senderPhoneNumber;
  const phone = rawPhone ? String(rawPhone) : undefined;
  const name =
    senderData.senderContactName ||
    senderData.senderName ||
    senderData.chatName;

  return {
    message: {
      id: idMessage,
      chatId: senderData.chatId,
      text,
      timestamp: timestamp * 1000,
      direction: 'incoming',
    },
    title:
      typeof name === 'string' && name
        ? name
        : phone
          ? `+${phone}`
          : 'Собеседник',
    phone,
  };
}

export function wait(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function receiveMessages(
  api: Pick<GreenApi, 'receiveNotification' | 'deleteNotification'>,
  signal: AbortSignal,
  onMessage: (incoming: IncomingMessage) => void,
  onStatus: (status: ReceivingStatus) => void,
): Promise<void> {
  let retryDelay = 1_000;

  while (!signal.aborted) {
    try {
      const notification = await api.receiveNotification(signal);
      signal.throwIfAborted();

      if (notification) {
        const incoming = parseIncomingMessage(notification.body);
        if (incoming) onMessage(incoming);
        // Удаляем также неподдерживаемые события, иначе они заблокируют очередь.
        await api.deleteNotification(notification.receiptId, signal);
      }

      signal.throwIfAborted();
      onStatus({ state: 'connected' });
      retryDelay = 1_000;
      // Ограничиваем частоту при быстром пустом ответе или большом числе событий.
      await wait(200, signal);
    } catch (error) {
      if (signal.aborted) return;
      if (error instanceof ApiError && !error.retryable) {
        onStatus({ state: 'stopped', message: error.message });
        return;
      }

      onStatus({ state: 'reconnecting', message: errorMessage(error) });
      try {
        await wait(retryDelay, signal);
      } catch {
        return;
      }
      retryDelay = Math.min(retryDelay * 2, 30_000);
    }
  }
}
