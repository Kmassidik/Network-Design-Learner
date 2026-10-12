# Network Design Learner

Learn networking by building a small network on a canvas and watching the frames travel. ARP, MAC
addresses, subnet masks, ping, and the switches and routers that sit between two PCs.

## Running it

There is no `node` on this machine's path and nothing should be installed by hand. Node comes from
nix:

```bash
nix shell nixpkgs#nodejs_24 -c npm install
nix shell nixpkgs#nodejs_24 -c npm run dev      # http://127.0.0.1:5173
nix shell nixpkgs#nodejs_24 -c npm test         # vitest
nix shell nixpkgs#nodejs_24 -c npm run build    # typecheck, then a production build
```

The dev server binds to `127.0.0.1` on purpose; bound to `localhost` it can end up on IPv6 only,
which is a confusing thing to debug later.

## Where things are

| Path | What it is |
| --- | --- |
| `src/sim` | The simulation. Address maths, an event heap, ARP, ICMP, and a behaviour per device kind. Pure TypeScript with no DOM, and the tests that pin its numbers. |
| `src/components` | The canvas, the inspector and the rest of the interface. |
| `src/content` | The words: glossary entries, and the sentences the packet log is written from. |
| `src/index.css` | Every colour, once, as an OKLCH token. A colour written anywhere else fails the test suite. |
| `public/symbols` | Device pictures. Third-party, see the licence below. |
| `md/` | The plan, and the asset notes. |
| `reference/` | Upstream projects kept for reading. Never built, never shipped. |

## The devices, and what each one does differently

Every kind is a real behaviour in `src/sim/behaviour-*.ts`, not a picture with different numbers.

| Device | Interfaces | What it does that the others do not |
| --- | --- | --- |
| PC | 1 | Speaks only for itself. Sends to its gateway for anything outside its own network, and drops the rest. |
| Hub | 8 | Repeats every frame out of every other port. Reads no addresses and remembers nothing, so everybody sees everybody's traffic. |
| Switch | 8 | Learns which hardware address is on which port, then sends a frame for a known address out of one port only. Floods while it is still learning. |
| Router | 4 | Holds one address per interface. Forwards between the networks it is attached to, takes one off the hop count each time, and throws the frame away at zero. |
| Firewall | 2 | Joins two networks like a router, remembers conversations that started inside, and refuses anything arriving from outside that nothing asked for. |
| Internet cloud | 1 | Answers for addresses that are not on the cable it is reached over, which is what makes it the way out of a network. It never claims an address that belongs to a device on that cable. |

A cable is named at both ends with the interface it is plugged into, and what it is made of decides
how long a frame takes to cross it, one way:

| Cable | Plug | One way | Two ways |
| --- | --- | --- | --- |
| Copper twisted pair | RJ45 | 0.5 ms | 1.0 ms |
| Fibre optic | LC | 2.5 ms | 5.0 ms |
| Wireless | antenna | 3 ms | 6.0 ms |
| Serial wide area link | V.35 | 20 ms | 40 ms |

Those are the numbers a ping is measured against, and the cable panel says so in as many words: one
frame takes 0.5 ms to cross a copper cable, a ping crosses it twice, so that cable on its own adds
1.0 ms to the round trip.

## Straight through and crossover

Copper is not just copper. Two devices of the same sort, two computers or two switches, transmit on
**the same pair of wires**, so a cable between them has to be a **crossover**. A computer and a
switch are opposites, so a **straight through** cable is the one that works. A cable wired the wrong
way round carries nothing at all: the canvas draws it dotted and labels it `no link`, and the packet
log explains why on the first frame anybody tries to send.

Every port made this century works it out for itself, so each device starts with *ports work the
cable out by themselves* switched on, and the cable in the box almost never matters any more. Turn
that off on both ends to see the rule that used to bite. The templates are wired correctly on their
own, which a test asserts with auto-detection switched off.

A cable also has to have a plug that fits: a computer has RJ45 and a wireless antenna, a router adds
fibre and a serial port, and a switch has RJ45 and fibre. The cable inspector only offers what both
ends can take.

## When a ping does not arrive, the app corrects you

Press **Check** and the run happens without the animation: you are told what
stopped the packet, why, in your own numbers, and the smallest change that fixes it.

> **PC1 decided the address was somewhere else**
> 192.168.1.2 is not in the same network as PC1. Its eth0 is 192.168.1.130/25,
> which is the network 192.168.1.128/25, and that does not contain 192.168.1.2.
> Either widen the mask on PC1 until both addresses fall in one network, or set a
> gateway to a device that can reach 192.168.1.2.
> Read about Subnet mask ↗

The correction is written from the run that just happened and the board it happened on, so the
addresses in it are yours. Theory sits behind the link for anyone who wants it, and the correction
disappears the moment you change the board, rather than describing a board that no longer exists.

**Ping** is the same run with the animation, for watching the frames travel. **Check** is for the
loop of changing one thing and seeing whether it worked.

## Lessons

Twelve boards, each with exactly one thing wrong. The app **checks the goal itself**: it runs the ping in the simulation
and reports whether it arrives, so "It works" on screen is a measurement rather than a claim.

| Guided — the task names the change | Find the fault — only the symptom is given |
| --- | --- |
| Make them neighbours (a mask too long) | A gateway nobody owns |
| Give it a way out (no gateway) | A cable one end has no socket for |
| A cable both ends can use (straight between two computers) | A circle between two hubs |
| Point the firewall outwards | A mask too long for the cable |
| An interface with no address (a router) | A router pointed the wrong way |
| Reach the internet (a missing gateway) | A firewall facing the wrong way |

Every board carries the one change that fixes it, written as code in `repair`. That is what makes the
lesson data honest: a test proves the goal **fails as handed over** and **passes after that one change
and nothing else**, for every board, and that the correction names the fault it was built to have. Add
a board to `src/sim/lessons-guided.ts` or `src/sim/lessons-faults.ts` and the same test bar applies.

The check runs on a network of its own, so asking whether the board works never disturbs the one on
screen, and it runs again after every edit, which is why the state changes as soon as the fault is fixed.

## Templates

| Template | What it is for |
| --- | --- |
| Two PCs on one cable | Frames, MAC addresses, and why the first ping costs more than the ones after it. |
| Two PCs through a switch | Learning, flooding, and the difference between a switch and a hub. |
| Two addresses, one mask | Two addresses one apart that cannot reach each other, because a /25 mask splits the network between them. |

## Keys

| Key | What it does |
| --- | --- |
| `f` | Hide the panels, or show them again. **Hide panels** sits on the canvas top right, so it is always in the same place either way. |
| `Escape` | Show the panels again, close a menu, and cancel a half drawn cable. |
| `Delete` | Remove everything selected. |
| `Ctrl+Z` | Undo. A drag, or a typed address, is one step rather than one per pixel or per keystroke. |
| `Ctrl+Shift+Z`, `Ctrl+Y` | Redo. |

Mouse:

| Input | What it does |
| --- | --- |
| Left click | Select a device or a cable. On empty space, clear the selection. |
| Shift or ctrl click | Add to, or take out of, the selection. |
| Left drag a device | Move it, and everything else selected with it. |
| Left drag empty space | Sweep a box over the board to select several devices at once. |
| Middle drag, or space and drag | Pan. Left drag on empty space sweeps instead, so panning is these two. |
| Right click | The menu for whatever is under the pointer: a device, a cable, or the board. |
| Wheel | Zoom. |

With the panels hidden the canvas fills the window, the devices are framed larger, and the newest
line of the run is shown on the canvas itself, so hiding the log does not hide the output. The ping
button and the playback bar stay where they are.

## What the numbers mean

Times come from the event loop, never from a formula applied to a table. A ping between two PCs on
one copper cable reports a 1.1 ms round trip because the engine walks the actual hops: 0.5 ms out,
0.1 ms for the device to turn it around, 0.5 ms back. The first ping also pays for the address
lookup, and the log says how much that added, separately from the round trip.

Playback is stretched so a person can watch it, and the factor is printed next to the scrubber,
because a stretched clock must not look like a real one.

## Commands beyond running it

```bash
nix shell nixpkgs#nodejs_24 -c npm test         # 217 tests
nix shell nixpkgs#nodejs_24 -c npm run typecheck
nix shell nixpkgs#nodejs_24 -c npm run build
```

## Licence

This project is distributed under the **GNU General Public License, version 2 or later**. That is not
a free choice: the device pictures in `public/symbols` are GPL-2.0, and anything distributing them
together has to be.

- Ten of the device symbols (router, ethernet switch, multilayer switch, hub, firewall, cloud, NAT,
  ASA, ATM switch, frame relay switch) are by **Jeremy Grossmann**, created for the GNS3 project, and
  are **GPL-2.0**.
- Six (a computer and five hypervisor pictures) are by **Andy Fitzsimon**, from the Etiquette icon set
  published through openclipart, and are **public domain**.
- The application code and the simulation are this project's own work.

`md/ASSETS.md` lists every file, its author, and the licence read out of the file itself.

GNS3 was read, never copied: `reference/gns3-gui` is a clone kept for reference, is ignored by git,
and nothing in `src/` imports from it.

# network-design-learner
