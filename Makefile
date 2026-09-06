# kube-state-graph-frontend — common dev tasks
.DEFAULT_GOAL := help

IMAGE ?= kube-state-graph-frontend:local

.PHONY: help install dev lint typecheck test e2e build fixture-build fixture-check check image scan image-push deploy

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_.-]+:.*##' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install npm dependencies
	npm install

dev: ## Start Vite dev server (demo mode by default)
	npm run dev

lint: ## Run ESLint (zero warnings)
	npm run lint

typecheck: ## Run TypeScript checker
	npm run typecheck

test: ## Run unit tests
	npm run test

e2e: ## Run Playwright e2e tests
	npm run e2e

build: ## Typecheck then produce dist/
	npm run build

fixture-build: ## Serialize SHOWCASE_GRAPH to public/demo/graph.json
	npm run fixture:build

fixture-check: ## Fail if public/demo/graph.json drifted from the fixture
	npm run fixture:check

check: ## Full local gate (lint, typecheck, fixture:check, unit tests)
	npm run lint && npm run typecheck && npm run fixture:check && npm run test:ci

image: ## Build the container image (IMAGE=registry/repo:tag)
	docker build -t $(IMAGE) .

scan: ## Scan the built image for CVEs the same way CI does (needs trivy)
	trivy image --scanners vuln --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL --ignore-unfixed --exit-code 1 $(IMAGE)

image-push: ## Push the container image
	docker push $(IMAGE)

deploy: ## Apply deploy/ manifests with IMAGE override
	kubectl apply -k deploy/
	kubectl set image deploy/kube-state-graph-frontend frontend=$(IMAGE)
