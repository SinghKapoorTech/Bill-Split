export type Format = "9x16" | "4x5";

type Side = { label: string; item: string; emoji: string };

export type SlideSpec =
  | { kind: "hook"; text: string; kicker?: string; emoji?: string }
  | { kind: "statement"; text: string; sub?: string; stamp?: string }
  | { kind: "receipt"; title: string }
  | { kind: "split"; title: string; sub?: string }
  | { kind: "rule"; n: number; text: string; sub?: string }
  | { kind: "archetype"; n: number; text: string; sub?: string; emoji: string }
  | { kind: "versus"; left: Side; right: Side }
  | { kind: "cta"; line: string };

export type Post = {
  slug: string;
  type: string;
  theme: string;
  exampleBill: boolean;
  caption: string;
  slides: SlideSpec[];
};
