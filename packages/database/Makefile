# Binary name
BINARY=kv

# Go settings
GO=go
GOFLAGS=-v
LDFLAGS=-s -w

# Output directory
BUILD_DIR=bin

# Platforms
PLATFORMS=\
	darwin/amd64 \
	darwin/arm64 \
	linux/amd64 \
	linux/arm64 \
	windows/amd64

.PHONY: all build build-all run clean test fmt tidy

all: build

# Build for current OS
build:
	mkdir -p $(BUILD_DIR)
	$(GO) build $(GOFLAGS) -ldflags="$(LDFLAGS)" -o $(BUILD_DIR)/$(BINARY) .
	chmod +x $(BUILD_DIR)/$(BINARY)

# Build for all platforms
build-all:
	mkdir -p $(BUILD_DIR)
	@for platform in $(PLATFORMS); do \
		GOOS=$${platform%/*}; \
		GOARCH=$${platform#*/}; \
		OUTPUT=$(BUILD_DIR)/$(BINARY)-$$GOOS-$$GOARCH; \
		if [ "$$GOOS" = "windows" ]; then \
			OUTPUT="$$OUTPUT.exe"; \
		fi; \
		echo "Building $$OUTPUT"; \
		GOOS=$$GOOS GOARCH=$$GOARCH $(GO) build $(GOFLAGS) -ldflags="$(LDFLAGS)" -o $$OUTPUT . ; \
		if [ "$$GOOS" != "windows" ]; then \
			chmod +x $$OUTPUT; \
		fi; \
	done

run: build
	./$(BUILD_DIR)/$(BINARY)

clean:
	rm -rf $(BUILD_DIR)

test:
	$(GO) test ./...

fmt:
	$(GO) fmt ./...

tidy:
	$(GO) mod tidy
