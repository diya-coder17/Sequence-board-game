import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { Player, TeamColor } from '../../engine';


function Overlay({ children, onClose }: { children: ReactNode; onClose?: () => void }) {
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onClose}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 30, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function PassDeviceModal({ player, color, onReady }: { player: Player; color: TeamColor; onReady: () => void }) {
  return (
    <Overlay>
      <div className="modal">
        <div className="big-chip">
          <span className={`chip ${color}`} />
        </div>
        <h2>{player.name}'s turn</h2>
        <p>Pass the device to {player.name}. Other players, look away!</p>
        <div className="row">
          <button className="btn btn-primary" onClick={onReady} autoFocus>
            I'm {player.name} — show my cards
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function GameOverModal({
  winner,
  color,
  players,
  myTeam,
  rematchLabel,
  onRematch,
  onNewGame,
}: {
  winner: number;
  color: TeamColor;
  players: Player[];
  myTeam: number | null;
  rematchLabel: string;
  onRematch: () => void;
  onNewGame: () => void;
}) {
  const names = players.filter((p) => p.team === winner).map((p) => p.name);
  const youWon = myTeam !== null && myTeam === winner;
  const youLost = myTeam !== null && myTeam !== winner;
  return (
    <Overlay>
      <div className="modal">
        <div className="big-chip">
          <motion.span
            className={`chip ${color}`}
            animate={{ rotate: [0, -8, 8, 0], scale: [1, 1.08, 1] }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6 }}
          />
        </div>
        <h2>{youWon ? 'You win!' : youLost ? 'You lose' : `Team ${winner + 1} wins!`}</h2>
        <p>
          {youLost ? `${names.join(' & ')} completed the required sequences first.` : `Congratulations ${names.join(' & ')} — the required sequences are complete.`}
        </p>
        <div className="row">
          <button className="btn btn-primary" onClick={onRematch}>
            {rematchLabel}
          </button>
          <button className="btn" onClick={onNewGame}>
            New game
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Overlay onClose={onClose}>
      <div className="modal left">
        <h2>How to play Sequence</h2>
        <ul>
          <li>
            <strong>Goal:</strong> with 2 teams, be the first team to make <strong>two</strong> sequences; with 3 teams, make{' '}
            <strong>one</strong>. A sequence is five chips of your colour in a row — horizontally, vertically or diagonally.
          </li>
          <li>
            <strong>Your turn:</strong> pick a card from your hand, place a chip on one of the two matching spaces on the board, then
            a replacement card is drawn automatically.
          </li>
          <li>
            <strong>Free corners</strong> count as your chip for every team. Only four more chips are needed when using one.
          </li>
          <li>
            <strong>Two-eyed Jacks (J♦ J♣)</strong> are wild — place a chip on any open space.
          </li>
          <li>
            <strong>One-eyed Jacks (J♥ J♠)</strong> remove any opponent's chip, unless it's already part of a completed sequence.
          </li>
          <li>
            <strong>Dead cards:</strong> if both spaces for a card are already covered, select it and exchange it for a new card (once
            per turn), then take your normal turn.
          </li>
          <li>Two sequences may share one chip. Chips in a completed sequence can never be removed.</li>
        </ul>
        <div className="row">
          <button className="btn btn-primary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </Overlay>
  );
}

export function Toast({ message }: { message: string | null }) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          className="toast"
          role="alert"
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SequenceBanner({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="banner"
          initial={{ opacity: 0, scale: 0.5, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.2 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
