import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, X } from 'lucide-react';
import { errorMessage } from '../api/greenApi';
import { normalizePhone } from './model';

interface Props {
  onClose: () => void;
  onCreate: (phone: string) => Promise<void>;
}

export function NewChatDialog({ onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const value = String(new FormData(event.currentTarget).get('phone'));
    setError('');
    setPending(true);
    try {
      await onCreate(normalizePhone(value));
      onClose();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="new-chat-dialog"
      aria-labelledby="new-chat-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <div className="dialog-heading">
        <h2 id="new-chat-title">Новый чат</h2>
        <button
          className="icon-button"
          onClick={onClose}
          disabled={pending}
          aria-label="Закрыть"
        >
          <X size={22} />
        </button>
      </div>
      <p className="dialog-description">
        Введите номер телефона получателя в MAX.
      </p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="recipient-phone">Номер телефона</label>
        <input
          id="recipient-phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="+7 999 123-45-67"
          autoFocus
          required
          disabled={pending}
          aria-describedby={error ? 'phone-error' : 'phone-hint'}
        />
        <p id="phone-hint" className="field-hint">
          С кодом страны: +7 или +375.
        </p>
        {error && (
          <p id="phone-error" className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button dialog-submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="spin" size={19} /> Ищем получателя…
            </>
          ) : (
            'Создать чат'
          )}
        </button>
      </form>
    </dialog>
  );
}
