# CCLauncher

CCLauncher is a terminal UI (TUI) and CLI for managing Claude Code model configurations and launching Claude Code with the right environment variables.

## Install

### npm (requires Bun)

```bash
npm install -g claude-model-launcher
```

Make sure Bun is available on your PATH:

```bash
bun --version
```

### Homebrew (requires Bun)

```bash
brew tap Connorbelez/tap
brew install claude-model-launcher
```

## Usage

Launch the interactive TUI:

```bash
claude-launch
```

List configured models:

```bash
claude-launch --list
```

Launch a specific model:

```bash
claude-launch --model mymodel
```

Add a model from the CLI:

```bash
claude-launch --add --name mymodel \
  --endpoint https://api.anthropic.com \
  --token env:ANTHROPIC_API_KEY \
  --model-id claude-opus-4-5-20251101
```

## Configuration

Models are stored in:

```text
~/.claude-model-launcher/models.json
```

Tokens can be stored as environment variable references using the `env:VAR_NAME` syntax.

### Model schema (example)

```json
{
  "example": {
    "name": "example",
    "description": "Example configuration",
    "value": {
      "ANTHROPIC_BASE_URL": "https://api.anthropic.com",
      "ANTHROPIC_AUTH_TOKEN": "env:ANTHROPIC_API_KEY",
      "ANTHROPIC_MODEL": "claude-sonnet-4-20250514",
      "ANTHROPIC_SMALL_FAST_MODEL": "claude-haiku-3-5-20241022",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-20250514",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "claude-opus-4-5-20251101",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "claude-haiku-3-5-20241022"
    }
  }
}
```

## Development

```bash
bun install
bun dev
```

## Author

Connor Beleznay
