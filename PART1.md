# Most significant technical achievement

**Elliot Little · Orbital, Part 1**

A model that can solve an A-Level mechanics question is a solved problem. Getting one to hold that
answer back from a sixteen-year-old who has asked for it four times, walk them to it a step at a
time, then mark their working the way an Edexcel examiner would, is a different piece of
engineering. That was the Zero Gravity AI STEM tutor. I led it, and built the eval harness and the
safeguarding classifier myself.

## The problem and its context

Zero Gravity's users are students from low-income backgrounds aiming at selective universities, who
need grades they can't buy tutoring for. The job was narrow on purpose: unstick a student on a dense
exam question, show the method, then hand back similar questions so they can prove they can do it
alone.

We were selling into a market that had already decided what AI in a classroom meant, because
students were using ChatGPT to do their homework and teachers knew it, so every tool that walked
into a school carried that reputation in with it. A lot of the teachers we spoke to also thought the
technology was coming for their job. The pitch, then, was a tool that deliberately put work between
a student and the answer, sold to people who assumed AI existed to remove exactly that and suspected
it of replacing them while they listened. Teachers came round when they watched the tutor make their
students better at the thing they were in the room to teach, with themselves still judging whether
it had worked.

The tutor does get you to the answer, it just doesn't lead with it: a Socratic sequence works out
what the student already understands, moves them through the steps, and the answer lands at the end.
Lead with it and you get a student who feels fine right up until the exam.

Marking was the harder half, because exam boards mark method and the same working earns different
marks under AQA and Edexcel, so a tutor marking against the model's general sense of correct maths
teaches a method that loses marks in the room. Everything it produced looked right, which counts for
nothing when a mark scheme decides.

## Complexity and constraints

Earning trust cost more than building the thing. I spent much of the build in interviews with
teachers and students rather than in the repo, and demos didn't land: what teachers asked to see was
the evals, the safeguarding rules, the red-teaming, and how the thing behaved when someone pushed
it. We had to pass trials at Harris Academy before getting the rest of the group, and the government
assessment worked the same way against DfE's Generative AI Product Safety Standards. Both were
technical audits run by people who weren't engineers, so the internals had to be explainable as well
as correct.

The model also fights you on the core constraint, since everything in its training pushes it toward
being helpful, and it never capitulated cleanly, it capitulated in degrees. What surprised me was
where. Leaks clustered on our most engaged students, the ones asking good follow-up questions,
rather than on the answer-seekers we'd designed the guardrails around.

Then the constraints that don't move. UK safeguarding has a named process and a named person, and
both directions fail: miss a real disclosure, or page the Designated Safeguarding Lead so often they
stop reading. Five of us at kickoff and six engineers after launch, pre-revenue, with inference cost
inside the unit economics against a price ceiling teachers named in the first discovery call.

## Approach

We built agent-first from the first commit, which moved the bottleneck without removing it: Claude
Code and Cursor from day one, PR-review agents gating merges, Rails 8 with Hotwire Native so iOS,
Android and web shipped from one codebase. Directing the agents turned out to be the easy part.
What got scarce was having a standard to hold the output against, so I spent most of my own build
time on measurement.

Withholding an answer is only defensible if the steps you offer instead are the right ones for that
student, so the tutor infers someone's level from how they answer, moves them a step at a time, and
remembers what they struggled with before so it isn't rediagnosing every session. Coaching, practice
and marking then ran as three agents rather than one switching modes, which is cheaper and what I'd
have built a year earlier. Coaching has to withhold an answer it knows until a condition is met
while marking states the mark scheme's answer outright, and one prompt holding both leaks.

That hold was the hardest thing in the build, because the failure isn't binary. A leaking model
doesn't hand over the answer, it concedes a little more each turn under pressure, so a pass/fail
check on whether it stated the answer catches almost none of it and the prompt work turns into
argument about tone. What fixed it was making the failure rankable: a second model scoring every
live coaching session against the Socratic rubric, blind to which student it was reading, which
gave me an ordered list of the worst sessions every morning instead of opinions. Adherence went
from 33% to 65% in a fortnight, and the same pattern runs through everything I built here, since
Claude wrote most of the implementation and my job was deciding what it would be measured against.

The eval harness gated releases on the same principle. I built a curriculum taxonomy across eight
exam boards and embedded past papers, mark schemes and examiner reports so retrieval pulled from
real assessment material instead of the model's memory of GCSE physics, then hand-built ground truth
from official papers, scored every answer against it, and blocked anything below the bar. Marking
accuracy went from 67% on the bare model to 99%, and where the remaining error sat was the most
useful thing the project produced: on questions the corpus didn't cover. The model could reason
perfectly well, it just hadn't seen the question, so the roadmap became ingestion work instead of
prompt tuning. That was also a bet on where models were going, since prompt scaffolding gets
obsoleted by the next release while the corpus, the taxonomy and the eval set survive it. The
harness became the sales asset too, since it was the artefact teachers and the assessors actually
wanted to look at.

For safeguarding I built moderation to over-escalate, ran it ten weeks, then pulled the case data:
fifteen cases had reached a human and fourteen were false alarms. Splitting conduct concerns from
genuine disclosures brought the DSL's load to roughly 3% of flags. Explanation and coaching move are
inferred; whether a disclosure reaches a human, whether a build ships, and what a mark scheme says
are gates in code, and deciding where that line falls was an architecture decision I'd make the same
way again.

The school hub was our B2B surface, and it was only sellable because the trust underneath it was
already proven. Teachers had spent the trials asking to see inside the box, so the hub opened it,
with analytics on how their classes were actually using the tutor and tools that cut time out of
their own workflows. It sealed the DSIT deal.

Claude Code wrote most of the code. The engineers directed and reviewed it and own those outcomes;
mine was the what, the why, the sequence and the evidence it got built against, along with 28% of
the commits across Ruby, JS, migrations, system prompts, infra and native mobile UX. I set how the
squad worked with agents and ran the model research that kept it current, while holding the product
seat.

## Impact

- **2nd nationally in the government's AI Tutoring Tools Pioneer Programme**, run by DSIT and DfE,
  in a cohort of eight that included frontier US labs and the largest UK curriculum incumbents. We
  were the smallest in it.
- **Passed the Harris Academy trials**, which unlocked the rest of the schools.
- **20,000 students and 3,000 to 4,000 conversations a day** by the time I left, holding 45% WAU/MAU
  across two quarters, on a product that makes students work before it helps them. 45 days from
  first commit to App Store, with paid school partnerships in the same window.
- **Marking accuracy from 67% on the bare model to 99%**, with the residual error sitting on
  questions the corpus didn't cover.
- **Safeguarding escalations to the DSL down to roughly 3% of flags**, from fourteen false alarms in
  the first fifteen cases.

## Reflection

Going B2C first controlled scope and I'd do it again, because it let us concentrate on model
accuracy before a school's requirements landed on top of that. Activation direct to students sat at
24% and reached 79% through schools with a referral system we built, and the school channel is what
established the trust everything commercial then rested on, which counted for more than I'd
expected going in.

What I'd change is the speed. I held the beta back because the users were children and I wanted the
marking and the safeguarding right before any of them saw it, which was the correct instinct
applied far too widely. Onboarding, pricing, whether a student came back a second time: none of
that needed the same bar, and those were the assumptions I was least sure about. We could have been
testing them weeks earlier against a lot more people.

The other one is about the people doing the work. By the end, everyone on the squad had landed
somewhere different on what agents meant for their own job, some excited by it and some threatened,
and their day-to-day practices had drifted apart without anyone really tracking it. We got in a
room about that near the end and it was one of the more useful conversations of the project. Ways
of working should have been a standing item alongside the product retros from week one.
