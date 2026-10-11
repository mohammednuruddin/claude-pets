# claude-pets

Mods for Claude Code (2.1.287 or later, desktop app):

- **pets**: four faceless pets in starlight line art live above the prompt and act out what Claude is doing. See `plugins/pets/README.md`.
- **prompt-cache-control**: a prompt-cache meter that sits under the pets, with a countdown to the cache's expiry and your 5-hour and weekly plan windows. It is Daniel Avila's Cache Control mod from [claude-code-templates](https://github.com/davila7/claude-code-templates) (MIT), with small changes so the two bands stack, the countdown redraws once a minute, and the plan windows show.

## Install

```sh
claude plugin marketplace add mohammednuruddin/claude-pets
claude plugin install pets@claude-pets
claude plugin install prompt-cache-control@claude-pets
```

Then restart Claude Code. Later, `claude plugin marketplace update claude-pets` pulls new versions.
