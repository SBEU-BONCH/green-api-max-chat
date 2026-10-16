import { useEffect, useRef } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Chat } from './model';
import { MessageComposer } from './MessageComposer';

const timeFormatter = new Intl.DateTimeFormat('ru', {
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormatter = new Intl.DateTimeFormat('ru', {
  day: 'numeric',
  month: 'long',
});

interface Props {
  chat: Chat;
  onBack: () => void;
  onSend: (chatId: string, text: string) => Promise<void>;
}

export function Conversation({ chat, onBack, onSend }: Props) {
  const messages = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = messages.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [chat.messages.length]);

  return (
    <>
      <header className="conversation-header">
        <button
          className="icon-button back-button"
          onClick={onBack}
          aria-label="Назад к чатам"
        >
          <ArrowLeft size={23} />
        </button>
        <Avatar title={chat.title} />
        <div className="conversation-heading">
          <h2>{chat.title}</h2>
          <span>
            MAX
            {chat.phone && chat.title !== `+${chat.phone}`
              ? ` · +${chat.phone}`
              : ''}
          </span>
        </div>
      </header>
      <div ref={messages} className="message-scroll">
        {chat.messages.length === 0 && (
          <div className="conversation-start">Напишите первое сообщение</div>
        )}
        <ol
          className="messages"
          aria-label="Сообщения"
          aria-live="polite"
          aria-relevant="additions"
        >
          {chat.messages.map((message, index) => {
            const previous = chat.messages[index - 1];
            const newDay =
              !previous ||
              new Date(previous.timestamp).toDateString() !==
                new Date(message.timestamp).toDateString();
            return (
              <li
                key={message.id}
                className={`message-row ${message.direction}`}
              >
                {newDay && (
                  <div className="date-separator">
                    {dateFormatter.format(message.timestamp)}
                  </div>
                )}
                <div className="message-bubble">
                  <span className="visually-hidden">
                    {message.direction === 'outgoing' ? 'Вы: ' : 'Собеседник: '}
                  </span>
                  <p>{message.text}</p>
                  <time dateTime={new Date(message.timestamp).toISOString()}>
                    {timeFormatter.format(message.timestamp)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <MessageComposer onSend={(text) => onSend(chat.id, text)} />
    </>
  );
}
