import type { Medium, SimNode, Wiring } from '../../sim/types';

/*
 * The vocabulary the canvas works in: what it asks the shell to do, and what a
 * press landed on. Kept apart from the component because the menus, the gesture
 * machine and the component itself all speak it, and the shell needs the action
 * union without importing a React component to get it.
 */

/** What a canvas menu asks the shell to do. */
export type CanvasAction =
  | { readonly kind: 'add'; readonly device: SimNode['kind']; readonly x: number; readonly y: number }
  | { readonly kind: 'delete' }
  | { readonly kind: 'pingFrom'; readonly id: string }
  | { readonly kind: 'pingTo'; readonly id: string }
  | { readonly kind: 'medium'; readonly id: string; readonly medium: Medium }
  | { readonly kind: 'wiring'; readonly id: string; readonly wiring: Wiring }
  | { readonly kind: 'forget' }
  | { readonly kind: 'panels' };

/** What a press landed on, resolved once and then used for everything. */
export type Hit = { readonly kind: 'node' | 'link'; readonly id: string } | { readonly kind: 'world' };

export type Point = { readonly x: number; readonly y: number };

/** Where the view is: the pan offset and the zoom. */
export interface View {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}
