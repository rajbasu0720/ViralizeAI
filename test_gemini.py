from google import genai
import os
from dotenv import load_dotenv

load_dotenv(override=True)
api_key = os.getenv("GEMINI_API_KEY").strip().strip("'").strip('"')
os.environ["GEMINI_API_KEY"] = api_key

try:
    print(f"Key length: {len(api_key)}")
    # Using default client loading logic instead of passing it explicitly
    client = genai.Client()
    response = client.models.generate_content(
        model="gemini-2.0-flash-lite",
        contents="Say hello"
    )
    print("Response:", response.text)
except Exception as e:
    print("Error:", repr(e))
