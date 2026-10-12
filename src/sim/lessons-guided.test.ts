import { describe, expect, it } from 'vitest';
import { NODE_H, NODE_W } from '../device-size';
import { checkGoal } from './lesson';
import { GUIDED } from './lessons-guided';
import { portAt } from './types';

/*
 * The promise of a guided board is that it has exactly one fault and that the
 * reader is told the right thing about it, so each board is run three ways: the
 * goal fails as handed over, it passes after the board's own repair and nothing
 * else, and the correction names the fault that was planted. The correction is
 * built from the run that just happened, so the words checked here are the
 * reader's own numbers.
 */

/**
 * What each broken board must say, so that a mask or an address edited by
 * accident fails here rather than in front of a reader. `detail` is a fragment
 * that has to appear in the explanation, which is what makes it the reader's
 * numbers rather than a general sentence.
 */
const EXPECTED: Record<string, { headline: string; topic: string; detail: string }> = {
  'guided-make-them-neighbours': {
    // PC1's /25 leaves PC2 in the other half of 192.168.1.0, so PC1 never treats it as a neighbour.
    headline: 'PC1 decided the address was somewhere else',
    topic: 'subnet-mask',
    detail: '192.168.1.130/25',
  },
  'guided-give-it-a-way-out': {
    // The far network is outside PC1's own, and PC1 has nothing to hand the packet to.
    headline: 'PC1 decided the address was somewhere else',
    topic: 'subnet-mask',
    detail: '192.168.2.10',
  },
  'guided-a-cable-both-ends-can-use': {
    // A straight through cable between two computers joins transmit to transmit.
    headline: 'Nothing crosses this cable',
    topic: 'auto-mdix',
    detail: 'same pair of wires',
  },
  'guided-point-the-firewall-outwards': {
    // The outside port is set to the inside interface, so the frame looks uninvited.
    headline: 'The firewall refused it',
    topic: 'firewall-state',
    detail: 'faces the outside',
  },
  'guided-an-interface-with-no-address': {
    // R1 has no interface in the far network, so the packet stops at the router.
    headline: 'R1 has no route to that network',
    topic: 'gateway',
    detail: '192.168.2.10',
  },
  'guided-reach-the-internet': {
    // The cloud is outside PC1's own network and PC1 has no gateway.
    headline: 'PC1 decided the address was somewhere else',
    topic: 'subnet-mask',
    detail: '203.0.113.2',
  },
};

describe('the guided boards', () => {
  it('are the six lessons, each with its own id', () => {
    expect(GUIDED).toHaveLength(6);
    const ids = GUIDED.map((board) => board.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const board of GUIDED) {
    describe(board.id, () => {
      it('is handed over broken: the goal ping does not arrive', () => {
        expect(checkGoal(board.topology, board.goal).met).toBe(false);
      });

      it('works after the repair, and nothing else', () => {
        expect(checkGoal(board.repair(board.topology), board.goal).met).toBe(true);
        // A repair that changed nothing would pass the line above on a board
        // that was never broken, so the change has to be a real one.
        expect(board.repair(board.topology)).not.toEqual(board.topology);
      });

      it('tells the reader what stopped it, in this lesson\u2019s own words', () => {
        const expected = EXPECTED[board.id];
        expect(expected, `no expectation written for ${board.id}`).toBeDefined();
        const { correction } = checkGoal(board.topology, board.goal);
        expect(correction?.headline).toBe(expected?.headline);
        expect(correction?.topic).toBe(expected?.topic);
        expect(correction?.detail).toContain(expected?.detail ?? '');
      });

      it('plugs every cable into an interface that exists, one cable per interface', () => {
        for (const link of board.topology.links) {
          for (const end of [link.a, link.b]) {
            const node = board.topology.nodes.find((candidate) => candidate.id === end.node);
            expect(node, `${link.id} names ${end.node}`).toBeDefined();
            if (node === undefined) continue;
            expect(portAt(node.config, end.port), `${link.id} uses ${end.port}`).not.toBeNull();
          }
        }
        const used = board.topology.links.flatMap((link) => [
          `${link.a.node}:${link.a.port}`,
          `${link.b.node}:${link.b.port}`,
        ]);
        expect(new Set(used).size).toBe(used.length);
      });

      it('gives every interface its own hardware address', () => {
        // The addresses come out of `serial`, so a repeated serial would put the
        // same hardware address on two devices and break delivery silently.
        const macs = board.topology.nodes.flatMap((node) => node.config.ports.map((port) => port.mac));
        expect(macs.length).toBeGreaterThan(0);
        expect(new Set(macs).size).toBe(macs.length);
      });

      it('leaves room between two device boxes', () => {
        const nodes = board.topology.nodes;
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
    });
  }
});
