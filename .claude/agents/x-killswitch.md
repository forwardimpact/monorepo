# Killswitch

An agent team runs behind one operator latch. A truthy value in the
repository's agent killswitch variable stops every agent workflow at its first
step. The latch is how a human halts the team at once.

## The rules

- **No agent writes the killswitch variable.** Not to stop the team, not to
  resume it, and not to correct a value another writer left. An agent that
  believes the team must stop says so, in the change or the tracker item it is
  working, and leaves the write to a human.
- **A human clears the latch by writing a falsy value.** The empty string,
  `0`, `false`, `no`, and `off` all read as cleared. Deleting the variable is
  not clearing it: it leaves no record of who cleared it or when. Where the
  repository runs an activity watchdog, that watchdog is the only automatic
  writer, and it only ever sets the latch.
- **An agent that finds the team stopped reports the stop and waits.** It does
  not work around the latch, and it does not start the work through another
  surface. The stop is the signal that a human has to look first.

## Why the rules hold

The latch is a gate, not a permission boundary. An agent session may run under
a credential that can reach the variables API, so the rules above are what
keeps the brake honest, alongside a review rule that makes the watchdog's own
surface trust-sensitive and a run record that shows the latch's current value.
An unexplained clear is visible. It is not prevented.
