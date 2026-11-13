# 공개 메타데이터로 로컬 LLM 카탈로그를 세우고 등급별로 거른다

로컬 LLM 카탈로그는 Hugging Face Hub의 `library=gguf` 목록을 출발점으로 삼고, 발행 주체와 각 저장소의 라이선스 원문을 함께 기록하는 방식으로 만든다. 이번 조사에서 **LICENSE 원문을 직접 읽은 모델은 Kanana-2 1.3B, HyperCLOVA X SEED 14B Think, EXAONE 4.0 32B 세 개뿐**이다. 이 중 카카오와 네이버 모델은 조건부 상업 이용이 가능하고, LG EXAONE 4.0 32B는 상업 목적 사용이 명시적으로 금지된다. Qwen3.5, Gemma 4, Ministral 3, gpt-oss-20b, SmolLM3는 카드 태그상 Apache 2.0이지만 원문 확인이 없어 상업 이용 결론을 내리지 않았다. 한국어 벤치마크는 전부 벤더 보고 수치라 독립 비교가 불가능하며, 한국어 상업 후보의 축은 Kanana-2 1.3B/3B(8GB급)와 HyperCLOVA X SEED 14B(16GB급) 두 갈래로 좁혀진다. 일본어·중국어·유럽어 근거와 64GB 등급 근거는 조사 범위에서 빠져 있어, 이 부분은 추천이 아니라 선택 절차와 후보 목록으로 제시한다. 등급별 메모리 수치는 실측이 없는 추정치이므로 배포 전 llama.cpp에서 측정해야 한다.

## 카탈로그는 Hub 목록을 라이선스 원문과 맞춰 짓는다

전 세계 GGUF 모델의 목록은 Hub의 GGUF 태그 필터와 GGUF 뷰어로 얻는다. Hub 문서는 GGUF 메타데이터 뷰어, 공식 파서 `@huggingface/gguf`, 양자화 타입 표를 제공한다 ([HF GGUF docs](https://huggingface.co/docs/hub/gguf)). 모델 카드 YAML에는 `license`, `license_name`, `license_link`, `base_model`(관계 유형 `quantized` 포함), `library_name` 필드가 있어 라이선스와 원본 모델 연결을 기계적으로 읽을 수 있다 ([HF model cards](https://huggingface.co/docs/hub/model-cards)). 다만 목록 API의 쿼리 파라미터와 응답 필드는 이번 조사에서 확인하지 못했다. Hub는 OpenAPI 명세를 기준 문서로 안내하므로 수집기는 그 명세와 `huggingface_hub` 라이브러리에 맞춰 짜야 한다 ([HF Hub API](https://huggingface.co/docs/hub/api)). 속도 제한은 5분 창으로 계산되며, 2025년 9월 스냅샷 기준 무료 계정은 Hub API 1,000회, 리졸버 5,000회다 ([HF rate limits](https://huggingface.co/docs/hub/rate-limits)). 익명 접근은 훨씬 낮은 한도를 받으므로 수집에는 `HF_TOKEN`을 쓰고, 파일 내려받기는 리졸버 경로를 쓰는 편이 낫다.

양자화 저장소는 자기 라이선스를 갖지 않고 기반 모델의 조건을 그대로 따른다. 따라서 레코드마다 기반 모델의 라이선스 원문 이름과 게시자 유형(공식 조직인지, 양자화 업체인지)을 함께 기록해야 한다. 이번 조사에서 공식 GGUF가 확인된 저장소는 세 곳이다. Gemma 4 QAT 빌드 `google/gemma-4-12B-it-qat-q4_0-gguf`는 Q4_0 파일 하나(6.98GB)와 256K 컨텍스트를 카드에 명시한다 ([Source](https://huggingface.co/google/gemma-4-12B-it-qat-q4_0-gguf)). `LGAI-EXAONE/EXAONE-4.0-32B-GGUF`는 EXAONE 32B의 공식 GGUF다 ([Source](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B-GGUF)). `mistralai/Ministral-3-14B-Instruct-2512-GGUF`는 Ministral 14B의 공식 GGUF다 ([Source](https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512-GGUF)). Qwen3.5는 공식 GGUF 저장소가 확인되지 않았고, unsloth, bartowski, lmstudio-community의 양자화본만 확인됐다 ([unsloth collection](https://huggingface.co/collections/unsloth/qwen35)). Qwen 측 공지는 공식 GGUF 저장소가 있다고 가리키지만 저장소 이름은 검증하지 못했다.

GGUF가 있다는 사실과 실행된다는 사실은 별개다. Unsloth는 Qwen3.5가 Gated DeltaNet과 게이트 어텐션을 섞은 하이브리드 구조라서 llama.cpp 빌드가 이를 지원해야 한다고 적는다. EXAONE 4.0은 2차 자료 기준 llama.cpp b5932 이상이 필요하다. 변환물의 신뢰도는 게시자 이름이 아니라 파일 단위로 판정하는 것이 맞다. 제안된 검증 순서는 GGUF의 `base_model` 필드가 공식 원본을 가리키는지, 원본 저장소 소유자가 공식 조직인지, 원본 safetensors와 GGUF의 해시와 텐서 구조가 일치하는지, imatrix 보정 데이터가 있다면 그 출처가 무엇인지 기록하는 것이다. 이 중 해시와 구조 비교는 방법론에 대한 추론이며, 양자화 업체 간 품질 차이를 입증한 자료는 찾지 못했다. 따라서 업체별 순위는 매기지 않는다.

## 라이선스 지도: 원문을 읽은 모델은 세 개뿐이다

아래 표에서 상업 이용 칸은 LICENSE 원문을 직접 확인한 항목에만 결론을 적었다. 카드 태그나 블로그 주장만 확인한 항목은 "보류"로 두었다.

| 모델 | 라이선스 근거 수준 | 상업 이용 | 공식 GGUF |
|---|---|---|---|
| Kanana-2 1.3B Instruct | 원문 확인 (Kanana Open License) | 자체 서비스 가능. API 재판매, SI·온프레미스, 온디바이스 내장은 카카오 별도 라이선스 필요 | 미발견 |
| Kanana-2 3B | 원문 미확인 | 보류 | 미확인 |
| Kanana-2 30B-A3B | 원문 미확인. 카드는 "Kanana License"로 표기해 명칭이 다름 | 보류 | 미발견 |
| HyperCLOVA X SEED 14B Think | 원문 확인 | 조건부 가능 (월간 사용자 1,000만 초과 또는 네이버 경쟁 제품이면 사전 요청) | 네이버 공식 없음, 제3자 양자화만 확인 |
| HyperCLOVA X SEED 0.5B / 1.5B / 32B | 원문 미확인 (14B 조항이 전체에 적용된다고 가정, 미검증) | 보류 | 네이버 공식 없음 |
| EXAONE 4.0 32B | 원문 확인 (EXAONE 1.2 NC) | 금지. 연구·교육 목적만 허용, 상업은 LG 별도 계약 | 공식 확인 |
| EXAONE 4.0 1.2B | 원문 미확인. 2차 자료는 NC 공유 | 비상업으로 보고됨 (2차) | 공식 GGUF 보고 (2차) |
| Qwen3.5 9B | 카드 태그 apache-2.0 | 보류 | 공식 미확인, 양자화본 다수 |
| Qwen3.5 0.8B / 2B / 4B | 미확인 (Apache 2.0 가정은 미검증) | 보류 | 공식 미확인 |
| Gemma 4 (E2B부터 31B까지) | 카드 태그 apache-2.0, Google 블로그 (LICENSE 원문 미확인) | 보류 | QAT Q4_0 공식 (12B 확인, 타 크기 2차 보고) |
| Ministral 3 14B | 카드 Apache 2.0 + IP 침해 금지 조항 추가 | 보류 | 공식 확인 |
| Ministral 3 8B | 2차 자료 Apache 2.0 | 보류 | 2차 보고 |
| Ministral 3 3B | 미확인 | 보류 | 미확인 |
| gpt-oss-20b | 카드 태그 apache-2.0 | 보류 | 미확인 (커뮤니티 양자화 265개) |
| SmolLM3-3B | 카드 태그 apache-2.0 | 보류 | 형식 불명확 |
| Tiny Aya (3.35B) | 2차 자료 CC-BY-NC-4.0 | 비상업으로 보고됨 (2차) | 2차 보고 |
| IBM Granite 4.x, Phi-4-mini | 미조사 | 미조사 | 미조사 |

카카오의 Kanana Open License는 복제, 배포, 수정, 2차 저작을 로열티 없이 허용한다 (Sec. 2.1). 자체 서비스 운영에는 별도 상업 라이선스가 필요 없지만, API나 클라우드로 판매하거나, SI·온프레미스로 배포하거나, 온디바이스 제품에 내장하면 카카오와 별도 계약을 맺어야 한다. 조건은 "Powered by Kanana" 표시, 고지 파일 포함, 파생 모델 이름의 "Kanana" 접두어다 ([Kanana 1.3B LICENSE](https://huggingface.co/kakaocorp/kanana-2-1.3b-instruct/blob/main/LICENSE)). 2차 요약은 1,000만 MAU 기준을 언급하지만 1.3B 원문에는 그런 기준이 없어서 다른 버전의 조건일 가능성이 있다. 30B-A3B 카드의 명칭 차이 때문에 30B-A3B 라이선스는 원문을 읽기 전까지 결론을 낼 수 없다.

네이버의 HyperCLOVA X SEED 14B Think 라이선스는 비독점, 철회 가능, 로열티 무료 조건이다. 월간 활성 사용자가 1,000만 명을 넘거나 네이버 제품과 실질적으로 경쟁하는 제품을 내면 네이버에 별도 요청해야 하고, 승인은 네이버 재량이다 (Sec. 4). 제품에는 "Powered by HyperCLOVA X"를 눈에 띄게 표시하고, 배포 모델 이름은 "HyperCLOVA X"로 시작해야 한다 (Sec. 3.1) ([LICENSE](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B/blob/main/LICENSE)). 약 1.5년 전 작성된 네이버 모델 FAQ(2차)는 SEED 모델이 상업 이용 무료라고 적었지만, 이는 원문과 충돌하므로 채택하지 않았다.

LG의 EXAONE 4.0 32B 라이선스는 연구와 교육 목적으로만 허용하고, 상업 목적 사용과 출력물 사용을 명시적으로 금지한다 (Sec. 2.1(a), 3.1). 출력물로 LG 모델과 경쟁하는 모델을 개발하는 것도 금지된다 ([LICENSE](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-32B/blob/main/LICENSE)). ResearchGate 목록의 "CC BY-NC-ND 4.0" 표기는 원문과 달라 채택하지 않았다. 2026년 블로그가 주장한 K-EXAONE 2.0의 Apache 2.0 전환은 2차 미확인 주장이므로 쓰지 않는다.

서구권 모델의 라이선스 상황은 더 불투명하다. Ministral 3 시리즈는 Mistral 발표문이 Apache 2.0을 밝히고 ([Source](https://mistral.ai/news/mistral-3/)), 14B 카드는 여기에 IP 침해 금지 조항을 덧붙인다. Gemma 4는 Google 블로그가 OSI 승인 Apache 2.0을 밝혔으나 이전 세대 Gemma는 여전히 Gemma Terms를 따른다 ([Source](https://opensource.googleblog.com/2026/03/gemma-4-expanding-the-gemmaverse-with-apache-20.html)). Gemma Terms는 사용 제한을 하위 계약에 옮기고 사본을 제3자 수령자에게 전달하도록 요구한다 ([Gemma Terms](https://ai.google.dev/gemma/terms)). Qwen3.5-9B, gpt-oss-20b, SmolLM3-3B는 카드 태그만 확인했다. 어느 쪽이든 LICENSE 원문을 읽기 전까지 상업 이용 결론은 보류한다. 양자화본은 원본 조건을 그대로 물려받으므로, 공식이든 양자화 업체든 같은 조건이 적용된다.

## 한국어 벤치마크는 전부 벤더 수치라 순위를 매기지 못한다

2026년 한국어 모델 카드가 가장 많이 쓰는 벤치마크는 KMMLU 계열이다. KMMLU는 한국 시험에서 가져온 35,030문항, 45개 과목의 객관식 평가다 ([KMMLU paper](https://arxiv.org/html/2402.11548v2)). KMMLU-Redux와 KMMLU-Pro는 LG AI Research가 후속으로 만든 변형이다. Open Ko-LLM 리더보드는 2024년 ACL 논문으로 알려져 있지만 2026년에도 갱신되는지는 확인하지 못했고, 최신 모델 카드에서는 거의 쓰이지 않는다. 독립적인 한국어 소형 모델 비교나 사람 선호 아레나도 찾지 못했다.

| 모델 (크기, 설정) | 벤치마크 | 점수 | 출처 성격 |
|---|---|---|---|
| EXAONE 4.0 32B 추론 | KMMLU-Redux | 72.7 | 벤더 (LG 카드) |
| EXAONE 4.0 32B 비추론 | KMMLU-Redux | 64.8 | 벤더 |
| EXAONE 4.0 1.2B 추론 | KMMLU-Redux | 46.9 | 벤더 ([card](https://huggingface.co/LGAI-EXAONE/EXAONE-4.0-1.2B)) |
| EXAONE 4.0 1.2B 비추론 | KMMLU-Redux | 40.4 | 벤더 |
| Kanana-2 3B 기본 | KMMLU 5-shot | 47.92 | 벤더 ([card](https://huggingface.co/kakaocorp/kanana-2-3b-base)) |
| Kanana-2 1.3B 기본 | KMMLU 5-shot | 44.17 | 벤더 |
| Kanana-2 1.3B 지시형 | KMMLU-CoT | 42.79 | 벤더 |
| Kanana-2 3B 지시형 | KMMLU-CoT | 43.32 | 벤더 |
| Kanana-2 3B 지시형 | KoMT-Bench (gpt-4o 심판) | 6.92 | 벤더 |
| Qwen3.5-2B (카카오 재현) | KoMT-Bench | 5.21 | 벤더가 재현 |
| HyperCLOVA X SEED 14B Think | KMMLU (think) | 0.6649 | 벤더 ([card](https://huggingface.co/naver-hyperclovax/HyperCLOVAX-SEED-Think-14B)) |
| HyperCLOVA X SEED 14B Think | HAERAE (think) | 0.8537 | 벤더 |
| Qwen3-14B (같은 카드의 비교 행) | KMMLU | 0.5864 (비추론), 0.4930 (추론) | 벤더, 카드 내부 불일치 |

이 표가 말해 주는 가장 중요한 사실은 벤더 수치끼리도 직접 비교할 수 없다는 점이다. EXAONE의 KMMLU-Redux 40.4(비추론)와 Kanana의 KMMLU 44.17(5-shot 기본)은 비슷해 보여도 설정이 다르다. HyperCLOVA 카드는 같은 Qwen3-14B의 KMMLU를 두 표에서 0.5864와 0.4930으로 다르게 적었으므로, 이 카드의 비교표 자체를 신뢰하기 어렵다. 네이버가 내세우는 강점은 KMMLU보다 HAERAE와 KOBEST 쪽에 몰려 있어 문화·언어 특화 영역의 우위로 읽는 것이 합리적이라는 추론이다. 카카오의 KoMT-Bench 비교(Kanana-2 3B 6.92 대 Qwen3.5-2B 5.21)는 gpt-4o를 심판으로 쓴 단일 LLM 심판 벤치마크이며, 독립 재현과 사람 평가가 없다.

토큰 효율도 모델마다 다르다. EEVE-Korean 연구는 6.7GB 한국어 말뭉치에서 SOLAR 토크나이저가 3.1B 토큰을 쓰고, 한국어 어휘를 확장한 토크나이저는 1.6B 토큰을 쓴다고 측정했다 ([EEVE-Korean](https://arxiv.org/pdf/2402.14714)). Thunder-Tok 연구는 BPE 대비 단어당 토큰 수를 약 10% 줄였다고 보고했다 ([Thunder-Tok](https://arxiv.org/abs/2506.15138)). 카카오는 Kanana-2의 토큰 효율이 이전 세대보다 30% 이상 좋아졌다고 밝혔지만 이는 벤더 주장이다. 2026년 주요 소형 모델의 한국어 토큰 수는 측정된 자료가 없다. 즉 같은 컨텍스트 창에 들어가는 한국어 분량이 모델마다 다르다는 뜻이고, 이 값도 선택 기준에 넣어야 한다.

## 등급별 추천은 메모리 예산으로 나누고 근거 등급을 붙인다

RAM 수치는 실측이 없다. 아래의 기준은 모두 추정이다. Q4_K_M 가중치 크기는 대략 모델 파라미터 수(B) × 0.6GB로 잡았는데, 이는 8B급 Q4_K_M이 4.6~4.9GB라는 2차 자료에서 외삽한 값이다. 실제 RSS는 가중치, KV 캐시, 런타임 버퍼, 운영체제 몫의 합이다. 16k 컨텍스트의 FP16 KV 캐시는 8B급 모델에서 약 2GB라는 2차 추정이 있다. 이 조사는 8GB CPU 기기에서 운영체제와 런타임을 빼고 모델에 약 5GB를 쓸 수 있다고 보고 등급 상한을 잡았다. 이 값은 추론이며 실측이 아니다. 아래 표의 근거 열은 각 후보가 무엇으로 뒷받침되는지를 보여준다.

**8GB CPU 전용 (가중치 약 5GB 이하, 4B급까지 여유, 8B급은 경계)**

| 언어 | 후보 | 라이선스 | GGUF | 근거 |
|---|---|---|---|---|
| 한국어 | Kanana-2 1.3B Instruct | 원문 확인, 조건부 상업 | 미발견. 직접 변환 필요 | 벤더 KMMLU-CoT 42.79 |
| 한국어 | Kanana-2 3B Instruct | 원문 미확인 | 미확인 | 벤더 KMMLU-CoT 43.32, KoMT-Bench 6.92 |
| 한국어 | EXAONE 4.0 1.2B | 비상업 (2차, 1.2B 원문 미확인) | 공식 보고 (2차) | 벤더 KMMLU-Redux 40.4 (비추론). 상업 제품에 쓸 수 없음 |
| 영어 | Qwen3.5 2B / 4B | 보류 | 양자화본 확인, 공식 미확인 | 영어 벤더 수치는 본 조사에서 수집하지 않음 |
| 영어 | Gemma 4 E2B / E4B | 카드 Apache 2.0 (원문 미확인) | QAT 공식 보고 (2차) | 한국어·영어 벤더 수치 미수집 |
| 영어 | SmolLM3-3B | 카드 Apache 2.0 | 형식 불명확 | 지원 언어 6개에 한국어 없음 |
| 일본어·중국어·유럽어 | Qwen3.5 2B / 4B | 보류 | 양자화본 | 다국어 벤더 수치는 9B 이상만 보고, 언어별 분해 없음 |
| 유럽어 | Ministral 3 3B | 미확인 | 미확인 | 조사 공백 |

**16GB (가중치 약 10GB 이하)**

| 언어 | 후보 | 라이선스 | GGUF | 근거 |
|---|---|---|---|---|
| 한국어 | HyperCLOVA X SEED 14B Think | 원문 확인, 조건부 상업 | 네이버 공식 없음, 제3자 양자화 | 벤더 KMMLU-Think 0.6649, HAERAE 0.8537. Q4 가중치 약 8~9GB (추정) |
| 한국어 | Kanana-2 3B Instruct | 원문 미확인 | 미확인 | 8GB 후보보다 여유 있음 |
| 영어 | Gemma 4 12B QAT | 카드 Apache 2.0 (원문 미확인) | 공식 Q4_0 6.98GB 확인 | 카드에 MMMLU와 오디오 수치만 있고 한국어 수치 없음 |
| 영어 | gpt-oss-20b (MXFP4) | 카드 Apache 2.0 | 미확인 | 카드는 "16GB 이내" 동작을 주장. CPU 실측 없음, 경계선 |
| 일본어·중국어 | Qwen3.5 9B | 카드 Apache 2.0 | 양자화본 | 다국어 벤더 수치 (MMMLU 81.2, MMLU-ProX 76.3) 있으나 언어별 분해 없음 |
| 유럽어 | Ministral 3 14B | 카드 Apache 2.0 + IP 조항 | 공식 확인 | 유럽어 수치는 조사하지 않음 |

**32GB (가중치 약 22GB 이하)**

| 언어 | 후보 | 라이선스 | GGUF | 근거 |
|---|---|---|---|---|
| 한국어 | EXAONE 4.0 32B | 원문 확인, 상업 금지 | 공식 확인 | 벤더 KMMLU-Redux 72.7 (추론). 연구·교육 용도만 가능 |
| 한국어 | Kanana-2 30B-A3B | 원문 미확인, 명칭 불일치 | 미발견 | 벤더 수치 미수집. MoE로 활성 파라미터가 적다는 점은 속도 측면 추론 |
| 한국어 | HyperCLOVA X SEED 14B 고정밀 양자화 | 원문 확인, 조건부 상업 | 제3자 | 14B를 Q8 등으로 올리는 것은 추론이며 품질 차이는 미측정 |
| 영어 | Gemma 4 26B-A4B / 31B | 카드 Apache 2.0 (원문 미확인) | QAT 보고 (2차) | 파일 크기 미확인 |
| 영어 | gpt-oss-20b | 카드 Apache 2.0 | 미확인 | 카드의 16GB 이내 주장과 CPU 실측 차이 미확인 |
| 유럽어 | Ministral 3 14B 고정밀 | 카드 Apache 2.0 + IP 조항 | 공식 확인 | 같은 모델의 상위 양자화 |

**64GB**

이번 조사에는 32GB를 넘는 모델에 대한 근거가 없다. 추론하자면 64GB 등급은 위 32GB 후보를 더 높은 정밀도로 쓰는 것이 자연스럽지만, 그 메모리 수치와 품질 차이는 측정하지 않았다. 한국어 상업 용도에서 64GB 등급이 해결해 주는 것은 없고, 라이선스 조건은 등급과 무관하게 같다.

모델을 고르는 절차는 등급과 무관하게 다섯 단계다. 첫째, LICENSE 원문을 읽고 용도(상업인지 연구인지)와 맞는지 확인한다. 둘째, 공식 GGUF를 우선하되 양자화본은 `base_model` 필드와 해시로 검증한다. 셋째, llama.cpp에서 실제로 로드되는지 확인한다. 아키텍처 지원 여부가 가장 자주 막히는 지점이다. 넷째, `-c 4096`과 `-c 16384`로 실행해 로그의 모델 버퍼와 KV 캐시 크기를 읽고 프로세스 RSS를 확인한다. 다섯째, 실제로 배포할 GGUF 양자화본을 고정된 한국어 평가 하네스로 돌린다. `daekeun-ml/evaluate-llm-on-korean-dataset`은 KMMLU, CLIcK, HAE-RAE, HRM8K, KoBALT, KorMedMCQA를 한 설정으로 돌리므로 쓸 만하다 ([Source](https://github.com/daekeun-ml/evaluate-llm-on-korean-dataset)). 양자화는 한국어 점수를 바꾸므로 카드의 BF16 수치를 그대로 믿으면 안 된다.

## 확인되지 않은 항목과 공백

아래 공백은 추천의 신뢰도를 직접 떨어뜨린다. 가장 큰 공백은 일본어·중국어·유럽어와 64GB 등급이다. 이번 조사는 한국어에 집중했고, 다른 언어는 다국어 벤더 수치의 존재만 확인했다.

| 공백 | 영향 |
|---|---|
| Granite 4.x, Phi-4-mini 라이선스와 GGUF | 8GB 영어 후보가 빠져 있음 |
| Qwen3.5 0.8B~4B 라이선스 원문, 공식 GGUF 저장소 | 8GB 영어·다국어 추천의 핵심이 미검증 |
| Ministral 3 3B 라이선스와 GGUF | 8GB 유럽어 후보 미검증 |
| Kanana-2 3B와 30B-A3B 라이선스 원문 | 상업 결론 불가. 30B-A3B는 명칭 충돌 |
| HyperCLOVA X SEED 0.5B, 1.5B, 32B 원문 | 14B 조항을 전체에 적용한 것은 가정 |
| EXAONE 4.0 1.2B 원문 | 8GB 한국어 후보의 라이선스가 2차 자료에 의존 |
| Gemma 4 원문과 Qwen3.5 소형 원문 | Apache 2.0 주장을 카드와 블로그에만 의존 |
| GGUF 재배포 규칙 | 양자화본을 직접 호스팅해도 되는지 미검증. 링크만 두는 편이 안전하다는 것은 추론 |
| Kanana와 HyperCLOVA의 llama.cpp 지원 | GGUF가 없고 아키텍처 지원도 미확인 |
| llama.cpp 메모리 실측 | 모든 RAM 수치는 추정 |
| HF API 파라미터와 GGUF 헤더 키 이름 | 수집기는 명세를 직접 읽고 짜야 함 |
| 일본어·중국어·유럽어 벤치마크 | 언어별 근거 없음 |
| 64GB 등급 후보 | 근거 없음 |
| Open Ko-LLM 리더보드 2026 상태, 독립 한국어 소형 모델 비교 | 한국어 성능의 독립 근거 없음 |
| K-EXAONE 2.0 Apache 2.0 전환 주장 | 2차 미확인 |

## 결론: 한국어 상업 선택지는 공식 GGUF 없이 좁아진다

한국어 로컬 모델을 상업 제품에 쓰려면 성능보다 라이선스가 먼저 후보를 거른다. 원문으로 확인된 범위에서 EXAONE은 상업 용도에서 제외되고, 남는 것은 Kanana(8GB급)와 HyperCLOVA X SEED(16GB급)다. 두 모델 모두 이번 조사에서 공식 GGUF가 확인되지 않았다. 즉 한국어 상업 후보 중 공식 배포 GGUF를 가진 모델이 없다는 점이 가장 실무적인 결론이다. 배포 기업은 직접 변환과 llama.cpp 지원 확인 비용을 감수하거나, EXAONE과의 별도 계약을 검토하거나, 카카오와 네이버에 조건 확인을 요청해야 한다.

영어와 서구권 후보는 카드 수준에서 Apache 2.0이 많지만, 원문을 읽지 않았다는 점이 가장 큰 불확실성이다. 쉬운 상업 선택지가 실제로 쉬운지는 Qwen3.5 소형과 Gemma 4 LICENSE 원문을 읽어 봐야 알 수 있다. 다음 단계는 세 가지다. Qwen3.5 소형과 Gemma 4 원문, 카카오 3B와 30B-A3B, 네이버 소형 모델의 LICENSE 파일을 읽고, 실제 GGUF를 llama.cpp에서 로드해 메모리를 재고, 한국어 하네스로 같은 양자화본을 평가하는 것이다. 이 세 가지가 채워지기 전까지 위의 등급표는 추정이며, 추천이 아니라 검증할 후보 목록으로 읽어야 한다.
