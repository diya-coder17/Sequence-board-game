import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { isOneEyedJack, isTwoEyedJack } from '../../engine';
import type { GameController } from '../hooks/controller';
import { describeLastMove } from '../moveText';
import { Board } from './Board';
import { Hand } from './Hand';
import { GameOverModal, PassDeviceModal, RulesModal, SequenceBanner, Toast } from './Modals';
import { Sidebar } from './Sidebar';
import { TurnTimer } from './TurnTimer';

interface Props {
  g: GameController;
  onExit: () => void;
}

const EVENT_TITLE: Record<string, string> = {
  wild: 'Two-eyed Jack · Wild',
  remove: 'One-eyed Jack · Chip removed',
  sequence: 'Sequence!',
  info: 'Update',
  warning: 'Heads up',
  timeout: 'Time\'s up',
};

export function GameScreen({ g, onExit }: Props) {
  const [showRules, setShowRules] = useState(false);
  const { state } = g;
  const current = state.players[state.currentPlayer];
  const viewer = g.viewerId >= 0 ? state.players[g.viewerId] : null;
  const showHand = g.canAct || (!!viewer && !g.needsHandoff && state.winner === null);
  const selectedDead = g.selectedCard ? g.deadCards.has(g.selectedCard) : false;
  const last = describeLastMove(state);

  let prompt = '';
  if (state.winner !== null) prompt = 'Game over.';
  else if (g.waitingText) prompt = g.waitingText;
  else if (!g.canAct) prompt = '';
  else if (g.stuck) prompt = 'No legal moves — pass your turn.';
  else if (!g.selectedCard) prompt = 'Your turn — select a card from your hand.';
  else if (selectedDead) prompt = 'This card is dead — exchange it for a new one.';
  else if (isTwoEyedJack(g.selectedCard)) prompt = 'Wild! Place a chip on any open space. Everyone will be told you used a two-eyed Jack.';
  else if (isOneEyedJack(g.selectedCard)) prompt = "Choose an opponent's chip to remove.";
  else if (g.legal.length === 0) prompt = 'Both spaces are taken for this card.';
  else prompt = 'Click a highlighted space on the board.';

  return (
    <div className="game">
      <header className="topbar">
        <h1>Sequence</h1>
        <div className="right">
          {g.roomName && <span className="pill room-name" title={g.roomName}>{g.roomName}</span>}
          {g.roomCode && <span className="pill">Code {g.roomCode}</span>}
          {g.connection && (
            <span className="pill conn reconnecting">
              <i /> {g.connection}
            </span>
          )}
          <span className="pill">Turn {state.turn}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowRules(true)}>
            Rules
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onExit}>
            Quit
          </button>
          <button className="btn btn-ghost btn-sm mobile-only" onClick={() => document.querySelector('.sidebar')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Show players and log">
            ☰
          </button>
        </div>
      </header>

      <div className="main">
        <Board
          state={state}
          legal={g.canAct ? g.legal : []}
          hints={g.canAct ? g.hints : []}
          hoverPos={g.hoverPos}
          onHover={g.setHoverPos}
          onCellClick={g.clickCell}
          previewTeam={current?.team ?? 0}
        />
        <Sidebar state={state} viewerId={g.viewerId} thinking={!!g.waitingText} seats={g.seats} />
      </div>

      <footer className="hand-bar">
        <div className="status">
          <div className="who">
            {current && <span className={`chip ${state.teamColors[current.team]} inline-chip`} />}
            {state.turnSeconds > 0 && state.winner === null && current && (
              <TurnTimer seconds={state.turnSeconds} startedAt={g.turnStartedLocal} active={!g.needsHandoff} />
            )}
            {current?.name}
            {current?.isAI && <span className="pill tiny">AI</span>}
            {viewer && current?.id === viewer.id && !current.isAI && <span className="pill tiny">You</span>}
          </div>
          <div className="what">{prompt}</div>
          {last && (
            <div className={`last-move ${last.kind}`}>
              <b>Last move:</b> {last.message}
            </div>
          )}
        </div>

        {showHand && viewer ? (
          <Hand
            cards={viewer.hand}
            selected={g.selectedCard}
            deadCards={g.deadCards}
            playable={g.playable}
            disabled={!g.canAct}
            onSelect={g.selectCard}
            onHover={g.setHoverCard}
          />
        ) : (
          <div className="hand" style={{ alignItems: 'center' }}>
            <div className="hand-hidden">
              {state.winner === null && <span className="spinner" />}
              {state.winner === null ? (current ? `${current.name}'s cards are hidden` : 'Waiting…') : 'Thanks for playing!'}
            </div>
          </div>
        )}

        <div className="actions">
          {g.canAct && selectedDead && (
            <button className="btn btn-primary btn-sm" onClick={g.exchangeDeadCard}>
              Exchange dead card
            </button>
          )}
          {g.canAct && g.stuck && (
            <button className="btn btn-danger btn-sm" onClick={g.pass}>
              Pass turn
            </button>
          )}
          {g.canAct && g.selectedCard && !selectedDead && (
            <button className="btn btn-ghost btn-sm" onClick={() => g.selectCard(g.selectedCard!)}>
              Deselect
            </button>
          )}
        </div>
      </footer>

      <Toast message={g.error} />
      <AnimatePresence>
        {g.connection && (
          <motion.div className="reconnect-bar" role="status" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }}>
            <span className="spinner" /> Connection lost — reconnecting to the game server… your game is saved.
          </motion.div>
        )}
      </AnimatePresence>
      <SequenceBanner show={!!g.banner} text={g.banner ?? ''} />

      <AnimatePresence>
        {g.event && (
          <motion.div
            key={g.event.id}
            className={`event-callout ${g.event.kind}`}
            role="status"
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <span className="event-icon">
              {g.event.kind === 'wild' ? '🃏' : g.event.kind === 'remove' ? '✂️' : g.event.kind === 'sequence' ? '⭐' : g.event.kind === 'timeout' ? '⏰' : 'ℹ️'}
            </span>
            <div>
              <div className="event-title">{EVENT_TITLE[g.event.kind]}</div>
              <div className="event-msg">{g.event.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {g.needsHandoff && current && <PassDeviceModal key="pass" player={current} color={state.teamColors[current.team]} onReady={g.acknowledgeHandoff} />}
        {state.winner !== null && !g.banner && (
          <GameOverModal
            key="over"
            winner={state.winner}
            color={state.teamColors[state.winner]}
            players={state.players}
            myTeam={viewer?.team ?? null}
            rematchLabel={g.rematchLabel}
            rematchWanted={g.rematchWanted}
            rematchVoted={g.rematchVoted}
            headToHead={g.headToHead}
            onRematch={g.rematch}
            onNewGame={onExit}
          />
        )}
        {showRules && <RulesModal key="rules" onClose={() => setShowRules(false)} />}
      </AnimatePresence>
    </div>
  );
}
