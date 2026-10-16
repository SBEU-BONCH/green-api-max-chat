import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  DEFAULT_API_URL,
  GreenApi,
  normalizeApiUrl,
} from './greenApi';

const credentials = {
  idInstance: '3100000000',
  apiTokenInstance: 'test-token',
  apiUrl: DEFAULT_API_URL,
};
const signal = new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

function mockResponse(body: unknown, status = 200) {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('API credentials', () => {
  it.each([
    'https://api.green-api.com/v3',
    'https://3100.api.green-api.com',
    'https://3502.api.green-api.com/v3/',
  ])('accepts the GREEN-API host %s', (url) => {
    expect(normalizeApiUrl(url)).toBe(url.replace(/\/$/, ''));
  });

  it.each([
    'https://evil.example',
    'https://api.green-api.com.evil.example',
    'https://api.green-api.com@evil.example',
    'http://api.green-api.com',
    'https://evil.api.green-api.com',
    'https://api.green-api.com:8443',
    'https://api.green-api.com/v3?token=test',
    'https://api.green-api.com/v3#test',
    'https://api.green-api.com/another-path',
    'not a url',
  ])(
    'rejects an untrusted or malformed address %s before a request',
    (apiUrl) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      expect(() => new GreenApi({ ...credentials, apiUrl })).toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('rejects a nonnumeric instance ID', () => {
    expect(
      () => new GreenApi({ ...credentials, idInstance: '1/another-method' }),
    ).toThrow();
  });
});

describe('GREEN-API requests', () => {
  it('posts text directly to GREEN-API without cookies or a referrer', async () => {
    const fetchMock = mockResponse({ idMessage: 'message-1' });
    const api = new GreenApi(credentials);

    await expect(api.sendMessage('10000000', 'Привет', signal)).resolves.toBe(
      'message-1',
    );
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.green-api.com/v3/waInstance3100000000/sendMessage/test-token',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ chatId: '10000000', message: 'Привет' }),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      }),
    );
  });

  it('uses the receipt ID after the token in the DELETE URL', async () => {
    const fetchMock = mockResponse({ result: true });
    await new GreenApi(credentials).deleteNotification(42, signal);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.green-api.com/v3/waInstance3100000000/deleteNotification/test-token/42',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('accepts an empty long-poll response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(''));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new GreenApi(credentials).receiveNotification(signal),
    ).resolves.toBeNull();
    expect(fetchMock.mock.calls[0]?.[0]).toContain('?receiveTimeout=25');
  });

  it('rejects a successful HTTP response without a message ID', async () => {
    mockResponse({});
    await expect(
      new GreenApi(credentials).sendMessage('10000000', 'Привет', signal),
    ).rejects.toThrow('подтвердить отправку');
  });

  it('does not expose server response bodies in errors', async () => {
    mockResponse({ error: 'test-token some private data' }, 401);
    const result = new GreenApi(credentials).receiveNotification(signal);
    await expect(result).rejects.toMatchObject({ status: 401 });
    await expect(result).rejects.not.toThrow('test-token');
  });

  it('does not retry sending after a network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network error'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      new GreenApi(credentials).sendMessage('10000000', 'Привет', signal),
    ).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('preserves cancellation instead of converting it into a network error', async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(controller.signal.reason));
    await expect(
      new GreenApi(credentials).receiveNotification(controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('checks authorization and incoming settings without changing the account', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
      .mockResolvedValueOnce(
        Response.json({ webhookUrl: '', incomingWebhook: 'yes' }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await new GreenApi(credentials).connect(signal);
    expect(fetchMock.mock.calls.map((call) => call[1].method)).toEqual([
      'GET',
      'GET',
    ]);
  });

  it('explains how to fix a webhook conflict before starting polling', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ stateInstance: 'authorized' }))
        .mockResolvedValueOnce(
          Response.json({
            webhookUrl: 'https://example.com/hook',
            incomingWebhook: 'yes',
          }),
        ),
    );
    await expect(new GreenApi(credentials).connect(signal)).rejects.toThrow(
      'очистите Webhook URL',
    );
  });

  it('uses the numeric MAX chat ID returned by checkAccount', async () => {
    const fetchMock = mockResponse({ exist: true, chatId: '10000000' });
    await expect(
      new GreenApi(credentials).resolveChat('79991234567', signal),
    ).resolves.toBe('10000000');
    expect(fetchMock.mock.calls[0]?.[1].body).toBe(
      JSON.stringify({ phoneNumber: 79991234567 }),
    );
  });

  it('handles a MAX business error even with HTTP 200', async () => {
    mockResponse({
      status: false,
      reason: 'instance is starting or not authorized',
    });
    await expect(
      new GreenApi(credentials).resolveChat('79991234567', signal),
    ).rejects.toThrow('Не удалось проверить номер');
  });
});
