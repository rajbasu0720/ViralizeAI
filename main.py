from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
import os
from pathlib import Path

load_dotenv(override=True)

BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="ViralizeAI API")

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise RuntimeError("GEMINI_API_KEY not found in .env file")

# Strip any accidental quotes or whitespace
api_key = api_key.strip().strip("'").strip('"')

client = genai.Client(api_key=api_key)

# Model priority list — tries each in order on quota errors
MODELS = [
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-flash-latest",
]

PROMPTS = {
    "twitter": """You are a viral Twitter/X content strategist. Convert the following essay or report into an engaging Twitter/X thread.

Rules:
- Create 6 to 10 tweets
- Each tweet MUST be under 280 characters (strictly enforced)
- Number each tweet starting with "1/" then "2/" etc.
- First tweet must be a bold, curiosity-driving hook — the most important line
- Use emojis naturally and sparingly (not more than 2 per tweet)
- Make each tweet feel standalone yet part of a story
- Final tweet must be a call to action (follow / share / comment)
- Do NOT use hashtags in every tweet — max 2 across the whole thread

Essay/Content:
{content}

Return ONLY the numbered tweets, one per line. No extra commentary.""",

    "linkedin": """You are an expert LinkedIn content creator known for high-engagement professional posts. Convert the following essay or report into a compelling LinkedIn post.

Rules:
- Start with a SHORT, powerful hook as the very first line (this is critical — it must make someone stop scrolling)
- Add a blank line after the hook before continuing
- Write 3 to 5 concise paragraphs with line breaks between them
- Professional yet warm and approachable tone — NOT corporate jargon
- Include 1 or 2 bold insights or takeaways using "→" bullets
- End with a thought-provoking question or a CTA to spark comments
- Add 4 to 6 relevant hashtags on the final line
- Total length: 200 to 350 words

Essay/Content:
{content}

Return ONLY the LinkedIn post text. No extra commentary.""",

    "reel": """You are a short-form video scriptwriter for Instagram Reels and YouTube Shorts. Convert the following essay or report into a punchy 30-second spoken script.

Rules:
- Total word count: 120 to 150 words (exactly 30 seconds of speech at normal pace)
- Add [VISUAL CUE: description] notes in brackets at the start of each section for what should appear on screen
- Open with a HOOK in the FIRST 3 seconds that grabs attention immediately (a bold statement, shocking fact, or question)
- Fast-paced, conversational, energetic — write exactly what the creator says out loud
- Avoid long sentences — short punchy lines only
- Close with a strong CTA: "Follow for more", "Share this", "Comment below", etc.
- Format: alternate between [VISUAL CUE] lines and spoken script lines

Essay/Content:
{content}

Return ONLY the script with visual cues. No extra commentary."""
}

FORMAT_LABELS = {
    "twitter": "Twitter/X Thread",
    "linkedin": "LinkedIn Post",
    "reel": "Reel / Shorts Script"
}


class GenerateRequest(BaseModel):
    content: str
    format: str


# ── HTML page routes ────────────────────────────────────────────
@app.get("/")
async def serve_index():
    return FileResponse(BASE_DIR / "static" / "index.html")

@app.get("/about")
async def serve_about():
    return FileResponse(BASE_DIR / "static" / "about.html")

@app.get("/app")
async def serve_app():
    return FileResponse(BASE_DIR / "static" / "app.html")


# ── API route ───────────────────────────────────────────────────
@app.post("/generate")
async def generate(request: GenerateRequest):
    if request.format not in PROMPTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid format '{request.format}'. Choose: twitter, linkedin, reel"
        )
    if not request.content.strip():
        raise HTTPException(status_code=400, detail="Content cannot be empty")
    if len(request.content.strip()) < 50:
        raise HTTPException(status_code=400, detail="Content is too short. Please paste a longer essay or report.")

    prompt = PROMPTS[request.format].format(content=request.content.strip())

    last_error = None
    for model in MODELS:
        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
            )
            return {
                "output": response.text,
                "format": request.format,
                "label": FORMAT_LABELS[request.format],
                "model_used": model,
            }
        except Exception as e:
            err_str = str(e)
            # If quota exhausted, try next model
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                last_error = e
                continue
            # Any other error — fail immediately
            raise HTTPException(status_code=500, detail=f"AI generation failed: {err_str}")

    # All models exhausted — extract retry delay if available
    err_str = str(last_error)
    retry_seconds = None
    import re
    m = re.search(r"retry.*?(\d+)s", err_str, re.IGNORECASE)
    if m:
        retry_seconds = int(m.group(1))

    detail = (
        f"All models are rate-limited right now. "
        f"Please wait {retry_seconds} seconds and try again."
        if retry_seconds
        else "All models are rate-limited. Please wait a minute and try again."
    )
    raise HTTPException(status_code=429, detail=detail)


# ── Static assets (CSS, JS) ─────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
