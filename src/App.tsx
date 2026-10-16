import { useState } from 'react';
import type { GreenApi } from './api/greenApi';
import { ConnectionForm } from './components/ConnectionForm';
import { ChatWorkspace } from './chat/ChatWorkspace';

export function App() {
  const [api, setApi] = useState<GreenApi | null>(null);

  return api ? (
    <ChatWorkspace api={api} onDisconnect={() => setApi(null)} />
  ) : (
    <ConnectionForm onConnect={setApi} />
  );
}
