from fastapi import FastAPI
from kamiyo_ai_pfn import KamiyoAI

app = FastAPI()

@app.get("/")
def run_ai():
    ai = KamiyoAI(use_pfn_hardware=True)
    ai.run()
    return {"message": "Swarm is running..."}
