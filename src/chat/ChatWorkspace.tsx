import { useState } from 'react';
import { LogOut, MessageCircle, Plus } from 'lucide-react';
import type { GreenApi } from '../api/greenApi';
import { Brand } from '../components/Brand';
import { ChatList } from './ChatList';
import { Conversation } from './Conversation';
import { NewChatDialog } from './NewChatDialog';
import { useChat } from './useChat';

interface Props {
  api: GreenApi;
  onDisconnect: () => void;
}

export function ChatWorkspace({ api, onDisconnect }: Props) {
  const { chats, activeChat, receiving, openChat, sendMessage, selectChat } =
    useChat(api);
  const [newChatOpen, setNewChatOpen] = useState(false);

  return (
    <main
      className={`chat-app${activeChat ? ' has-active-chat' : ''}${receiving.state !== 'connected' ? ' has-connection-error' : ''}`}
    >
      {receiving.state !== 'connected' && (
        <div className="connection-banner" role="alert">
          <span>
            {receiving.message}
            {receiving.state === 'stopped' &&
              ' Выйдите и подключитесь снова после исправления.'}
          </span>
        </div>
      )}
      <aside className="sidebar" aria-label="Чаты">
        <header className="sidebar-header">
          <Brand />
          <button
            className="icon-button"
            onClick={onDisconnect}
            aria-label="Выйти"
            title="Выйти"
          >
            <LogOut size={21} />
          </button>
        </header>
        <div className="sidebar-title">
          <h1>Чаты</h1>
          <button
            className="icon-button new-chat-button"
            onClick={() => setNewChatOpen(true)}
            aria-label="Новый чат"
            title="Новый чат"
          >
            <Plus size={23} />
          </button>
        </div>
        <ChatList
          chats={chats}
          activeChatId={activeChat?.id}
          onSelect={selectChat}
          onCreate={() => setNewChatOpen(true)}
        />
        <div
          className={`receiving-status receiving-${receiving.state}`}
          role="status"
        >
          <span className="status-dot" />
          <span>
            {receiving.state === 'connected'
              ? 'Подключено к MAX'
              : receiving.state === 'reconnecting'
                ? 'Восстанавливаем соединение…'
                : 'Получение сообщений остановлено'}
          </span>
        </div>
      </aside>

      <section className="chat-main" aria-label="Переписка">
        {activeChat ? (
          <Conversation
            key={activeChat.id}
            chat={activeChat}
            onBack={() => selectChat(null)}
            onSend={sendMessage}
          />
        ) : (
          <div className="empty-conversation">
            <span className="empty-conversation-icon">
              <MessageCircle size={39} strokeWidth={1.7} />
            </span>
            <h2>Начните переписку</h2>
            <p>
              Создайте чат по номеру телефона
              <br />
              или выберите его в списке слева.
            </p>
            <button
              className="primary-button"
              onClick={() => setNewChatOpen(true)}
            >
              <Plus size={19} /> Новый чат
            </button>
          </div>
        )}
      </section>
      {newChatOpen && (
        <NewChatDialog
          onClose={() => setNewChatOpen(false)}
          onCreate={openChat}
        />
      )}
    </main>
  );
}
