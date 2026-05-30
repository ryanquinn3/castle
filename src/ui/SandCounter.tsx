import { type FC, useState, useEffect, useRef } from 'react';

interface SandCounterProps {
  count: number;
}

const TICK_DURATION_MS = 300;

const SandCounter: FC<SandCounterProps> = ({ count }) => {
  const [displayed, setDisplayed] = useState(count);
  const [animating, setAnimating] = useState(false);
  const rafRef = useRef(0);
  const startRef = useRef(0);
  const fromRef = useRef(count);

  useEffect(() => {
    if (count === displayed) {
      return;
    }

    fromRef.current = displayed;
    startRef.current = performance.now();
    setAnimating(true);

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / TICK_DURATION_MS);
      const current = Math.round(fromRef.current + (count - fromRef.current) * t);
      setDisplayed(current);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setAnimating(false);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [count]);

  return (
    <div className="sand-counter">
      <img
        className="sand-counter__icon"
        src="./images/sand_inventory_sprite.png"
        alt="Sand"
      />
      <span className="sand-counter__label">Sand:</span>
      <span className={`sand-counter__value ${animating ? 'sand-counter__value--flash' : ''}`}>
        {displayed}
      </span>
    </div>
  );
};

export default SandCounter;
