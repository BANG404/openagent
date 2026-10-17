# Native process resource sampling

On Windows, attach the read-only sampler to the exact desktop main PID:

```powershell
bun run test:perf:resources --pid <desktop-pid> --label idle --duration-seconds 60
bun run test:perf:resources --pid <desktop-pid> --label long-chat --duration-seconds 120 --max-cpu-p95 30 --max-private-mb 1500 --max-private-growth-mb 100 --max-handle-growth 20
```

Budgets above are examples, not universal product limits. Establish a baseline
on identical hardware, build mode, window visibility and fixture sizes before
choosing limits. Run idle-visible, hidden/minimized, streaming, repeated history
navigation and post-workload idle separately. `--label` records the operator's
scenario; it does not drive that workload. Use existing tauri-pilot scenarios
to drive the corresponding interaction in an isolated `OPENAGENT_HOME`.
The collector neither starts nor stops the selected application and never
modifies its settings or conversations. It does not collect command lines,
paths, environment variables, model content or credentials.

The root must be the actual desktop process, not a development launcher or the
shell running the sampler. The tree includes current Runtime, WebView, GPU and
plugin descendants, but excludes independently launched/shared services and
detached children after their parent exits. Raw samples retain PID, executable
name and PID-plus-creation-time identity. A reused PID cannot inherit an old
process's CPU or I/O totals. Root exit, unavailable counters, collector failure
or insufficient samples fails the run; unsupported systems fail explicitly.

One persistent PowerShell process queries CIM once per sample. Defaults are a
two-second warmup, thirty measured seconds and one-second sampling; tune with
`--warmup-seconds`, `--duration-seconds` and `--interval-ms` (minimum 250 ms).
Statistics exclude warmup, use actual elapsed time, and include p50/p95/p99/max
for CPU, private committed memory, working set, logical I/O rates, process,
thread and handle counts. Memory and handle growth compare the first and last
measured samples. Raw `samples.jsonl`, `sampler.log` and `report.json` are saved
in a printed temporary directory or explicit `--output` directory. Reports and
samples survive budget violations and root-exit failures; failures exit nonzero.
The report's `collector_source` identifies the sampler checkout, not the source
of an arbitrary attached executable. Record the desktop build separately when
comparing runs.

CPU uses 100% for one fully occupied logical core and can exceed 100%. Divide
by the reported logical CPU count to compare with normalized Task Manager CPU.
Working sets are summed and may double-count shared pages; private bytes are
committed memory, not physical RAM. I/O counters include cached and other
logical transfers and do not establish physical disk throughput. Processes
first seen or lost between samples have incomplete CPU/I/O accounting; reports
retain join/exit counts. Short-lived processes entirely between samples are
unobserved. Use ETW/WPR for attribution, short bursts or exact process churn.
The sampler itself runs outside the desktop tree, but CIM still adds machine
overhead. A short growth measurement does not prove or disprove a memory leak.

`scripts/process-resources.test.ts` covers elapsed-time accounting, PID reuse,
warmup, unavailable metrics and budget boundaries; its Windows integration
case samples a controlled process and verifies saved failure artifacts. Product
CPU or memory improvement claims require actual desktop before/after reports.
