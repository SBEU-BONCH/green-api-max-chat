import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/greenApi';
import { parseIncomingMessage, receiveMessages } from './notifications';

const body = {
  typeWebhook: 'incomingMessageReceived',
  idMessage: 'm1',
  timestamp: 1_760_000_000,
  senderData: {
    chatId: '10000000',
    chatType: 'user',
    senderName: 'Собеседник',
    senderPhoneNumber: 79991234567,
  },
  messageData: {
    typeMessage: 'textMessage',
    textMessageData: { textMessage: 'Привет' },
  },
};

afterEach(() => vi.useRealTimers());

describe('notification parsing', () => {
  it('converts a MAX text notification into a chat message', () => {
    expect(parseIncomingMessage(body)).toEqual({
      title: 'Собеседник',
      phone: '79991234567',
      message: {
        id: 'm1',
        chatId: '10000000',
        text: 'Привет',
        timestamp: 1_760_000_000_000,
        direction: 'incoming',
      },
    });
  });

  it('accepts text messages containing a URL', () => {
    const messageData = {
      typeMessage: 'extendedTextMessage',
      extendedTextMessageData: { text: 'https://example.com' },
    };
    expect(parseIncomingMessage({ ...body, messageData })?.message.text).toBe(
      'https://example.com',
    );
  });

  it.each([
    null,
    {},
    { typeWebhook: 'outgoingMessageStatus' },
    { ...body, messageData: {} },
    { ...body, senderData: { chatType: 'group', chatId: '-123' } },
  ])('ignores unsupported or malformed events', (event) => {
    expect(parseIncomingMessage(event)).toBeNull();
  });
});

describe('receiving loop', () => {
  it('processes a message before acknowledging it and also drains unsupported events', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const order: string[] = [];
    const api = {
      receiveNotification: vi
        .fn()
        .mockResolvedValueOnce({ receiptId: 1, body })
        .mockResolvedValueOnce({
          receiptId: 2,
          body: { typeWebhook: 'outgoingMessageStatus' },
        })
        .mockImplementation(async () => {
          controller.abort();
          return null;
        }),
      deleteNotification: vi.fn(async (receiptId: number) => {
        order.push(`delete:${receiptId}`);
      }),
    };
    const running = receiveMessages(
      api,
      controller.signal,
      () => order.push('message'),
      vi.fn(),
    );
    await vi.runAllTimersAsync();
    await running;
    expect(order).toEqual(['message', 'delete:1', 'delete:2']);
  });

  it('does not read another event while acknowledgement is pending', async () => {
    const controller = new AbortController();
    const onStatus = vi.fn();
    let finish!: () => void;
    const api = {
      receiveNotification: vi.fn().mockResolvedValue({ receiptId: 1, body }),
      deleteNotification: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const running = receiveMessages(api, controller.signal, vi.fn(), onStatus);
    await vi.waitFor(() =>
      expect(api.deleteNotification).toHaveBeenCalledOnce(),
    );
    expect(api.receiveNotification).toHaveBeenCalledOnce();
    controller.abort();
    finish();
    await running;
    expect(api.receiveNotification).toHaveBeenCalledOnce();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('backs off on temporary failures and recovers', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const onStatus = vi.fn();
    const api = {
      receiveNotification: vi
        .fn()
        .mockRejectedValueOnce(new ApiError('Временная ошибка', 503))
        .mockResolvedValueOnce(null)
        .mockImplementation(async () => {
          controller.abort();
          return null;
        }),
      deleteNotification: vi.fn(),
    };
    const running = receiveMessages(api, controller.signal, vi.fn(), onStatus);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(api.receiveNotification).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    await running;
    expect(onStatus.mock.calls.map(([status]) => status.state)).toEqual([
      'reconnecting',
      'connected',
    ]);
  });

  it('stops on an authorization failure instead of retrying indefinitely', async () => {
    const api = {
      receiveNotification: vi
        .fn()
        .mockRejectedValue(new ApiError('Доступ запрещён', 401)),
      deleteNotification: vi.fn(),
    };
    const onStatus = vi.fn();
    await receiveMessages(api, new AbortController().signal, vi.fn(), onStatus);
    expect(api.receiveNotification).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenLastCalledWith({
      state: 'stopped',
      message: 'Доступ запрещён',
    });
  });

  it('cancels the retry timer on logout', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const api = {
      receiveNotification: vi.fn().mockRejectedValue(new ApiError('Нет сети')),
      deleteNotification: vi.fn(),
    };
    const running = receiveMessages(api, controller.signal, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await running;
    await vi.runAllTimersAsync();
    expect(api.receiveNotification).toHaveBeenCalledOnce();
  });
});
