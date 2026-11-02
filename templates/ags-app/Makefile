.PHONY: help platform-dev deps types test conformance ci bundle typecheck gates

AGS_PLATFORM_VERSION := v0.4.0
CONTRACTS_VERSION := v0.3.0
AGS_PLATFORM_REPO := https://github.com/RandomGenericUsername/ags-platform.git
AGS_PLATFORM_DEV ?=
PLATFORM_FETCH_DIR := $(CURDIR)/.dev/ags-platform/$(AGS_PLATFORM_VERSION)
PLATFORM_SRC := $(if $(AGS_PLATFORM_DEV),$(AGS_PLATFORM_DEV),$(PLATFORM_FETCH_DIR))
CONTRACTS_ROOT ?= $(CURDIR)/../contracts
BUNDLE_FILE := build/{{APP}}.js

help:
	@echo "make test / conformance   stock-runner gates"
	@echo "make typecheck / bundle    LOCAL desktop-stack gates"
	@echo "make ci / gates            CI subset / all local gates"

platform-dev:
	@mkdir -p "$(dir $(PLATFORM_FETCH_DIR))" node_modules
	@src=""; \
	if [ -n "$(AGS_PLATFORM_DEV)" ]; then src="$(AGS_PLATFORM_DEV)"; \
	elif [ -f "$(PLATFORM_FETCH_DIR)/index.ts" ]; then src="$(PLATFORM_FETCH_DIR)"; \
	elif [ -f "$(CURDIR)/../ags-platform/index.ts" ]; then \
		ln -sfn ../../../ags-platform "$(PLATFORM_FETCH_DIR)"; src="$(PLATFORM_FETCH_DIR)"; \
	else \
		rm -rf "$(PLATFORM_FETCH_DIR)"; \
		git clone --depth 1 --branch $(AGS_PLATFORM_VERSION) $(AGS_PLATFORM_REPO) "$(PLATFORM_FETCH_DIR)" || exit 1; \
		rm -rf "$(PLATFORM_FETCH_DIR)/.git"; src="$(PLATFORM_FETCH_DIR)"; \
	fi; \
	[ -f "$$src/index.ts" ] || { echo "FAIL: no ags-platform at $$src" >&2; exit 1; }; \
	ln -sfn "$$src" node_modules/ags-platform

deps:
	@if [ ! -x node_modules/.bin/tsc ]; then \
		npm install --no-save --no-package-lock typescript@5.9 >/dev/null || exit 1; \
	fi

types:
	@command -v ags >/dev/null || { echo "FAIL: ags is not on PATH" >&2; exit 1; }
	@[ -d "@girs" ] || ags types -d "$(CURDIR)" -u

test: platform-dev
	node --test tests/unit.test.mjs

conformance: platform-dev
	@[ -f "$(CONTRACTS_ROOT)/schemas/ags-app-manifest.schema.json" ] || { \
		echo "FAIL: no contracts schema at $(CONTRACTS_ROOT)" >&2; exit 1; }
	CONTRACTS_ROOT="$(CONTRACTS_ROOT)" node --test tests/app-contract.test.mjs

ci: test conformance

bundle: platform-dev
	@command -v ags >/dev/null || { echo "FAIL: ags is not on PATH" >&2; exit 1; }
	@mkdir -p build
	ags bundle app.tsx "$(BUNDLE_FILE)"
	@[ -s "$(BUNDLE_FILE)" ] || { echo "FAIL: bundle missing" >&2; exit 1; }

typecheck: deps types platform-dev
	@[ -e node_modules/ags ] || ln -sfn /usr/share/ags/js node_modules/ags
	@[ -e node_modules/gnim ] || ln -sfn /usr/share/ags/js/node_modules/gnim node_modules/gnim
	npx tsc --noEmit -p tsconfig.app.json

gates: test conformance bundle typecheck
