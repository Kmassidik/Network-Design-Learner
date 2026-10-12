# Network Design Learner — Project Blueprint

A CCNA-oriented network learning web app built on the Breakscale architecture
(canvas + components + live simulation + guided lessons). MIT-licensed upstream,
so we build on it with attribution kept in the README.

Upstream studied on 2026-10-11. Architecture notes below are verified against
the actual code in this repo.

---

## 1. Vision

An interactive course: learn networking from "what is a network?" to scalable
ISP design by **building topologies on a canvas and watching packets actually
flow** — ARP, MAC learning, routing, VLANs, NAT — with guided templates,
tasks, and a CCNA glossary.

## 2. Decisions (recommended defaults — change freely)

| Decision | Choice | Why |
|---|---|---|
| Sim depth v1 | **Packet-flow simulation** (ARP, MAC learning, ping/traceroute, routing, VLAN, DHCP/DNS/NAT) | This is the core learning value; Breakscale's event-heap engine is the right chassis for it |
| Language | **English** first (CCNA terms), i18n-ready content files so Bahasa Indonesia can slot in later | Matches exam terminology; dual-language from day one doubles content work |
| Scope | **All 8 module shells + templates scaffolded; Modules 1–3 fully polished first** | See the whole journey immediately, polish where learners start |

## 3. What we keep from Breakscale (reusable as-is)

- **Canvas** (`src/components/Canvas.tsx`): SVG + single-transform pan/zoom,
  central pointer state machine (drag/wire/marquee/pan), two-click AND drag
  wiring, animated-dash link flow (density = packet rate, speed = latency).
  Only the node visuals + readouts change.
- **App shell** (`src/App.tsx`): left palette / center canvas / right inspector /
  bottom metrics strip / top bar; panel resizing; edge-tethered panel toggles.
- **Inspector pattern** (`src/components/Inspector.tsx`): `FIELD_SPECS` +
  `FIELDS_BY_KIND` per-device parameter editors. Fields become IP, mask,
  VLAN, gateway, routing config.
- **Glossary + tooltip system** (`src/content/glossary.ts`, `Tooltip.tsx`):
  same single-source pattern, swap entries to CCNA terms
  (collision domain, broadcast domain, subnet mask, VLAN, trunk...).
- **Theming** (`src/index.css`, `src/theme/`): OKLCH tokens, light/dark,
  contrast-tested. Keep; re-tint per device group.
- **Challenge engine** (`src/sim/challenge.ts`, `challenges.ts`): preset +
  goals + staged hints + lesson-on-pass — becomes our task system
  ("make PC2 ping Server1", "segment into 2 VLANs").
- **Presets as code** (`src/sim/presets.ts`): becomes our template/lesson
  topologies with canvas annotations.
- **Share links / saved designs** (`src/share/`, `Designs.tsx`): keep.

## 4. What we replace

| Breakscale | Network Design Learner |
|---|---|
| `NodeKind` union (lb, cache, db, queue, …) | `pc, laptop, server, hub, switch, l3switch, router, firewall, ap, wlc, ispcloud, modem, dhcpserver, dnsserver` (+ later: `iot, printer, ipphone`) |
| Behaviour families (request queueing, RPS, p99) | **Packet behaviours**: host, L2-switch (MAC learning, flooding), router (routing table lookup, TTL), firewall (ACL), DHCP/DNS servers, ISP cloud |
| Traffic slider (offered RPS) | **Scenario player**: run ping / traceroute / "browse web" scenarios; animated packet path + hop-by-hop log explaining every step |
| Metrics (latency/throughput/failure charts) | Sim log + stats: packets sent/dropped, ARP table, MAC table, routing table viewers per selected device |
| 23 system presets | ~10–12 lesson templates (see §6) |
| — (no curriculum) | **NEW: course sidebar** — 8 modules with lesson pages + linked templates + tasks |

## 5. Packet simulation design (the new engine core)

Discrete-event, same `Ev`/heap pattern as upstream (`src/sim/engine.ts`):

- **Frames/packets** instead of `Req`: Ethernet frames carry payload packets
  (ICMP echo, ARP, DHCP DORA, DNS query, TCP SYN…).
- **L2 behaviour**: switch learns source MAC per port; unknown unicast floods;
  broadcast goes everywhere in the VLAN/broadcast domain.
- **ARP**: hosts broadcast ARP requests, cache replies; unresolved IP =
  animated ARP exchange on canvas.
- **L3 behaviour**: router longest-prefix-match over an editable routing
  table; TTL decrement; no route = ICMP unreachable (visible + logged);
  static routes + (later) OSPF.
- **VLANs**: per-port access/trunk VLAN tags; inter-VLAN via router subinterfaces.
- **NAT/PAT** on the edge router toward the ISP cloud node.
- **DHCP/DNS**: DORA exchange; DNS A-record lookup before "browse" scenarios.
- Every scenario produces a **hop log** ("PC1 → ARP broadcast → SW1 floods →
  R1 replies…") — this narration is the actual teaching layer.

## 6. Curriculum (8 modules, CCNA-aligned)

1. **What is a network?** — end devices, media, topologies. Template: 3 PCs + switch.
2. **LAN building blocks** — switch vs hub, MAC, frames, ARP. Task: fix a broken LAN.
3. **IP addressing & subnetting** — masks, CIDR, gateway; includes a subnet-calculator widget.
4. **Switching deeper** — VLANs, trunks, router-on-a-stick, STP intro.
5. **Routing** — static routes, then OSPF intro between routers.
6. **WAN & internet** — NAT/PAT, DHCP, DNS, default gateway, ISP uplink.
7. **Security & services** — ACLs, firewall + DMZ, wireless AP/WLC.
8. **Scalable ISP design** — hierarchical access/distribution/core, OSPF areas,
   BGP peering to upstreams, redundancy — the end-goal showcase template.

Template count: 1–2 per module, each a preset topology with annotations + tasks.

## 7. Build phases

- **Phase 0 — Baseline** (~½ day): fork-in-place rebrand, strip system-design
  kinds/presets, keep shell compiling and running. `npm install && npm run dev` green.
- **Phase 1 — Visual lessons** (~2–3 days): network device catalog + SVG icons,
  palette groups (End devices / LAN / WAN / Security / Services), module sidebar
  (static content), first templates render, CCNA glossary seed (~40 terms).
- **Phase 2 — Packet sim core** (~3–5 days): L2 sim (ARP, MAC learning, ping),
  scenario player + animated packet path + hop log.
- **Phase 3 — L3 + services** (~3–5 days): routing tables, traceroute, VLANs,
  DHCP, DNS, NAT; inspector fields for IP config.
- **Phase 4 — Tasks & full curriculum** (~2–3 days): challenge goals ported to
  network tasks, all module templates + content.
- **Phase 5 — Polish**: dark mode, saved designs, share links, mobile tabs,
  performance with large ISP topology.

## 8. Practical notes

- Stack: React 19 + Vite + TypeScript, plain CSS tokens. Repo uses bun
  (`bun.lock`) but npm works: `npm install`, `npm run dev`.
- Tests: vitest. Engine changes must keep `npm test` green; add sim tests per
  behaviour (upstream AGENTS.md discipline is worth keeping).
- License: keep upstream MIT notice + attribute Breakscale in README.
- Module layout: the canvas is split by concern under `src/components/canvas/`
  (`Canvas.tsx` render, `canvas-types.ts` vocabulary, `canvas-menus.ts` menu
  builders, `canvas-views.tsx` node and cable views, `useCanvasView.ts` framing
  and zoom, `useCanvasGestures.ts` the pointer machine); the engine's shared
  vocabulary is `src/sim/engine-types.ts` and its tests are `engine.test.ts`
  plus `engine-routing.test.ts` over `engine-harness.ts`. The app shell in
  `src/App.tsx` and the styles in `src/App.css` + `src/panels.css`. No source
  file is over 500 lines, and new code should stay under that too.
- Adding a device kind (recipe, from upstream AGENTS.md, still applies):
  types.ts → presets baseConfig → behaviour file → nodeVisuals → Inspector
  fields → Canvas readout → clipboard/wire allowlists → glossary entry → test.
