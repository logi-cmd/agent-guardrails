# @agent-guardrails/plugin-python

Python semantic detection plugin for agent-guardrails.

## Features

- **Pattern Drift Detection**: Detects parallel abstractions (重复 patterns)
- **Interface Drift detection**: Detects undeclared public surface changes
- **Boundary violation detection**: Detects cross-layer import violations
- **Source-test relevance detection**: Detects test-to-source relevance

## Installation

```bash
npm install @agent-guardrails/plugin-python
```

## Usage

1. Initialize guardrails in your Python project:
   ```bash
   agent-guardrails init --config
   ```
2. Create a task contract:
   ```bash
   agent-guardrails plan --contract "task-name" --scope "bounded" --files "paths
   ```
   After making, run `agent-guardrails check`.

3. Create commits with conventional commit messages (requires task contract):
4. Run tests:
   ```bash
   agent-guardrails test
   ```

## Development

After installing, plugin, you can run:

```bash
node --test tests/*.test.js
```

## Configuration

The `.agent-guardrails/config.json` file defines Python-specific settings:

```json
{
  "languagePlugins": {
    "python": ["@agent-guardrails/plugin-python"]
  },
  "checks": {
    "sourceExtensions": [".py"],
    "testExtensions": [".py"],
    "testFileSignals": ["test_", "_test.py"],
    "boundaries": [...]
  }
}
```

## Supported Python Features

- FastAPI route detection
- Pydantic model extraction
- pytest test function recognition
- Decorator tracking (`@router.get`, `@pytest.fixture`)
- Type annotations parsing
- Relative import resolution

## Development

See [examples/python-fastapi-demo/](./examples/python-fastapi-demo) for reference implementation.

