---
name: owner-interview
description: Use when preparing questions for the owner before the team starts, or deciding whether enough is known to write the brief. Covers researching the industry first, which areas to ask about, phrasing questions that can be answered in a sentence, what never to ask, offering options, probing taste with real reference sites, when to stop, and recording assumptions.
---

# Interviewing the owner

The interview is the one point where asking the owner is the job. Everything the team builds afterwards is aimed by what you learn here, so a careless interview costs the whole run. The owner's time is also the scarcest resource in the system: they will answer a short list of sharp questions well, and a long list of vague ones badly or not at all.

Your output is the intake decision: `understanding`, `ready`, `questions` (each with `id`, `question`, `why`, `options`), and `assumptions`.

## 1. Research before you ask

Do not write a question until you could hold a conversation with someone who works in this industry. Spend real effort here; it is what separates an expert's questions from a form.

- Who buys this kind of product and who uses it day to day. They are often different people.
- The established players, how they describe themselves, and roughly what they charge.
- The vocabulary of the trade. Using the owner's terms correctly earns better answers.
- What usually goes wrong in products like this: the regulations, the integrations everyone needs, the feature that is harder than it looks.
- For an existing product, read the codebase briefing first so you never ask what the code already answers.

Then write `understanding`: three to six sentences, in plain language, saying what you believe the owner wants, for whom, and why. State it as your reading, so the owner can correct it. This paragraph is shown to them before the questions, and a wrong reading corrected here saves more than any single question.

## 2. What to ask about

Cover these areas, but only where the request and your research leave a real gap. Skip an area entirely when you already know the answer or can decide it.

| Area | What you need to learn |
|---|---|
| Business | What the owner's business is, and what this product is for within it |
| Users | Who specifically, what they are trying to get done, what they use today |
| Success | What outcome would make this worth having built, and how it would be measured |
| Competition | Which products the owner sees as rivals, which they admire, and why |
| Look and feel | See section 5 |
| Scope | What must be in the first version, and what is explicitly not |
| Existing material | Brand assets, content, data, accounts, integrations that already exist |
| Constraints | Deadline, budget, compliance, required technology, where it must be hosted |
| The bar | What would make them say "this is extraordinary" rather than "this is fine" |

In the first round ask generously, eight to fifteen questions, because a second round costs the owner another sitting. In later rounds ask only what an earlier answer opened up, at most six.

## 3. How to phrase a question

A good question is specific, about one thing, and answerable in a sentence or two by someone who is not a product manager.

| Instead of | Ask |
|---|---|
| What features do you want? | Should a customer be able to reschedule a booking themselves, or only by contacting staff? |
| Who is your target audience? | Is the person signing up the clinic owner, or the receptionist who will use it every day? |
| What is your budget? | Is there a monthly hosting cost above which this stops making sense for you? |
| Do you have any design preferences? | Name two or three websites or apps, in any industry, whose look you would be proud to be compared with. |
| What are your requirements for security? | Will this hold anything regulated, such as health records or card numbers? |

Rules:

- One decision per question. A question joined with "and" is two questions and gets half an answer.
- Ask about the situation, not the solution. "What happens today when a booking is missed?" tells you more than "do you want reminder emails?"
- Give the reason in `why`, in one line, phrased as what it changes: "Decides whether we need payment processing in the first version." An owner who sees the consequence answers more carefully.
- Order the list so the questions that change the most come first. If the owner stops halfway, you have the important answers.
- Give each question a short stable `id` (`users-buyer`, `scope-payments`) so answers can be traced.

## 4. What never to ask

- Anything you can look up, read in the codebase, or work out.
- Anything a competent product manager would simply decide: field names, page structure, which library, whether to have a settings page.
- The owner to do your job: "what should the product do?", "what are the user stories?", "how should we prioritise?".
- Hypotheticals far from the first version.
- The same thing twice in different words.
- Technical choices, unless the owner has a real constraint. Ask "is there a system this must connect to?" rather than "REST or GraphQL?".
- Leading questions that carry your preferred answer.

## 5. Probing taste

Taste cannot be described in adjectives. "Clean and modern" is what every owner says and it means nothing a designer can act on. Get concrete reference points instead.

- Ask for real sites or products they admire, in any industry, and one thing they like about each.
- Ask for one they find ugly, dated or generic, and what puts them off. Dislikes are often more precise than likes.
- If they named competitors, ask whether they want to look like they belong beside them or clearly apart from them.
- Ask what the product should feel like to its users in the first ten seconds, offering contrasts as options rather than a blank: for example "calm and trustworthy", "fast and expert", "warm and personal".
- Ask whether brand assets already exist (logo, colours, typefaces, photography) and whether they are fixed or open to change.

Quote the owner's answers to these word for word in the brief. The designers work from the exact words.

## 6. Offering options

Put choices in `options` only when a short list really helps: when the realistic answers are few and known, or when the owner may not know what is possible. Otherwise leave the array empty and let them answer freely.

- Two to four options, each a few words, mutually exclusive.
- Include the sensible default first when you have one.
- Do not use options to smuggle in a decision. If you already know the answer, record it as an assumption instead of asking.

## 7. When to stop asking

Set `ready` to true, with an empty `questions` array, when you could write a brief the owner would read and say "yes, that is exactly what I meant". The test is not that nothing is unknown. It is that what remains unknown is yours to decide.

Stop sooner rather than later when:

- the remaining questions would not change what gets built in the first version
- the owner answered the last round tersely or skipped most of it, which means they want you to get on with it
- an answer was "you decide": then decide, and do not ask a narrower version of the same thing

If nobody is available to answer, do not wait. Decide everything, and be thorough in `assumptions`.

## 8. Recording assumptions

Every gap you fill yourself goes in `assumptions`, one per entry, written so the owner can spot a wrong one at a glance: what you assumed and the reason. "First version is English only, because the request mentions only UK customers." An unstated assumption that turns out wrong looks like the team ignoring the owner; a stated one is a decision they had the chance to correct.

Carry the assumptions into the brief under their own heading, each still marked as an assumption. When an answer was skipped, treat it as "you decide" and record the decision the same way.

## Example of one well-formed question

```
id: scope-payments
question: Should customers pay online when they book, or pay at the venue as they do now?
why: Online payment adds a payment provider, refunds and receipts to the first version; paying at the venue does not.
options: ["Pay online at booking", "Pay at the venue", "Either, customer chooses"]
```
