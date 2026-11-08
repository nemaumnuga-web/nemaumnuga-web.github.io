// WebLLM 추론을 별도 스레드(Web Worker)에서 돌려 채팅 화면이 멈추지 않게 합니다.
import { WebWorkerMLCEngineHandler } from "./vendor/web-llm.js";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
