import { memo, type ReactElement } from 'react';
import { KIND } from '../../sim/kinds';
import { MEDIUM, primaryPort, type SimLink, type SimNode } from '../../sim/types';
import { DevicePicture } from './nodeVisuals';
import { NODE_H, NODE_W } from '../../device-size';

/*
 * What the board draws. Both are memoised, and both take plain numbers and
 * booleans rather than callbacks or objects, so moving one device repaints that
 * device and nothing else. Kept away from the gesture code on purpose: this
 * file is about what a device looks like, and Canvas.tsx is about what the
 * pointer does.
 */

/** One cable. */
export const LinkView = memo(function LinkView({
  link,
  x1,
  y1,
  x2,
  y2,
  selected,
  hovered,
  carries,
}: {
  link: SimLink;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  selected: boolean;
  /** True when the pointer is over this cable. */
  hovered: boolean;
  /** False when this cable cannot pass data at all. */
  carries: boolean;
}): ReactElement {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  // Push the interface names out past the edge of both device boxes and off the
  // line, so a cable says which socket it uses at each end.
  const along = NODE_W / 2 + 18;
  const aside = 13;
  const spec = MEDIUM[link.medium];
  return (
    <g
      className={selected ? 'cv-link is-selected' : hovered ? 'cv-link is-hovered' : 'cv-link'}
      data-broken={carries ? undefined : 'true'}
    >
      <line className="cv-link-hit" data-hit="link" data-id={link.id} x1={x1} y1={y1} x2={x2} y2={y2} />
      <line className="cv-link-line" x1={x1} y1={y1} x2={x2} y2={y2} />
      {/*
       * Kept short on purpose. Devices sit about one hundred and twenty world
       * units apart, and anything longer than that disappears underneath them:
       * the words for the medium live in the cable inspector.
       */}
      <text className="cv-link-label" x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 14}>
        {carries ? `${spec.short} ${spec.oneWayMs} ms` : 'no link'}
      </text>
      <text className="cv-port num" x={x1 + ux * along + -uy * aside} y={y1 + uy * along + ux * aside}>
        {link.a.port}
      </text>
      <text className="cv-port num" x={x2 - ux * along + -uy * aside} y={y2 - uy * along + ux * aside}>
        {link.b.port}
      </text>
    </g>
  );
});

/** One device. */
export const NodeView = memo(function NodeView({
  node,
  selected,
  hovered,
  wiring,
  related,
}: {
  node: SimNode;
  selected: boolean;
  /** True when the pointer is over this device. */
  hovered: boolean;
  /** True when this device is the end a cable is being drawn from. */
  wiring: boolean;
  /** True when the selected device can reach this one without a router. */
  related: boolean;
}): ReactElement {
  const shown = primaryPort(node.config);
  const addressed = shown !== null && shown.ip !== '';
  const className = [
    'cv-node',
    selected ? 'is-selected' : '',
    hovered ? 'is-hovered' : '',
    wiring ? 'is-wiring' : '',
    related ? 'is-related' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <g
      className={className}
      data-hit="node"
      data-id={node.id}
      data-kind={node.kind}
      transform={`translate(${node.x} ${node.y})`}
    >
      <rect
        className="cv-halo"
        x={-NODE_W / 2 - 4}
        y={-NODE_H / 2 - 4}
        width={NODE_W + 8}
        height={NODE_H + 8}
        rx={13}
      />
      <rect
        className="cv-box"
        x={-NODE_W / 2}
        y={-NODE_H / 2}
        width={NODE_W}
        height={NODE_H}
        rx={10}
      />
      <DevicePicture kind={node.kind} />
      <text className="cv-label" y={40}>
        {node.label}
      </text>
      <text className="cv-addr num" y={62}>
        {shown === null
          ? ''
          : addressed
            ? `${shown.ip}/${shown.prefix}`
            : `${KIND[node.kind].portCount} ports`}
      </text>
    </g>
  );
});
