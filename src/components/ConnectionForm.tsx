import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { DEFAULT_API_URL, errorMessage, GreenApi } from '../api/greenApi';
import { Brand } from './Brand';

export function ConnectionForm({
  onConnect,
}: {
  onConnect: (api: GreenApi) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const request = new AbortController();
    controller.current = request;
    setError('');
    setPending(true);

    try {
      const api = new GreenApi({
        idInstance: String(data.get('idInstance')).trim(),
        apiTokenInstance: String(data.get('apiTokenInstance')).trim(),
        apiUrl: String(data.get('apiUrl')),
      });
      await api.connect(request.signal);
      request.signal.throwIfAborted();
      onConnect(api);
    } catch (error) {
      if (!request.signal.aborted) setError(errorMessage(error));
    } finally {
      if (!request.signal.aborted) setPending(false);
    }
  }

  return (
    <main className="connection-page">
      <section className="connection-card" aria-labelledby="connection-title">
        <Brand />
        <h1 id="connection-title">Войти в чат</h1>
        <p className="connection-description">
          Подключите свой аккаунт MAX с помощью данных из личного кабинета
          GREEN-API.
        </p>
        <form onSubmit={handleSubmit}>
          <fieldset disabled={pending}>
            <label htmlFor="idInstance">idInstance</label>
            <input
              id="idInstance"
              name="idInstance"
              inputMode="numeric"
              pattern="[0-9]+"
              autoComplete="off"
              placeholder="Номер инстанса"
              required
            />
            <label htmlFor="apiTokenInstance">apiTokenInstance</label>
            <input
              id="apiTokenInstance"
              name="apiTokenInstance"
              type="password"
              autoComplete="off"
              placeholder="Ключ доступа"
              required
            />
            <details className="connection-settings">
              <summary>Адрес API</summary>
              <label htmlFor="apiUrl">apiUrl</label>
              <input
                id="apiUrl"
                name="apiUrl"
                type="url"
                defaultValue={DEFAULT_API_URL}
                required
              />
              <p className="field-hint">
                Если в личном кабинете указан другой адрес API, вставьте его
                сюда.
              </p>
            </details>
          </fieldset>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="primary-button connection-submit"
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircle className="spin" size={19} /> Подключаемся…
              </>
            ) : (
              <>
                Подключиться <ArrowRight size={19} />
              </>
            )}
          </button>
        </form>
        <p className="connection-note">
          Данные доступа хранятся только до закрытия или обновления вкладки.
        </p>
        <p className="connection-note">
          Для проверки используйте тестовый аккаунт. Подключённый инстанс даёт
          GREEN-API доступ к его сообщениям.
        </p>
        <a
          className="external-link"
          href="https://console.green-api.com/"
          target="_blank"
          rel="noreferrer"
        >
          Личный кабинет GREEN-API
        </a>
      </section>
    </main>
  );
}
