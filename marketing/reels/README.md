# Divit reels (Motion Craft)

Storyboards for short 9:16 video ads, rendered with Motion Craft
(`../../../motioncraft`, see its `docs/agent-guide.md`). All four use the plan's
example bill and are labelled "Example bill".

| Storyboard | Angle |
| --- | --- |
| `01-salad-tax.json` | You paid $57.35 for a $14 salad; you owed $18.04 |
| `02-wagyu.json` | Split evenly, the wagyu friend pays $57.35 but owes $108.26 |
| `03-guess-the-split.json` | Quiz: guess the salad's fair share |
| `04-even-vs-fair.json` | Even split wipes to the fair split; "$39.31 you overpaid" |

`media/` holds the Outfit font (OFL-1.1), the Divit icon and one end-card
hold image per reel. Motion Craft fades the last scene to blank on its final
frame, so each reel ends on a 0.5 s `Image` of its settled end card. If an end
card changes, regenerate its hold image with `stills.ts --slides end`.

Render from the motioncraft repo (narration is Motion Craft's local Kokoro voice):

```
npx tsx scripts/narrate.ts <storyboard>
npx tsx scripts/check.ts   <storyboard>
npx tsx scripts/render.ts  <storyboard> --out <file>.mp4
```

Finished videos are copied to `../assets/reels/`.
