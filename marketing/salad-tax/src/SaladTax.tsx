import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Outfit";
import { T } from "./timeline";

const { fontFamily } = loadFont("normal", { weights: ["400", "600", "800"] });

// Brand tokens from src/index.css (light theme).
const C = {
  bg: "hsl(40 30% 97%)",
  ink: "hsl(30 30% 12%)",
  muted: "hsl(30 12% 45%)",
  gold: "hsl(42 65% 40%)",
  goldGlow: "hsl(42 65% 55%)",
  paper: "#fffdf8",
  red: "#d6453d",
  green: "#2f8f5b",
};

// "Salad bill" from the ad plan: subtotal $178, tax 8.875%, tip 20%, total $229.40.
const ITEMS: { name: string; price: number; flag?: "bad" | "good" }[] = [
  { name: "Wagyu steak", price: 68, flag: "bad" },
  { name: "Cocktail", price: 16, flag: "bad" },
  { name: "Cocktail", price: 16, flag: "bad" },
  { name: "Cocktail", price: 16, flag: "bad" },
  { name: "Pasta", price: 26 },
  { name: "Burger", price: 22 },
  { name: "Garden salad", price: 14, flag: "good" },
];

const SPLIT = [
  { who: "Salad", amt: 18.04, hi: true },
  { who: "Burger + cocktail", amt: 48.97 },
  { who: "Pasta + cocktail", amt: 54.13 },
  { who: "Wagyu + cocktail", amt: 108.26 },
];

const S = {
  receipt: T.hook,
  reveal: T.hook + T.receipt,
  split: T.hook + T.receipt + T.reveal,
  end: T.hook + T.receipt + T.reveal + T.split,
};

// Narration is second person (product facts), so an AI voice is allowed under the ad plan.
// [clip, absolute start frame]
// One flowing sentence per scene; visual cues are keyed to measured word timings.
const VO: [string, number][] = [
  ["hook", 0],
  ["receipt", S.receipt],
  ["reveal", S.reveal],
  ["split", S.split],
  ["end", S.end],
];

const money = (n: number) => `$${n.toFixed(2)}`;
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const usePop = (delay = 0, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping } });
};

const fadeOut = (frame: number, end: number, len = 8) =>
  interpolate(frame, [end - len, end], [1, 0], clamp);

// Everything sits inside the TikTok/Reels safe zone: 250px top, 400px bottom, 120px right.
const Safe: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      position: "absolute",
      top: 250,
      bottom: 400,
      left: 80,
      right: 120,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      ...style,
    }}
  >
    {children}
  </div>
);

const Line: React.FC<{ delay: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay,
  children,
  style,
}) => {
  const p = usePop(delay);
  return (
    <div
      style={{
        opacity: Math.min(1, p),
        transform: `translateY(${(1 - p) * 60}px) scale(${0.9 + p * 0.1})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// The hook, full line on screen by ~3s.
const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = frame > 133 && frame < 145 ? Math.sin(frame * 3) * 10 : 0;
  return (
    <Safe style={{ opacity: fadeOut(frame, T.hook) }}>
      <Line delay={2} style={{ fontSize: 96, fontWeight: 800, lineHeight: 1.05 }}>
        You ordered a <span style={{ color: C.green, whiteSpace: "nowrap" }}>$14 salad.</span>
      </Line>
      <Line delay={52} style={{ fontSize: 80, fontWeight: 600, marginTop: 40, color: C.muted }}>
        You "split evenly."
      </Line>
      <Line delay={116} style={{ marginTop: 50 }}>
        <div style={{ fontSize: 116, fontWeight: 800, color: C.red, whiteSpace: "nowrap", transform: `translateX(${shake}px)` }}>
          You paid $57.35.
        </div>
      </Line>
    </Safe>
  );
};

// The receipt prints; lines get circled as the voice names them.
const Receipt: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = usePop(0, 18);
  return (
    <Safe style={{ alignItems: "center", opacity: fadeOut(frame, T.receipt) }}>
      <div
        style={{
          width: 760,
          background: C.paper,
          borderRadius: 18,
          padding: "44px 56px",
          boxShadow: "0 30px 80px rgba(60,40,10,0.18)",
          transform: `translateY(${(1 - enter) * 900}px) rotate(${(1 - enter) * -6 - 1.5}deg)`,
          fontFamily: "Courier New, monospace",
          color: C.ink,
        }}
      >
        <div style={{ textAlign: "center", fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>
          THE CORNER TABLE
        </div>
        <div style={{ textAlign: "center", fontSize: 26, color: C.muted, marginBottom: 22 }}>
          table 12 · 4 guests
        </div>
        {ITEMS.map((it, i) => {
          const show = interpolate(frame, [4 + i * 3, 9 + i * 3], [0, 1], clamp);
          // Wagyu circles on "Wagyu", cocktails on "three cocktails", salad on "your salad".
          const markAt = it.flag === "good" ? 89 : i === 0 ? 21 : 36 + i * 2;
          const mark = interpolate(frame, [markAt, markAt + 8], [0, 1], {
            ...clamp,
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div
              key={i}
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "space-between",
                fontSize: 38,
                padding: "7px 14px",
                opacity: show,
              }}
            >
              {it.flag && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: 40,
                    border: `5px solid ${it.flag === "bad" ? C.red : C.green}`,
                    background: it.flag === "good" ? "rgba(47,143,91,0.10)" : "transparent",
                    clipPath: `inset(0 ${100 - mark * 100}% 0 0)`,
                  }}
                />
              )}
              <span>{it.name}</span>
              <span>{money(it.price)}</span>
            </div>
          );
        })}
        <div style={{ borderTop: "3px dashed #c9bfa8", margin: "20px 0 12px" }} />
        {[
          ["Subtotal", "$178.00"],
          ["Tax", "$15.80"],
          ["Tip 20%", "$35.60"],
        ].map(([k, v], i) => (
          <div
            key={k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 32,
              color: C.muted,
              padding: "2px 14px",
              opacity: interpolate(frame, [20 + i * 2, 25 + i * 2], [0, 1], clamp),
            }}
          >
            <span>{k}</span>
            <span>{v}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 46,
            fontWeight: 700,
            padding: "10px 14px 0",
            opacity: interpolate(frame, [26, 31], [0, 1], clamp),
          }}
        >
          <span>TOTAL</span>
          <span>$229.40</span>
        </div>
      </div>
      <div style={{ fontSize: 56, fontWeight: 800, marginTop: 44, textAlign: "center" }}>
        <Line delay={21}>Wagyu. Three cocktails.</Line>
        <Line delay={86} style={{ color: C.green }}>Your salad.</Line>
      </div>
    </Safe>
  );
};

// $57.35 struck through, rolls down to $18.04 as the voice says it.
const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const strike = interpolate(frame, [4, 14], [0, 100], { ...clamp, easing: Easing.out(Easing.cubic) });
  const roll = interpolate(frame, [26, 48], [57.35, 18.04], { ...clamp, easing: Easing.out(Easing.cubic) });
  const thump = interpolate(frame, [48, 54, 66], [1, 1.12, 1], clamp);
  return (
    <Safe style={{ alignItems: "center", textAlign: "center", opacity: fadeOut(frame, T.reveal) }}>
      <Line delay={0} style={{ fontSize: 54, fontWeight: 600, color: C.muted }}>
        Even split
      </Line>
      <Line delay={0}>
        <div style={{ position: "relative", fontSize: 150, fontWeight: 800, color: C.muted }}>
          $57.35
          <div
            style={{
              position: "absolute",
              left: -10,
              top: "50%",
              height: 14,
              width: `calc(${strike}% + 20px)`,
              background: C.red,
              borderRadius: 8,
              transform: "rotate(-4deg)",
            }}
          />
        </div>
      </Line>
      <Line delay={8} style={{ fontSize: 54, fontWeight: 600, marginTop: 70 }}>
        What you actually owed
      </Line>
      <Line delay={10}>
        <div
          style={{
            fontSize: 230,
            fontWeight: 800,
            color: C.green,
            transform: `scale(${thump})`,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {money(roll)}
        </div>
      </Line>
    </Safe>
  );
};

// The fair split, tax and tip proportional.
const Split: React.FC = () => {
  const frame = useCurrentFrame();
  const max = 108.26;
  return (
    <Safe style={{ opacity: fadeOut(frame, T.split) }}>
      <Line delay={2} style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>
        Divit splits tax &amp; tip by <span style={{ color: C.gold }}>what you ordered.</span>
      </Line>
      <Line delay={60} style={{ fontSize: 44, color: C.muted, marginTop: 18, marginBottom: 46 }}>
        Not by headcount.
      </Line>
      {SPLIT.map((s, i) => {
        const grow = interpolate(frame, [20 + i * 6, 40 + i * 6], [0, 1], {
          ...clamp,
          easing: Easing.out(Easing.cubic),
        });
        return (
          <div key={s.who} style={{ marginBottom: 30, opacity: Math.min(1, grow * 3) }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 42,
                fontWeight: 600,
                marginBottom: 10,
                color: s.hi ? C.green : C.ink,
              }}
            >
              <span>{s.who}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{money(s.amt * grow)}</span>
            </div>
            <div style={{ height: 30, borderRadius: 15, background: "hsl(40 25% 89%)" }}>
              <div
                style={{
                  height: "100%",
                  width: `${(s.amt / max) * 100 * grow}%`,
                  borderRadius: 15,
                  background: s.hi ? C.green : `linear-gradient(90deg, ${C.gold}, ${C.goldGlow})`,
                }}
              />
            </div>
          </div>
        );
      })}
    </Safe>
  );
};

// End card, the one hard CTA.
const EndCard: React.FC = () => {
  const icon = usePop(0, 10);
  return (
    <Safe style={{ alignItems: "center", textAlign: "center" }}>
      <Img
        src={staticFile("divit-icon.png")}
        style={{
          width: 220,
          height: 220,
          borderRadius: 52,
          boxShadow: "0 24px 60px rgba(120,90,20,0.30)",
          transform: `scale(${icon}) rotate(${(1 - icon) * -20}deg)`,
        }}
      />
      <Line delay={6} style={{ fontSize: 110, fontWeight: 800, marginTop: 30, color: C.gold }}>
        Divit
      </Line>
      <Line delay={4} style={{ fontSize: 66, fontWeight: 800, marginTop: 16, lineHeight: 1.1 }}>
        Stop paying the salad tax.
      </Line>
      <Line delay={30} style={{ fontSize: 44, fontWeight: 600, marginTop: 36, color: C.muted }}>
        Snap. Tap. Paid back.
      </Line>
      <Line delay={50} style={{ marginTop: 46 }}>
        <div
          style={{
            background: C.ink,
            color: C.bg,
            fontSize: 46,
            fontWeight: 600,
            padding: "26px 56px",
            borderRadius: 999,
          }}
        >
          Download free · iOS &amp; Android
        </div>
      </Line>
      <Line delay={62} style={{ fontSize: 38, marginTop: 26, color: C.muted }}>
        Link in bio
      </Line>
    </Safe>
  );
};

export const SaladTax: React.FC = () => {
  const frame = useCurrentFrame();
  // Slow drifting warm glow so the background never sits still.
  const gx = 50 + Math.sin(frame / 40) * 20;
  const gy = 40 + Math.cos(frame / 55) * 15;
  return (
    <AbsoluteFill
      style={{
        fontFamily,
        color: C.ink,
        background: `radial-gradient(circle at ${gx}% ${gy}%, hsl(42 70% 88%) 0%, ${C.bg} 55%)`,
      }}
    >
      <Sequence durationInFrames={T.hook}>
        <Hook />
      </Sequence>
      <Sequence from={S.receipt} durationInFrames={T.receipt}>
        <Receipt />
      </Sequence>
      <Sequence from={S.reveal} durationInFrames={T.reveal}>
        <Reveal />
      </Sequence>
      <Sequence from={S.split} durationInFrames={T.split}>
        <Split />
      </Sequence>
      <Sequence from={S.end}>
        <EndCard />
      </Sequence>
      {VO.map(([clip, at]) => (
        <Sequence key={clip} from={at}>
          <Audio src={staticFile(`vo/${clip}.mp3`)} />
        </Sequence>
      ))}
      {/* Plan rule: every number not from a real bill is captioned "example bill". */}
      <div
        style={{
          position: "absolute",
          top: 270,
          left: 80,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: 2,
          color: C.muted,
          opacity: frame < S.end ? 0.8 : 0,
        }}
      >
        EXAMPLE BILL
      </div>
    </AbsoluteFill>
  );
};
