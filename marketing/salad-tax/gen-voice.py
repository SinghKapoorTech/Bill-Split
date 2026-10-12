import asyncio, json, sys
import edge_tts

VOICE = "en-US-AndrewMultilingualNeural"
LINES = {
    "hook": ("+25%", "You ordered a fourteen dollar salad, you split the bill evenly, and somehow you paid fifty-seven thirty-five."),
    "receipt": ("+22%", "But your friends got the wagyu and three cocktails, and you just had the salad."),
    "reveal": ("+18%", "So what did you actually owe? Just eighteen oh four."),
    "split": ("+22%", "That's because Divit splits the tax and tip by what each person ordered."),
    "end": ("+15%", "So stop paying the salad tax, and download Divit."),
}

async def main(out):
    timings = {}
    for key, (rate, text) in LINES.items():
        c = edge_tts.Communicate(text, VOICE, rate=rate, boundary="WordBoundary")
        words = []
        with open(f"{out}/{key}.mp3", "wb") as f:
            async for chunk in c.stream():
                if chunk["type"] == "audio":
                    f.write(chunk["data"])
                elif chunk["type"] == "WordBoundary":
                    words.append([chunk["text"], round(chunk["offset"] / 1e7, 3), round((chunk["offset"] + chunk["duration"]) / 1e7, 3)])
        timings[key] = words
    print(json.dumps(timings, indent=0))

asyncio.run(main(sys.argv[1]))
