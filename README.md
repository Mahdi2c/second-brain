To start:

From inference-engine run:
.\llama-server.exe -m E:\SecondBrain\ai-model\Ternary-Bonsai-27B-Q2_0.gguf -ngl 99 -c 8192 --parallel 1 --port 8080

From second-brain:
npm run tauri dev
