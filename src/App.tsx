import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameOptions, PlayerConfig } from './engine';
import { GameScreen } from './ui/components/GameScreen';
import { HomeScreen } from './ui/components/HomeScreen';
import { OnlineLobby } from './ui/components/OnlineLobby';
import { RoomScreen } from './ui/components/RoomScreen';
import { SetupScreen } from './ui/components/SetupScreen';
import { useLocalGame } from './ui/hooks/useLocalGame';
import { useOnlineGame } from './ui/hooks/useOnlineGame';

type Mode = 'home' | 'local-setup' | 'local-game' | 'online';

function LocalGame({ players, options, onExit }: { players: PlayerConfig[]; options: GameOptions; onExit: () => void }) {
  const g = useLocalGame(players, options);
  return <GameScreen g={g} onExit={onExit} />;
}

function Online({ initialCode, onExit }: { initialCode: string | null; onExit: () => void }) {
  const session = useOnlineGame();
  const { room, controller } = session;

  // Arriving via an invite link: join automatically once connected if we already have a name,
  // even if this tab is still remembered in an older room.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (autoJoined.current || !initialCode || session.status !== 'open' || !session.name) return;
    if (room && room.code === initialCode) return;
    autoJoined.current = true;
    session.joinRoom(initialCode);
  }, [initialCode, session, room]);

  if (room && room.status !== 'waiting' && controller) {
    return (
      <GameScreen
        g={controller}
        onExit={() => {
          session.leaveRoom();
        }}
      />
    );
  }
  if (room) return <RoomScreen session={session} />;
  return (
    <OnlineLobby
      session={session}
      initialCode={initialCode}
      onBack={() => {
        session.cancelQuickMatch();
        onExit();
      }}
    />
  );
}

export default function App() {
  const inviteCode = useMemo(() => {
    const code = new URLSearchParams(location.search).get('room');
    return code ? code.toUpperCase().slice(0, 6) : null;
  }, []);
  const [mode, setMode] = useState<Mode>(inviteCode ? 'online' : 'home');
  const [players, setPlayers] = useState<PlayerConfig[] | null>(null);
  const [options, setOptions] = useState<GameOptions>({});
  const [gameKey, setGameKey] = useState(0);

  const goHome = () => {
    setMode('home');
    setPlayers(null);
    if (location.search) history.replaceState(null, '', location.pathname);
  };

  switch (mode) {
    case 'home':
      return <HomeScreen onLocal={() => setMode('local-setup')} onOnline={() => setMode('online')} />;
    case 'local-setup':
      return (
        <SetupScreen
          onStart={(p, o) => {
            setPlayers(p);
            setOptions(o);
            setGameKey((k) => k + 1);
            setMode('local-game');
          }}
          onBack={goHome}
        />
      );
    case 'local-game':
      return <LocalGame key={gameKey} players={players!} options={options} onExit={() => setMode('local-setup')} />;
    case 'online':
      return <Online initialCode={inviteCode} onExit={goHome} />;
  }
}
