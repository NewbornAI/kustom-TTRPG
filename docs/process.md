# The process of a task

*How a task is gated. The router is [AGENTS.md](../AGENTS.md).*

- The test scenario gates a task. Mandal's words, 2026-10-26: "the task artifact
  template contains a test scenario that gates completion". A task is landed
  when its scenario passes, not when its code is written, and the artifact
  carries the scenario it was checked against.
- Two gates, and the marker carries them. The first character of a task's line
  in STATUS.md says where it stands: `-` no review, `+` the independent
  evaluator ran its test scenario and it passed, `x` Mandal read it and it
  closes, `>` Mandal read it and sent it back with his words after `=>`. The
  evaluator is a worker that did not do the work: it flips `-` to `+` and
  never deletes, and Bulle moves a `>` line back to pending, writes the words
  into the artifact and sets its state to pending. Mandal's words, 2026-10-26:
  "I'll gate the items as well by editing STATUS.md". A line marked `x` is
  deleted in the commit that carries the review, and not before.
- The state of a task follows its answers. An answer that asks for more work
  sends the artifact back to pending, and a correction reopens it, so a landed
  list never carries a task that is not done.
