interface Props {
  onLocal: () => void;
  onOnline: () => void;
}

export function HomeScreen({ onLocal, onOnline }: Props) {
  return (
    <div className="setup">
      <div className="setup-card home">
        <div className="brand">
          <div className="brand-logo" aria-hidden>
            <i /><i /><i /><i />
          </div>
          <h1>Sequence</h1>
        </div>
        <p className="subtitle">The classic strategy game of cards and chips. Five in a row makes a sequence.</p>
        <div className="mode-grid">
          <button className="mode-card" onClick={onOnline}>
            <span className="mode-icon">🌐</span>
            <span className="mode-title">Play online</span>
            <span className="mode-desc">Find an opponent instantly, or create a private room and send friends the link.</span>
          </button>
          <button className="mode-card" onClick={onLocal}>
            <span className="mode-icon">🎲</span>
            <span className="mode-title">Play on this device</span>
            <span className="mode-desc">Challenge the computer or pass the device around with friends in the same room.</span>
          </button>
        </div>
      </div>
    </div>
  );
}
