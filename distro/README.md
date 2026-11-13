# Nuri OS (가칭)

KDE Plasma 데스크톱에 **PC 안에서만 동작하는 AI 비서**를 넣은 리눅스 배포판이에요.
Fedora Kinoite(atomic KDE)를 기반으로 하고, OS 전체를 컨테이너 이미지 하나로 만들어 배포해요.

> 이름 "Nuri"는 임시 코드네임이에요. 공개 전에 상표 검색을 하고 확정하세요.
> 이름은 `build_files/20-branding.sh`, `Containerfile`, `nuri-ai`의 문구에 있어요.

## 지금 되는 것

| 기능 | 상태 |
|---|---|
| Fedora 45 Kinoite 기반 OS 이미지 빌드 | 동작 확인 |
| 로컬 AI 엔진 (llama.cpp `llama-server`, 127.0.0.1 전용) | 동작 확인 |
| `nuri-ai`: PC 사양·언어에 맞는 모델 추천 (A, B, C…, ✨ 추천 표시) | 동작 확인 |
| 모델 설치: 정확한 파일·커밋 고정, SHA-256 검증, 이어받기, 라이선스 동의 | 동작 확인 |
| 긴 대화: 전체 기록은 디스크에, 오래된 대화는 "사실 메모"로 요약 | 동작 확인 (작은 모델은 메모 활용이 약함) |
| Wine, winetricks, NTFS/exFAT, SMB | 설치됨 |
| 첫 부팅 시 Flatpak 앱 설치 (Bottles, Steam, LibreOffice, LocalSend, Firefox) | 작성됨, 실기 부팅 미검증 |
| 자동 업데이트 (백그라운드로 받아 두고 재부팅 때 적용, 롤백 가능) | 작성됨, 실기 부팅 미검증 |
| 설치용 ISO (bootc-image-builder) | 작성됨, 미검증 |
| 맥 느낌 테마, 전역 단축키 AI 패널, 파일 우클릭 메뉴 | 아직 없음 |

## 구조

```
Containerfile              OS 이미지 정의 (Fedora Kinoite 45 위에 쌓음)
build_files/               이미지 빌드 중 실행되는 스크립트
  10-packages.sh           추가 패키지 (llama-cpp, wine, …)
  20-branding.sh           OS 이름 표시
  30-services.sh           서비스 활성화
system_files/              이미지에 그대로 복사되는 파일
  usr/bin/nuri-ai          AI 모델 관리·대화 CLI (파이썬 표준 라이브러리만 사용)
  usr/libexec/nuri/        서버 실행, 첫 부팅 앱 설치 스크립트
  usr/lib/systemd/         nuri-ai.service(사용자), nuri-flatpak-setup.service
  usr/share/nuri/          모델 레지스트리(models.json), 기본 앱 목록, 설정 예시
  etc/rpm-ostreed.conf     자동 업데이트 정책 (stage: 재부팅 때 적용)
registry/models.src.json   사람이 고르는 모델 목록과 언어별 추천 순위
tools/pin_models.py        목록을 정확한 파일·커밋·SHA-256으로 고정
iso/config.toml            설치 ISO 설정
tests/                     nuri-ai 테스트 (네트워크 없이 실행)
```

## 빌드

필요한 것: Linux, `podman`(권장) 또는 `docker`, 디스크 여유 40GB 이상.

```bash
make test                # 단위 테스트
make build               # OS 이미지 빌드 → localhost/nuri:dev
make run                 # 이미지 안에서 셸 열기
make iso                 # 설치용 ISO → output/ (podman, root 필요)
```

회사망처럼 HTTPS를 가로채는 프록시 뒤에서 빌드하면 Fedora 저장소 연결이 실패해요.
그럴 때만 `make build EXTRA_CA=/path/to/proxy-ca.pem`을 쓰세요.
이 인증서는 빌드 중에만 쓰이고 완성된 이미지에는 남지 않아요.

## 로컬 AI 사용법 (설치된 OS에서)

```bash
nuri-ai list                       # 이 PC에 맞는 모델 (시스템 언어 기준)
nuri-ai list --lang en             # 다른 언어 기준으로 보기
nuri-ai install qwen3.5-4b         # 라이선스 확인 후 내려받기 + 검증
nuri-ai use exaone-4.0-1.2b        # 설치된 모델 중 전환
nuri-ai chat                       # 대화 (Ctrl-D 종료)
nuri-ai ask "이 문장 요약해줘: …"   # 한 번 묻기 (단축키, 스크립트용)
nuri-ai status
```

- AI 서버는 `127.0.0.1`에만 열려서 네트워크의 다른 기기가 접근할 수 없어요.
- 모델, 설정, 대화 기록은 모두 `~/.local/share/nuri`, `~/.config/nuri`에 있어요.
- 인터넷을 쓰는 순간은 모델을 내려받을 때뿐이에요.
- 서버 설정(컨텍스트 길이, GPU 사용 등)은 `/usr/share/nuri/ai.env.example`을 참고하세요.

## 모델 레지스트리

`registry/models.src.json`에 모델과 언어별 추천 순위를 적고 `make registry`를 실행하면
`system_files/usr/share/nuri/models.json`이 만들어져요. 각 모델은 정확한 저장소 커밋,
파일 이름, SHA-256으로 고정되어서, 원본 저장소가 바뀌어도 검증되지 않은 파일은 설치되지 않아요.

| 필드 | 뜻 |
|---|---|
| `min_ram_gb` | OS·데스크톱까지 포함한 PC 전체 RAM 기준 |
| `recommend` | 언어별 추천 순위 (✨ 표시). 예: `{"ko": 1}` |
| `commercial` | `yes` / `no` / `unverified`. LICENSE 원문을 읽은 뒤에만 yes/no |
| `trust` | `official`(제작사) / `trusted-quant`(unsloth, bartowski 등) / `repackaged`(제3자 변환, 경고 표시) |

현재 14개 모델이 들어 있어요. 라이선스 조사 결과는 저장소의
`reports/로컬 LLM 라이선스와 등급별 추천.md`를 보세요. 대부분 `commercial: unverified`예요.

## 업데이트 방식

설치된 PC는 `ghcr.io/OWNER/nuri:latest` 이미지를 따라가요(`iso/config.toml`의 `OWNER`를
실제 GitHub 계정으로 바꾸세요). `rpm-ostreed-automatic.timer`가 새 이미지를 받아 두고,
다음 재부팅 때 적용해요. 문제가 생기면 부팅 메뉴에서 이전 버전을 고르거나
`sudo bootc rollback`으로 되돌릴 수 있어요.

## 알려진 한계

- 1B급 작은 모델은 요약 메모가 있어도 이전 대화 내용을 잘 활용하지 못해요. 8GB 기기의 기억 성능은 더 검증해야 해요.
- Kanana 한국어 모델은 공식 GGUF가 없어서 제3자 변환본을 가리켜요(⚠ 경고 표시).
- ISO 설치, 첫 부팅 앱 설치, 자동 업데이트는 실제 PC나 VM에서 아직 검증하지 않았어요.
- GitHub Actions 워크플로는 `distro/`가 독립 저장소가 되어야 실행돼요.

## 라이선스

이 저장소의 코드는 Apache License 2.0이에요. 각 AI 모델은 각자의 라이선스를 따르고,
`nuri-ai install`이 설치 전에 그 라이선스를 보여 주고 동의를 받아요.
