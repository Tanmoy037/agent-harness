---
name: capacity-and-scalability
description: Use when designing or reviewing an architecture and you need load and capacity estimates, performance budgets tied to the PRD's numbers, an analysis of what breaks first, or the scalability path at one, ten and a hundred times the load. Also use to decide what scaling work not to do yet.
---

# Capacity and scalability

An architecture without numbers is either too small for the product or far larger than it needs. A few lines of arithmetic settle most scaling questions before any code exists. The aim is a design that carries the expected load with margin, a known first point of failure, and a written path for growth that nobody builds until a measured trigger says to.

## 1. Get the load from the PRD

Collect, or derive, these inputs:

- active users per day and in total; for business products, accounts and users per account;
- the main actions and how many of each a user performs per day;
- data created per action (rows, bytes, files);
- when usage happens (spread over the day, or concentrated in working hours or events);
- growth the PRD expects over one and three years;
- the PRD's quality numbers: response times, page load targets, availability, job completion times.

When the PRD gives no number, do not leave a blank. Choose a defensible assumption, label it as an assumption in the architecture, and raise it in your report as a question for the boss. An explicit wrong assumption gets corrected; a silent one does not.

## 2. Do the arithmetic

Show the working in the architecture document so others can check and update it.

| Quantity | How to estimate |
|---|---|
| Average requests per second | daily users × actions per user × requests per action ÷ 86,400 |
| Peak requests per second | average × peak factor |
| Concurrent connections | peak requests per second × average response time in seconds; add long-lived connections (websockets, streams) one per connected user |
| Storage per year | daily actions × bytes per action × 365, plus indexes and backups |
| Read to write ratio | from the action list; it decides caching and replica choices |
| Background work | jobs per day × duration, to give worker-hours per day |

Useful facts: a day has 86,400 seconds, so one request per second is about 86,000 a day and 2.6 million a month. If all usage falls inside an eight-hour working day in one time zone, the rate during those hours is three times the 24-hour average before any spikes. Choose the peak factor from how the product is used (a daily deadline, a marketing send, a start-of-shift login wave) and state the reasoning; where the existing product has traffic data, use the measured peak instead.

**Example.** 20,000 daily users × 30 actions × 4 requests per action = 2.4 million requests a day, an average of about 28 per second. Used in working hours only: about 83 per second. With a start-of-day wave of three times that: 250 per second at peak. Each action writes about 2 KB: 600,000 actions a day × 2 KB × 365 is about 440 GB a year before indexes. That is one well-indexed relational database and a few stateless application instances, not a distributed system.

## 3. Give every request a budget

Take the PRD's response-time target (use the 95th percentile, not the average, because the slow requests are what users remember) and divide it among the hops: network and TLS, edge or load balancer, application code, each database query, each external call, rendering. Write the budget as a table. It tells engineers how many queries a request may make and tells you immediately when a design cannot meet the target, for example a 300 ms target with two sequential calls to an external service that takes 200 ms each.

Do the same for pages (weight, time to main content on a mid-range phone) and for jobs (time from enqueue to done).

## 4. Find what breaks first

List every resource with a limit and compute the load at which the design reaches it. Check each of these:

- **Database connections**: pool size × application instances against the database's connection limit. Serverless functions multiply this.
- **The single writer**: write rate against what one primary can take; long transactions and lock contention on hot rows.
- **Queries that grow with the table**: missing indexes, unbounded lists, counting rows on every page load, N+1 query patterns.
- **Memory per request**: loading whole files or result sets into memory.
- **Platform limits**: function timeout and concurrency, cold starts, request body size, plan quotas. Check the vendor's current limits page; plans change.
- **Third-party rate limits and quotas**: payment, email, maps, model APIs. Compare with the peak, not the average.
- **Fan-out**: one action that triggers work per follower, per member or per subscriber.
- **Scheduled jobs that scan everything**: fine at launch, the first thing to exceed its window later.
- **Queues**: arrival rate against processing rate; what happens to the backlog after an outage.
- **File and object storage, bandwidth and egress cost.**

Order them by the load at which each fails. The first on the list is the design's real capacity, and the architecture must say what it is.

## 5. Write the 1x, 10x, 100x path

| | Launch load (1x) | 10x | 100x |
|---|---|---|---|
| What holds | | | |
| What breaks first | | | |
| Change needed | | | |
| Trigger to act | a measured value, such as database CPU or p95 latency sustained above a threshold | | |

Typically the step to ten times is configuration and tuning: indexes, a cache in front of hot reads, a larger instance, a read replica, moving slow work to a queue. The step to a hundred times is structural: partitioning data, splitting a service, changing a synchronous flow to asynchronous. Record both, build neither. The value of the table is that the trigger and the next move are already agreed when the trigger fires.

## 6. Keep the door open cheaply

These cost almost nothing at the start and remove most future rewrites, so build them in from the first task:

- stateless application processes, with state in the database, cache or object storage;
- pagination on every list endpoint and a bound on every query;
- indexes for the queries the screens actually make;
- a timeout on every external call, with retries that back off, and idempotent handlers so retries are safe;
- anything slower than the request budget moved to a background job;
- limits and sizes in configuration, not in code;
- measurement from day one: request rate, latency percentiles, error rate, database time, queue depth.

## 7. What not to build early

Unless the arithmetic in step 2 demands it at launch load with margin, do not build: microservices, sharding, multi-region deployment, a message bus between components that could call each other, a caching layer in front of queries that are already fast, custom autoscaling, or event sourcing. Each adds failure modes and operational work from the first day in exchange for capacity the product may never need. State in the architecture that these were considered and deferred, with the trigger that would bring them back.

## 8. Verify

- Check limits and prices on the vendors' current documentation, not from memory.
- Where the product exists, measure instead of estimating: slow-query logs, current peak traffic, table sizes.
- Specify the load test that will prove the budget: tool, scenario (the main user journey at peak rate for a sustained period), pass criteria from the PRD. Hand it to QA through the test strategy.

## Output

A "Capacity and scalability" section in `engineering/architecture.md` in the Team documents folder containing: the inputs and assumptions, the arithmetic, the request and page budgets, the ordered list of limits, the 1x, 10x, 100x table, the early safeguards, the deferred items with their triggers, and how the budgets will be measured. Raise as findings any PRD number that the chosen platform or budget cannot meet.
