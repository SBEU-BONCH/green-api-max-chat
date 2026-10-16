import { MessageCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import type { Chat } from './model';

const timeFormatter = new Intl.DateTimeFormat('ru', {
  hour: '2-digit',
  minute: '2-digit',
});

interface Props {
  chats: Chat[];
  activeChatId?: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function ChatList({ chats, activeChatId, onSelect, onCreate }: Props) {
  if (chats.length === 0) {
    return (
      <div className="empty-chat-list">
        <MessageCircle size={31} strokeWidth={1.5} />
        <p>Здесь будут ваши чаты</p>
        <button className="text-button" onClick={onCreate}>
          Написать сообщение
        </button>
      </div>
    );
  }

  const sortedChats = [...chats].sort(
    (a, b) =>
      (b.messages.at(-1)?.timestamp ?? 0) - (a.messages.at(-1)?.timestamp ?? 0),
  );

  return (
    <ul className="chat-list">
      {sortedChats.map((chat) => {
        const lastMessage = chat.messages.at(-1);
        return (
          <li key={chat.id}>
            <button
              className={`chat-item${chat.id === activeChatId ? ' selected' : ''}`}
              onClick={() => onSelect(chat.id)}
              aria-current={chat.id === activeChatId ? 'true' : undefined}
            >
              <Avatar title={chat.title} />
              <span className="chat-item-content">
                <span className="chat-item-heading">
                  <span className="chat-item-name">{chat.title}</span>
                  {lastMessage && (
                    <time
                      dateTime={new Date(lastMessage.timestamp).toISOString()}
                    >
                      {timeFormatter.format(lastMessage.timestamp)}
                    </time>
                  )}
                </span>
                <span className="chat-item-preview">
                  <span>
                    {lastMessage
                      ? `${lastMessage.direction === 'outgoing' ? 'Вы: ' : ''}${lastMessage.text}`
                      : 'Пока нет сообщений'}
                  </span>
                  {chat.unread > 0 && (
                    <span
                      className="unread-count"
                      aria-label={`Непрочитанных: ${chat.unread}`}
                    >
                      {chat.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
