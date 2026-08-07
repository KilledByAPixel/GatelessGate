# Contributing

Pull requests are welcome. This file exists because the licence on its own
would tell you they aren't.

## Forking to contribute is expressly permitted

The book is licensed [CC BY-NC-ND 4.0](LICENSE), and the `ND` in that stands
for NoDerivatives — read strictly, a fork with your commits on it is a
derivative work, and publishing one is the thing the licence prohibits.

That is not the intent, and it is not how this repository is meant to be used.
**You may fork this repository, modify your fork, and publish it for the
purpose of proposing those changes back here.** That permission is given
freely and in addition to the licence.

What the licence is actually for is the other case: someone taking the book,
changing it, and putting out their own version of it as a thing of their own.
That is what the terms are there to prevent. Helping with this one is not that.

## What happens to what you send

By opening a pull request you keep the copyright in what you wrote, and you
license it to Frank Force under the same terms the rest of the project carries,
with permission to relicense it if the project's licence ever changes. Nothing
here asks you to sign over ownership.

Practically: if a contribution is merged it becomes part of the book, and the
book stays under one licence rather than becoming a patchwork.

## Before you open one

- `npm test` must pass. The suite is a thousand-odd tests in plain Node with no
  browser, and it runs in a couple of minutes.
- Read [CLAUDE.md](CLAUDE.md) first. It is written for AI assistants but it is
  the actual architecture document: the determinism rule, the kit's reuse rule,
  the render pipeline, the testable-state pattern, and the per-scene budgets are
  all set out there, and a change that violates one of them will be sent back.
- The design doc in `docs/` is authoritative on intent where it exists.
- Art changes are Frank's call and often a matter of taste. For anything
  substantial, open an issue before building it — better to disagree about a
  paragraph than about a week.

## What is most useful

Bugs, browser and device compatibility, performance, accessibility, and
typos or errors in the text. Those are unambiguous and always welcome.
