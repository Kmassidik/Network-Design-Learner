import { describe, expect, it } from 'vitest';
import { NODE_H, NODE_W } from '../device-size';
import { PRESETS } from './presets';
import { MEDIUM, linkCarries, portAt, type SimNode } from './types';

/** A device with its ports doing no clever cable detection at all. */
function strict(node: SimNode): SimNode {
  return { ...node, config: { ...node.config, autoMdix: false } };
}

/*
 * Templates are the first thing anyone sees, and a template that names a port
 * its device does not have, or stacks two devices on top of each other, fails
 * silently: the canvas just looks wrong. These assertions are the cheap way to
 * make that impossible.
 */

describe('templates', () => {
  it('has a distinct id for each one', () => {
    const ids = PRESETS.map((preset) => preset.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  for (const preset of PRESETS) {
    describe(preset.name, () => {
      it('plugs every cable into an interface that exists', () => {
        for (const link of preset.topology.links) {
          for (const end of [link.a, link.b]) {
            const node = preset.topology.nodes.find((candidate) => candidate.id === end.node);
            expect(node, `${link.id} names ${end.node}`).toBeDefined();
            if (node === undefined) continue;
            expect(portAt(node.config, end.port), `${link.id} uses ${end.port}`).not.toBeNull();
          }
        }
      });

      it('puts at most one cable in an interface', () => {
        const used = preset.topology.links.flatMap((link) => [
          `${link.a.node}:${link.a.port}`,
          `${link.b.node}:${link.b.port}`,
        ]);
        expect(new Set(used).size).toBe(used.length);
      });

      it('names a cable that exists, and one that is honest about its speed', () => {
        for (const link of preset.topology.links) {
          expect(MEDIUM[link.medium].oneWayMs).toBeGreaterThan(0);
        }
      });

      it('is wired so every cable would still carry data with auto-detection off', () => {
        const byId = new Map(preset.topology.nodes.map((node) => [node.id, node]));
        for (const link of preset.topology.links) {
          const a = byId.get(link.a.node);
          const b = byId.get(link.b.node);
          if (a === undefined || b === undefined) continue;
          expect(
            linkCarries(link, strict(a), strict(b)),
            `${link.id} is wired so that nothing crosses it`,
          ).toBe(true);
        }
      });

      it('leaves room between two device boxes', () => {
        const nodes = preset.topology.nodes;
        for (let a = 0; a < nodes.length; a++) {
          for (let b = a + 1; b < nodes.length; b++) {
            const one = nodes[a];
            const other = nodes[b];
            if (one === undefined || other === undefined) continue;
            const apart =
              Math.abs(one.x - other.x) >= NODE_W || Math.abs(one.y - other.y) >= NODE_H;
            expect(apart, `${one.label} and ${other.label} overlap`).toBe(true);
          }
        }
      });

      it('pings from a device to another device that has an address', () => {
        expect(preset.pingFrom).not.toBe(preset.pingTo);
        const source = preset.topology.nodes.find((node) => node.id === preset.pingFrom);
        const target = preset.topology.nodes.find((node) => node.id === preset.pingTo);
        expect(source?.config.ports.some((port) => port.ip !== '')).toBe(true);
        expect(target?.config.ports.some((port) => port.ip !== '')).toBe(true);
      });
    });
  }
});
