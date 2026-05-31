import type { FC } from 'react';
import './tool-cost-badge.css';

interface ToolCostBadgeProps {
  amount: number;
  variant: 'earn' | 'spend';
}

const ToolCostBadge: FC<ToolCostBadgeProps> = ({ amount, variant }) => (
  <div className={`tool-cost-badge tool-cost-badge--${variant}`}>
    <img
      className="tool-cost-badge__icon"
      src="./images/sand_inventory_sprite.png"
      alt="Sand"
    />
    <span className="tool-cost-badge__amount">{amount}</span>
  </div>
);

export default ToolCostBadge;
