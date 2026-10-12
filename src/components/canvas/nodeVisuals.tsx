import type { ReactElement } from 'react';
import { PICTURE_BOX } from '../../device-size';
import { KIND } from '../../sim/kinds';
import type { NodeKind } from '../../sim/types';

/**
 * The picture drawn inside a device box. These are third-party symbols with
 * their own licences, which is why they keep their own colours instead of
 * taking the theme tokens everything else uses. See md/ASSETS.md.
 */
export function DevicePicture({ kind }: { kind: NodeKind }): ReactElement {
  return (
    <image
      className="cv-picture"
      href={`/symbols/${KIND[kind].symbol}`}
      x={PICTURE_BOX.x}
      y={PICTURE_BOX.y}
      width={PICTURE_BOX.width}
      height={PICTURE_BOX.height}
      preserveAspectRatio="xMidYMid meet"
    />
  );
}
