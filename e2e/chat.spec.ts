import { expect, test, type Page } from '@playwright/test';
import type { Notification } from '../src/api/greenApi';

const testToken = 'e2e-test-token';
const phone = '79991234567';
const chatId = '10000000';

interface RecordedRequest {
  method: string;
  endpoint: string;
  body: unknown;
}

async function mockApi(
  page: Page,
  options: {
    authorized?: boolean;
    sendStatus?: number;
    receiveStatus?: number;
  } = {},
) {
  const queue: Notification[] = [];
  const requests: RecordedRequest[] = [];
  const unexpectedRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === 'http://127.0.0.1:4173') return route.continue();
    if (url.hostname !== 'api.green-api.com') {
      unexpectedRequests.push(url.origin);
      return route.abort();
    }

    const parts = url.pathname.split('/');
    const endpoint =
      parts[parts.findIndex((part) => part.startsWith('waInstance')) + 1] ?? '';
    requests.push({
      method: request.method(),
      endpoint,
      body: request.postDataJSON(),
    });

    let response: unknown;
    let status = 200;
    switch (endpoint) {
      case 'getStateInstance':
        response = {
          stateInstance:
            options.authorized === false ? 'notAuthorized' : 'authorized',
        };
        break;
      case 'getSettings':
        response = { webhookUrl: '', incomingWebhook: 'yes' };
        break;
      case 'checkAccount':
        response = { exist: true, chatId };
        break;
      case 'sendMessage':
        status = options.sendStatus ?? 200;
        response = { idMessage: 'outgoing-1' };
        break;
      case 'receiveNotification':
        await new Promise((resolve) => setTimeout(resolve, 120));
        status = options.receiveStatus ?? 200;
        response = queue[0] ?? null;
        break;
      case 'deleteNotification':
        expect(parts.at(-1)).toBe(String(queue[0]?.receiptId));
        queue.shift();
        response = { result: true };
        break;
      default:
        throw new Error(`Unexpected API method: ${endpoint}`);
    }

    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  return { queue, requests, unexpectedRequests };
}

function incoming(
  text: string,
  receiptId = 1,
  timestamp = Math.floor(Date.now() / 1000),
): Notification {
  return {
    receiptId,
    body: {
      typeWebhook: 'incomingMessageReceived',
      idMessage: 'incoming-1',
      timestamp,
      senderData: {
        chatId,
        chatType: 'user',
        senderName: 'Тестовый собеседник',
        senderPhoneNumber: Number(phone),
      },
      messageData: {
        typeMessage: 'textMessage',
        textMessageData: { textMessage: text },
      },
    },
  };
}

async function connect(page: Page) {
  await page.goto('/');
  await page.getByLabel('idInstance', { exact: true }).fill('3100000000');
  await page.getByLabel('apiTokenInstance', { exact: true }).fill(testToken);
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Чаты', exact: true }),
  ).toBeVisible();
}

async function openChat(page: Page) {
  await page
    .getByRole('button', { name: 'Новый чат', exact: true })
    .first()
    .click();
  await page
    .getByRole('textbox', { name: 'Номер телефона', exact: true })
    .fill('+7 (999) 123-45-67');
  await page.getByRole('button', { name: 'Создать чат', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: `+${phone}`, exact: true }),
  ).toBeVisible();
}

test('sends text, receives a reply and drains duplicate and unsupported notifications', async ({
  page,
}, testInfo) => {
  const api = await mockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await connect(page);
  await openChat(page);

  const textbox = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await textbox.fill('Привет!');
  await textbox.press('Shift+Enter');
  await textbox.pressSequentially('Как дела?');
  await textbox.press('Enter');

  const messages = page.getByRole('list', { name: 'Сообщения', exact: true });
  await expect(
    messages.getByText('Привет!\nКак дела?', { exact: true }),
  ).toBeVisible();
  await expect(textbox).toHaveValue('');
  expect(
    api.requests.find((request) => request.endpoint === 'sendMessage')?.body,
  ).toEqual({ chatId, message: 'Привет!\nКак дела?' });

  const sentAt = await messages.locator('time').getAttribute('datetime');
  const replyTimestamp = Math.floor(Date.parse(sentAt!) / 1000);
  api.queue.push(
    { receiptId: 1, body: { typeWebhook: 'outgoingMessageStatus' } },
    incoming('Всё хорошо', 2, replyTimestamp),
    incoming('Всё хорошо', 3, replyTimestamp),
  );
  await expect(messages.getByText('Всё хорошо', { exact: true })).toHaveCount(
    1,
  );
  await expect.poll(() => api.queue.length).toBe(0);
  await expect(messages.locator('.message-bubble p')).toHaveText([
    'Привет!\nКак дела?',
    'Всё хорошо',
  ]);
  await expect(messages.getByText('Всё хорошо', { exact: true })).toHaveCount(
    1,
  );
  expect(
    api.requests.filter((request) => request.endpoint === 'deleteNotification'),
  ).toHaveLength(3);
  expect(api.unexpectedRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('chat.png') });
});

test('shows a receiving failure even before a chat is opened', async ({
  page,
}) => {
  const api = await mockApi(page, { receiveStatus: 401 });
  await connect(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Доступ запрещён');
  expect(
    api.requests.filter(
      (request) => request.endpoint === 'receiveNotification',
    ),
  ).toHaveLength(1);
});

test('keeps credentials out of storage and the address bar and stops polling on logout', async ({
  page,
  context,
}, testInfo) => {
  const api = await mockApi(page);
  await connect(page);
  await openChat(page);

  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      cookies: document.cookie,
    })),
  ).toEqual({ local: 0, session: 0, cookies: '' });
  expect(await context.cookies()).toEqual([]);
  expect(page.url()).not.toContain(testToken);

  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Назад к чатам' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Войти в чат' }),
  ).toBeVisible();
  const received = api.requests.filter(
    (request) => request.endpoint === 'receiveNotification',
  ).length;
  await page.waitForTimeout(700);
  expect(
    api.requests.filter(
      (request) => request.endpoint === 'receiveNotification',
    ),
  ).toHaveLength(received);
  await page.reload();
  await expect(page.getByLabel('idInstance', { exact: true })).toHaveValue('');
  await expect(
    page.getByLabel('apiTokenInstance', { exact: true }),
  ).toHaveValue('');
  expect(api.unexpectedRequests).toEqual([]);
});

test('rejects a foreign API address without sending credentials', async ({
  page,
}) => {
  const api = await mockApi(page);
  await page.goto('/');
  await page.getByLabel('idInstance', { exact: true }).fill('3100000000');
  await page.getByLabel('apiTokenInstance', { exact: true }).fill(testToken);
  await page.getByText('Адрес API', { exact: true }).click();
  await page
    .getByLabel('apiUrl', { exact: true })
    .fill('https://api.green-api.com.evil.example');
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('адрес API');
  expect(api.requests).toEqual([]);
  expect(api.unexpectedRequests).toEqual([]);
});

test('keeps the draft after a send failure and does not send it again automatically', async ({
  page,
}) => {
  const api = await mockApi(page, { sendStatus: 503 });
  await connect(page);
  await openChat(page);
  const textbox = page.getByRole('textbox', { name: 'Сообщение', exact: true });
  await textbox.fill('Проверьте отправку');
  await page
    .getByRole('button', { name: 'Отправить сообщение', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Не удалось подтвердить отправку',
  );
  await expect(textbox).toHaveValue('Проверьте отправку');
  await expect(page.locator('.message-bubble')).toHaveCount(0);
  await page.waitForTimeout(700);
  expect(
    api.requests.filter((request) => request.endpoint === 'sendMessage'),
  ).toHaveLength(1);
});

test('does not start receiving before the instance is authorized', async ({
  page,
}) => {
  const api = await mockApi(page, { authorized: false });
  await page.goto('/');
  await page.getByLabel('idInstance', { exact: true }).fill('3100000000');
  await page.getByLabel('apiTokenInstance', { exact: true }).fill(testToken);
  await page.getByRole('button', { name: 'Подключиться', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Авторизуйте аккаунт');
  expect(api.requests.map((request) => request.endpoint)).toEqual([
    'getStateInstance',
  ]);
});

test('renders message markup as text and blocks network access to other domains', async ({
  page,
}) => {
  const api = await mockApi(page);
  await connect(page);
  await openChat(page);
  const text = '<img src="https://example.org/steal" onerror="alert(1)">';
  api.queue.push(incoming(text));
  await expect(
    page
      .getByRole('list', { name: 'Сообщения' })
      .getByText(text, { exact: true }),
  ).toBeVisible();
  await expect(page.locator('.message-bubble img')).toHaveCount(0);

  const directive = await page.evaluate(async () => {
    const violation = new Promise<string>((resolve) => {
      document.addEventListener(
        'securitypolicyviolation',
        (event) => resolve(event.effectiveDirective),
        { once: true },
      );
    });
    await fetch('https://example.org/blocked-by-policy').catch(() => undefined);
    return violation;
  });
  expect(directive).toBe('connect-src');
  expect(
    await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content'),
  ).not.toContain('unsafe-inline');
  expect(api.unexpectedRequests).toEqual([]);
});
