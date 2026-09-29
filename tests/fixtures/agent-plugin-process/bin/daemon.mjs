// The fixture plugin's declared daemon entry.
//
// A plugin package may declare `extensions.openagent.daemon`, and the loader
// validates that declaration while loading the package. The desktop host starts
// a package daemon for exactly one identity — the reserved product capability it
// supervises — so this file is deliberately never launched for an installed
// third-party package. It exists so the fixture declares all three component
// kinds a portable package can ship, and so a daemon declaration that stopped
// validating would show up as a warning on the fixture's card instead of
// staying invisible.

process.stdout.write(
  "openagent-process-plugin daemon: this host does not supervise this package\n",
);
