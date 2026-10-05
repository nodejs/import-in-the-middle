# Pull request benchmarks

Run `npm run benchmark -- --help` for the command-line options. Without a base
directory, the command compares the current revision with itself to check noise.
Both revisions use the same fixture and dependency installation.
CI compares the base with GitHub's merged PR revision. This includes current
base changes when the contributor's branch is older. Reports retain the base,
PR head, and measured merge revisions so the comparison can be reproduced.

Each sample starts a new Node.js process. The fixture records elapsed time when
its imports and behavior checks complete. Process teardown is outside that
measurement. CPU time is retained as a diagnostic and includes loader-worker
CPU use. It does not include time spent waiting for a worker response.

The small graph exposes fixed loader startup costs. The dependency graph uses
the pinned date-fns development dependency and a CommonJS module. It exercises
package resolution, many ESM exports, and CommonJS interoperability. These are
loader workloads, not application request-throughput measurements.

The driver warms the filesystem cache, starts each base/head pair consecutively,
and alternates their order. It disables compilation caching. Independent trials
retain every sample, including slow samples. The reported change is the mean of
the trial estimates. Each trial estimate is the median of its paired head/base
duration ratios. This preserves the pairing when scheduling delays change over time.
CI pins both revisions and their loader workers to the same allowed CPU. This
controls CPU migration and measures startup under a single-core constraint.
Noisy scenarios receive one bounded extension of the same trials. The original
observations remain in the result. An explicit sample count disables this
extension. The spread is descriptive; the report does not claim a formal
significance test after adaptive sampling.

The median measures typical startup and limits the effect of isolated scheduling
delays. It can miss a regression affecting only occasional starts. The report
also shows raw means, standard deviations, and p95 durations to expose those costs.
Trial CV is the standard deviation of the paired median ratios divided by their mean.
The report labels a row unstable when its trial CV exceeds the implemented
stability threshold. Base and head columns also show the raw startup standard
deviation. A stable ratio does not mean that individual startup samples have
low variation. Use repeated self-comparisons to check reproducibility on the
machine that will run the benchmark.

The baseline is the test merge's first parent. Pull request payloads can retain
an older base SHA after the target branch advances. The publisher verifies both
merge parents against the measured baseline and PR head.

PR execution produces artifacts with read-only permissions. A separate workflow
loads reporting code from the default branch, validates the artifact's source
and samples, and computes its own statistics before updating the bot comment.
The PR controls benchmark execution. Artifact validation does not attest to the
accuracy of its timings.
