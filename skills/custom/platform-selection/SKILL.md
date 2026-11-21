---
name: platform-selection
description: Use when deciding where a product should run or whether to change hosting, before writing a deployment plan. A vendor-neutral method for choosing among Vercel, Railway, Render, Fly.io, Netlify, Cloudflare, container platforms on AWS, Google Cloud or Azure, and Kubernetes, based on the workload, with pricing and limits checked on the vendors' own pages.
---

# Choosing where a product runs

Every vendor's own skill and documentation recommends that vendor. This skill exists so the choice is made from the product's needs first, and the vendor material is consulted afterwards to confirm facts.

The default bias is toward the least operational burden that meets the requirements. A small team with a conventional web product should not be running a cluster. The reverse error is also real: picking the easiest platform and discovering later that it cannot run a long job, hold a connection open, or keep data in the required region.

For an existing product, the starting assumption is that it stays where it is. Propose a move only when a stated requirement cannot be met on the current platform, and cost the migration honestly.

## 1. Classify the workload

Answer these from the architecture and the requirements before naming any platform. Write the answers at the top of the deployment plan.

| Question | Why it decides things |
|---|---|
| What are the runtime units? Static assets, server-rendered pages, an API, background workers, scheduled jobs, long-running processes, WebSocket or streaming connections | Function-based platforms suit request and response work and constrain long-lived processes and connections |
| How long does the longest request or job run, and how much memory does it need? | Serverless execution has duration and memory ceilings |
| Is the server stateless? Does anything need local disk that survives a restart? | Persistent volumes exist on some platforms and not others |
| Which data stores, and who operates them? Relational database, cache, queue, object storage, search, vector store | Managed add-ons differ; an external managed database adds network latency and egress |
| What is the traffic shape? Steady, spiky, idle most of the day, global or one region | Scale-to-zero saves money for idle workloads and costs cold starts; always-on suits steady load |
| Where must data live, and what compliance applies? | Region availability and certifications eliminate options outright |
| What must be private? Internal services, database not on the public internet, outbound traffic from fixed addresses | Private networking varies widely |
| Which runtime and system dependencies? Language version, native libraries, a browser, GPU | A custom container is needed when the platform's built-in runtime lacks them |
| Who operates it, and how many hours a month can they give it? | The honest answer usually rules out self-managed orchestration |
| What is the monthly budget at launch, and at ten times the load? | Sets the ceiling and exposes pricing cliffs |
| Does the team need a preview environment per change? | First-class on some platforms, build-it-yourself on others |

## 2. Apply the eliminating questions

These remove options before any scoring. An option that fails one is out, however well it scores elsewhere.

1. Is there a region that satisfies the data-residency requirement?
2. Can it run the longest job and the largest memory footprint within its limits?
3. Can it hold the connections the product needs (WebSockets, streaming, long polling) for as long as needed?
4. Can it run the required runtime and native dependencies?
5. Can the database be kept off the public internet, if that is required?
6. Does it hold the compliance attestations the owner's customers will ask for?
7. Is the cost at ten times the load within what the product could plausibly earn?
8. Can the people available actually operate it?

## 3. The families, and what each is good at

Treat these as tendencies to verify, not facts to quote. Platforms change their capabilities often, and a limit you remember may have moved.

| Family | Examples | Fits | Watch for |
|---|---|---|---|
| Frontend and function platforms | Vercel, Netlify | Sites and applications built on a supported web framework, with per-change previews and little operations work | Execution limits on functions, long-lived connections, background work, cost of bandwidth and function time at scale, framework coupling |
| Edge runtimes | Cloudflare Workers and Pages | Globally distributed request handling, low latency, static and light dynamic work | A runtime that is not a full server environment, so some libraries and native modules do not run; data must use the platform's stores or reach out to an external one |
| Application platforms | Railway, Render, Fly.io | Long-running services, workers, scheduled jobs and managed databases together, deployed from a repository or a container | Region coverage, database durability and backup guarantees, scaling limits, how much of the network is private |
| Managed containers on a major cloud | AWS, Google Cloud and Azure container services | Products needing the cloud's surrounding services, private networking, fine-grained access control, or compliance posture | Considerably more configuration, identity and network setup; cost is harder to predict |
| Kubernetes | Managed clusters on any cloud | Many services, an existing platform team, portability requirements | Operational load. Choose it only when the team already runs it or a requirement demands it |

Combining two is common and often right: static and edge delivery on one platform, the API and workers on an application platform, the database on a specialist managed service. Each added vendor adds a bill, a failure mode and a set of credentials, so combine only when one platform cannot do the job.

## 4. Verify current facts on the vendors' own pages

Do not state a price, a limit or a region list from memory. For each surviving option, open the vendor's current pricing page, limits or quotas page, and regions page, and record what you find with the URL and the date. Check specifically:

- the plan the product would actually need, and what forces an upgrade to the next one
- execution duration, memory, payload and concurrency limits
- bandwidth and egress pricing, and build-minute or seat charges
- database storage, connection and backup terms
- which features are generally available and which are in preview or beta: do not build a production plan on a preview feature
- the service-level commitment on the plan being considered, if any

Then estimate cost for two scenarios, launch and ten times launch, showing the arithmetic and the assumptions (requests, compute time, data stored, data transferred, seats). An estimate without its inputs cannot be checked.

## 5. Compare the survivors

Score only the options that passed section 2. Weight the criteria for this product and say what the weights are.

| Criterion | What good looks like |
|---|---|
| Fit to workload | Runs every runtime unit without workarounds |
| Operational burden | Hours a month the team must spend keeping it healthy |
| Delivery experience | Previews, rollbacks, logs and environment management out of the box |
| Data | Managed stores with backups and point-in-time restore, in the right region |
| Security | Private networking, secrets management, access control, audit trail |
| Observability | Logs, metrics and traces available or easily exported |
| Cost at launch and at ten times load | From section 4, with the pricing cliff identified |
| Headroom | What breaks first as load grows, and what the next step would be |
| Exit cost | See below |

**Exit cost** is what it would take to leave: which parts of the code and configuration are specific to this platform (proprietary runtime APIs, platform-only data stores, framework features that only work there), how the data would be exported, and roughly how many days of work a move would be. A product packaged as a standard container with a standard database has a low exit cost almost anywhere.

## 6. The recommendation

Write it in the deployment plan in this form, deciding rather than listing options:

```
## Platform decision
Workload: <the classification in three or four lines>
Eliminated: <option> because <requirement it fails>; ...
Recommended: <platform or combination>
  Why: <the three reasons that decided it, tied to requirements>
  What the owner must provide: <accounts, plan, payment method, domain access>
  Cost: <launch> / <ten times>, with inputs; pricing checked <date>, <URLs>
  First thing that breaks under growth: <what>, and the response
  Exit cost: <what is platform-specific; days to move>
Runner-up: <platform>
  Why it lost: <the specific difference>
  When to revisit: <the condition that would make it the better choice>
Not determined: <facts you could not verify>
```

Do not create accounts, start trials or provision anything while choosing. Those are go-live actions and need the approval the run's mode requires.
