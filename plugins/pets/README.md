# Pets

Four faceless pets in starlight line art live in the band above the Claude
Code prompt and act out what Claude is doing.

- The cat reads by lantern light when Claude reads files. The bunny plants a
  seedling on every edit. The dog digs when a command runs, and fetches a star
  from off the band for a helper agent. The chick watches a flask while tests
  run and flies up to look ahead when Claude browses.
- They lean in when Claude is asking you something. They panic at risky
  commands (commits, pushes, hard resets, `rm -r` outside /tmp, deploys), and a
  dialog asks you first: "Block it" or "Run it". In bypass-permissions mode the
  dialog is skipped and they only panic.
- Failing tests bring a rain cloud; the next passing run clears it.
- Every answered turn lights a star of a constellation; every edit grows a
  sprout on the number line. Between turns they potter, then fall asleep.
- Each helper agent gives a pet a young one, which copies its parent and falls
  asleep when the agent finishes.
- The buttons: Feed, Play (a star falls and the dog fetches it), Dance. The
  small star under each pet plays with that pet.
- `/pets` hides and shows the band. `/wrapped` draws the session as one card
  and saves it to ~/Downloads.

## Install

Needs Claude Code 2.1.287 or later, in the desktop app (the band is drawn
there; the terminal gets no picture).

```sh
unzip claude-pets.zip -d ~/.claude/skills
```

so that `~/.claude/skills/pets/` exists, then restart Claude Code. The mod
loads in every session. To check it: `claude plugin validate ~/.claude/skills/pets`
and `claude plugin test ~/.claude/skills/pets`.

The zip also holds `prompt-cache-control`, the open-source cache meter from
claude-code-templates (MIT), with small local changes so the two bands stack
and the countdown only redraws once a minute. Drop it next to `pets` for the
cache row under the animals; leave it out if you do not want it.

The pets are faceless on purpose: no eyes, mouths or noses, by the owner's
faith constraint. Please keep them that way if you change the art.
