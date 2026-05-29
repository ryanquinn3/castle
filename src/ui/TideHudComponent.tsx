import { type FC, type CSSProperties, useRef, useEffect } from 'react';
import { TIDE_HIGH_TIDE_WAVE } from '../config.ts';
import './hud.css';

interface LayoutBounds {
  gridLeft: number;
  gridPixelWidth: number;
  mapTop: number;
}

interface TideHudProps {
  wavesCompleted: number;
  best: number;
  countdown: number;
  stateText: string;
  layout: LayoutBounds;
}

const CLOCK_RADIUS = 28;
const CLOCK_W = CLOCK_RADIUS * 2 + 16;
const CLOCK_H = CLOCK_RADIUS + 14;

const TideClock: FC<{ wavesCompleted: number }> = ({ wavesCompleted }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const progress = Math.min(1, wavesCompleted / TIDE_HIGH_TIDE_WAVE);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, CLOCK_W, CLOCK_H);

    const cx = CLOCK_W / 2;
    const cy = CLOCK_H - 4;
    const r = CLOCK_RADIUS;

    ctx.strokeStyle = 'rgba(150, 150, 150, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, 0, false);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(150, 150, 150, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const tickAngle = Math.PI - (i / 4) * Math.PI;
      const innerR = r - 5;
      const outerR = r + 3;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(tickAngle) * innerR, cy - Math.sin(tickAngle) * innerR);
      ctx.lineTo(cx + Math.cos(tickAngle) * outerR, cy - Math.sin(tickAngle) * outerR);
      ctx.stroke();
    }

    const handAngle = Math.PI - progress * Math.PI;
    const handLen = r - 8;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(handAngle) * handLen, cy - Math.sin(handAngle) * handLen);
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '9px sans-serif';
    ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
    ctx.textAlign = 'center';
    ctx.fillText('Low', cx - r + 4, cy + 12);
    ctx.fillText('High', cx + r - 4, cy + 12);
  }, [progress]);

  return <canvas ref={ref} width={CLOCK_W} height={CLOCK_H} className="tide-clock" />;
};

const TideHudComponent: FC<TideHudProps> = ({ wavesCompleted, best, countdown, stateText, layout }) => {
  const leftStyle: CSSProperties = {
    left: layout.gridLeft + 4,
    top: layout.mapTop + 4,
  };

  const rightStyle: CSSProperties = {
    left: layout.gridLeft + layout.gridPixelWidth - 4,
    top: layout.mapTop + 4,
    transform: 'translateX(-100%)',
  };

  return (
    <>
      <div className="hud-panel hud-panel--left" style={leftStyle}>
        <div className="hud-panel__level">Waves: {wavesCompleted}</div>
        {best > 0 && (
          <div className="hud-panel__wave">Best: {best}</div>
        )}
        <TideClock wavesCompleted={wavesCompleted} />
      </div>
      <div className="hud-panel hud-panel--right" style={rightStyle}>
        <div className="hud-panel__wave">Next wave: {countdown}s</div>
        {stateText && (
          <div className="hud-panel__state">{stateText}</div>
        )}
      </div>
    </>
  );
};

export default TideHudComponent;
