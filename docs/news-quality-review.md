# News quality review protocol

Status: evaluation design, not a completed quality assessment.

Freeze one published snapshot and its `generated_at` timestamp before comparing
rankings. The technical health of the feed is not a measure of editorial quality.
Do not infer political balance from publisher count or use a second Google News
query as independent evidence that no important story was omitted.

## Fixed sample

Review the top ten results for Taiwan, Japan, California, Canada, the United
Kingdom, France, and one lower-volume country (Iceland). Include Tokyo and Osaka
when evaluating regional differentiation. Evaluate ordinary and keyword modes
separately, and record the original keyword, actual search term, edition, and
whether the response was cached or stale.

## Per-item review

Record title, URL, publisher, publication time, selected geography, and event ID.
Score geographic relevance 0–2, topic relevance 0–2, and usefulness 0–2. Flag
outdated items, duplicate events, press releases/advertising, unsupported headline
claims, and local-versus-foreign coverage. Similar stories syndicated by several
publishers are one event, not evidence of independent source diversity.

## Missing-event review

Before looking at the aggregator's ordering, assemble 3–5 important events for
each sample location from independent local reporting across editorial positions
and, when appropriate, official primary records. Record why each event matters,
the time window, and reference links. Then check whether each event is present in
the top ten. Separate omission by the upstream candidate pool from omission by
our ranking. An absent event is not automatically proof of intentional bias.

## Report

Report the number of independently checked items and locations; relevance,
freshness, event duplication, publisher concentration, and reference-event
coverage; specific misses; and uncertain judgments. Keep subjective editorial
judgments separate from mechanically counted properties. Do not publish an
unsupported single "quality score" or claim comprehensive coverage of all countries.
