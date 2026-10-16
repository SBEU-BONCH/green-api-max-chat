export interface Credentials {
  idInstance: string;
  apiTokenInstance: string;
  apiUrl: string;
}

export interface Notification {
  receiptId: number;
  body: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryable() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export const DEFAULT_API_URL = 'https://api.green-api.com/v3';

export function normalizeApiUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Укажите адрес API из личного кабинета GREEN-API.');
  }
  const validHost = /^(\d+\.)?api\.green-api\.com$/.test(url.hostname);
  const validPath = /^\/(v3\/?)?$/.test(url.pathname);

  if (
    url.protocol !== 'https:' ||
    !validHost ||
    !validPath ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Укажите адрес API из личного кабинета GREEN-API.');
  }

  return url.href.replace(/\/$/, '');
}

function httpError(status: number): ApiError {
  switch (status) {
    case 401:
    case 403:
      return new ApiError(
        'Доступ запрещён. Проверьте idInstance, apiTokenInstance и состояние инстанса.',
        status,
      );
    case 400:
      return new ApiError(
        'GREEN-API отклонил запрос. Проверьте данные и настройки инстанса в личном кабинете.',
        status,
      );
    case 429:
      return new ApiError(
        'Превышена частота запросов. Подождите немного.',
        status,
      );
    case 466:
    case 469:
      return new ApiError(
        'Достигнут лимит GREEN-API или MAX. Проверьте ограничения в личном кабинете.',
        status,
      );
    default:
      return new ApiError(
        `GREEN-API вернул ошибку ${status}. Попробуйте позже.`,
        status,
      );
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить запрос.';
}

export class GreenApi {
  private readonly credentials: Credentials;

  constructor(credentials: Credentials) {
    const idInstance = credentials.idInstance.trim();
    const apiTokenInstance = credentials.apiTokenInstance.trim();
    if (!/^\d+$/.test(idInstance) || !apiTokenInstance) {
      throw new Error('Укажите числовой idInstance и ключ apiTokenInstance.');
    }
    this.credentials = {
      idInstance,
      apiTokenInstance,
      apiUrl: normalizeApiUrl(credentials.apiUrl),
    };
  }

  private async request<T>(
    endpoint: string,
    signal: AbortSignal,
    {
      method = 'GET',
      body,
      suffix = '',
      query = '',
    }: {
      method?: 'GET' | 'POST' | 'DELETE';
      body?: object;
      suffix?: string;
      query?: string;
    } = {},
  ): Promise<T> {
    const { apiUrl, idInstance, apiTokenInstance } = this.credentials;
    const url = `${apiUrl}/waInstance${idInstance}/${endpoint}/${encodeURIComponent(apiTokenInstance)}${suffix}${query}`;
    let response: Response;

    try {
      response = await fetch(url, {
        method,
        signal: AbortSignal.any([signal, AbortSignal.timeout(45_000)]),
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      signal.throwIfAborted();
      throw new ApiError(
        'Нет ответа от GREEN-API. Проверьте подключение и адрес API.',
      );
    }

    if (!response.ok) throw httpError(response.status);

    const text = await response.text();
    try {
      return (text.trim() ? JSON.parse(text) : null) as T;
    } catch {
      throw new ApiError('GREEN-API вернул некорректный ответ.', 502);
    }
  }

  async connect(signal: AbortSignal): Promise<void> {
    const { stateInstance } = await this.request<{ stateInstance: string }>(
      'getStateInstance',
      signal,
    );
    if (stateInstance !== 'authorized') {
      throw new ApiError(
        'Инстанс не готов к работе. Авторизуйте аккаунт MAX в личном кабинете GREEN-API.',
        400,
      );
    }

    const settings = await this.request<{
      webhookUrl: string;
      incomingWebhook: string;
    }>('getSettings', signal);
    if (settings.webhookUrl || settings.incomingWebhook !== 'yes') {
      throw new ApiError(
        'В настройках инстанса GREEN-API очистите Webhook URL и включите «Получать уведомления о входящих сообщениях и файлах». Затем подключитесь снова.',
        400,
      );
    }
  }

  async resolveChat(phone: string, signal: AbortSignal): Promise<string> {
    const result = await this.request<{
      exist?: boolean;
      chatId?: string;
      status?: boolean;
      reason?: string;
    }>('checkAccount', signal, {
      method: 'POST',
      body: { phoneNumber: Number(phone) },
    });

    if (result.status === false) {
      throw new ApiError(
        'Не удалось проверить номер. Проверьте состояние инстанса и лимиты MAX в личном кабинете.',
        400,
      );
    }
    if (!result.exist || !result.chatId) {
      throw new ApiError(
        'Аккаунт MAX не найден или скрыт настройками приватности. Проверьте номер получателя.',
        400,
      );
    }
    return result.chatId;
  }

  async sendMessage(
    chatId: string,
    message: string,
    signal: AbortSignal,
  ): Promise<string> {
    const result = await this.request<{ idMessage: string }>(
      'sendMessage',
      signal,
      { method: 'POST', body: { chatId, message } },
    );
    if (!result?.idMessage)
      throw new ApiError('Не удалось подтвердить отправку сообщения.', 502);
    return result.idMessage;
  }

  receiveNotification(signal: AbortSignal): Promise<Notification | null> {
    return this.request('receiveNotification', signal, {
      query: '?receiveTimeout=25',
    });
  }

  async deleteNotification(
    receiptId: number,
    signal: AbortSignal,
  ): Promise<void> {
    const result = await this.request<{ result: boolean }>(
      'deleteNotification',
      signal,
      { method: 'DELETE', suffix: `/${receiptId}` },
    );
    if (!result?.result)
      throw new ApiError('Не удалось подтвердить получение уведомления.', 502);
  }
}
