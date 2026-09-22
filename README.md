# chennai-capstone-SE4-team2
Team 2's work on creating a full stack enterprise trading platform

## Development setup

Once per clone, install the repo's pre-commit hooks (secret scanning,
shellcheck, basic hygiene — see `extension_stories.md` and
`.pre-commit-config.yaml`):

```bash
pip install pre-commit
pre-commit install
```

They then run automatically on `git commit`. To run them on demand against
everything already in the repo:

```bash
pre-commit run --all-files
```
