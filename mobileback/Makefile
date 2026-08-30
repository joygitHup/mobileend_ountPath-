.PHONY: deps seed run migrate docker-up e2e help

# 本机 Go 常装在 ~/.local/go（见 AGENTS.md）；终端未 export 时仍能 make
export PATH := $(HOME)/.local/go/bin:/usr/local/go/bin:$(PATH)
# 国内拉模块：官方 proxy.golang.org 常超时
export GOPROXY := https://goproxy.cn,direct
export GOSUMDB := sum.golang.google.cn

deps:
	go mod tidy

# 种子真相源：mobileback/seeds/*.json（直接编辑，不再从 Express 导出）
seed: deps
	go run ./cmd/seed

run: deps
	go run ./cmd/api

docker-up:
	docker compose up -d

e2e:
	bash ./scripts/e2e-smoke.sh

help:
	@echo "make seed   # 从 seeds/*.json 导入 SQLite"
	@echo "make run    # 启动 :9092（主后端）"
	@echo "make e2e    # 冒烟：登录→发现→行程→清单→社区→守护"
	@echo ""
	@echo "端口：mobileback :9092"
	@echo "种子：编辑 mobileback/seeds/*.json 后 make seed"
