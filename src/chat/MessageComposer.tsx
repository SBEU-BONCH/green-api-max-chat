import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { LoaderCircle, Send } from 'lucide-react';
import { errorMessage } from '../api/greenApi';

const MAX_MESSAGE_LENGTH = 4_000;

export function MessageComposer({
  onSend,
}: {
  onSend: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const textarea = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !text.trim()) return;
    setPending(true);
    setError('');
    try {
      await onSend(text.trim());
      setText('');
    } catch (error) {
      setError(
        `Не удалось подтвердить отправку. ${errorMessage(error)} Перед повтором проверьте чат в MAX.`,
      );
    } finally {
      setPending(false);
      textarea.current?.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  return (
    <form
      className="composer"
      onSubmit={handleSubmit}
      aria-label="Отправка сообщения"
    >
      {error && (
        <p className="form-error composer-error" role="alert">
          {error}
        </p>
      )}
      <div className="composer-row">
        <label htmlFor="message-text" className="visually-hidden">
          Сообщение
        </label>
        <textarea
          ref={textarea}
          id="message-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          placeholder="Написать сообщение…"
          disabled={pending}
        />
        <button
          className="send-button"
          disabled={pending || !text.trim()}
          aria-label={pending ? 'Отправляем сообщение' : 'Отправить сообщение'}
          title="Отправить сообщение"
        >
          {pending ? (
            <LoaderCircle className="spin" size={21} />
          ) : (
            <Send size={21} />
          )}
        </button>
      </div>
      <div className="composer-hint">
        <span>Enter: отправить · Shift + Enter: новая строка</span>
        <span>
          {text.length > MAX_MESSAGE_LENGTH - 200 &&
            `${text.length} / ${MAX_MESSAGE_LENGTH}`}
        </span>
      </div>
    </form>
  );
}
