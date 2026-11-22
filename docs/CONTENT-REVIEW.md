# Content review — ASL pack

**Status: NOT YET REVIEWED.** BrowUp teaches grammar of a living language, so no prompt is presented as correct until a Deaf signer or qualified ASL teacher has reviewed it (PLAN adjustment 3). The app refuses a pack without a reviewer; developers can load this draft only with the `--dev-unreviewed` flag, and it is then shown under an **UNREVIEWED** banner.

## For the reviewer

Thank you. BrowUp does **not** judge hand signs — only the facial marker (raised brows, furrowed brows, head shake, nod, topic brows) and whether it is held across the marked signs. Please check, for each prompt:

1. **Gloss** — are these the right signs, in a natural order, for the English meaning?
2. **Marker** — is this the right non-manual marker for the sentence?
3. **Span** — does the bar cover the right signs? (For negation, should it cover the whole sentence or only the negated part?)
4. **Topic split** — for topics and conditionals, is the comment/result starting at the right sign?
5. Anything you would add to **notes** for learners (e.g. regional variation).

Write *OK* or your correction in the last column. Corrections can also be made directly in `content/asl/pack.json` (set `"reviewed": true` per prompt and fill `reviewer` with name, role, date and how you would like to be credited).

Reviewer: ______________________  Role: ______________________  Date: __________  Credit as: ______________________

## Prompts (29)

| ID | Marker | English meaning | Gloss (marked signs in **bold**) | Split | Sources | OK / correction |
| --- | --- | --- | --- | --- | --- | --- |
| yn-01 | y/n | Are you hungry? | **YOU** **HUNGRY** |  | asl-bloom, lifeprint |  |
| yn-02 | y/n | Are you Deaf? | **YOU** **DEAF** |  | lifeprint |  |
| yn-03 | y/n | Are you a student? | **YOU** **STUDENT** |  | lifeprint |  |
| yn-04 | y/n | Do you like coffee? | **YOU** **LIKE** **COFFEE** |  | lifeprint |  |
| yn-05 | y/n | Do you have a car? | **YOU** **HAVE** **CAR** |  | lifeprint |  |
| yn-06 | y/n | Have you eaten? | **YOU** **FINISH** **EAT** |  | lifeprint |  |
| yn-07 | y/n | Is your mother Deaf? | **YOUR** **MOTHER** **DEAF** |  | lifeprint |  |
| yn-08 | y/n | Do you want to go to a movie? | **YOU** **WANT** **GO** **MOVIE** |  | lifeprint |  |
| wh-01 | wh | What is your name? | **YOUR** **NAME** **WHAT** |  | asl-bloom, lifeprint |  |
| wh-02 | wh | Where do you live? | **YOU** **LIVE** **WHERE** |  | lifeprint |  |
| wh-03 | wh | Where are you from? | **YOU** **FROM** **WHERE** |  | lifeprint |  |
| wh-04 | wh | Where is the bathroom? | **BATHROOM** **WHERE** |  | lifeprint |  |
| wh-05 | wh | Why are you learning sign language? | **YOU** **LEARN** **SIGN** **WHY** |  | lifeprint |  |
| wh-06 | wh | Who is your teacher? | **YOUR** **TEACHER** **WHO** |  | lifeprint |  |
| wh-07 | wh | When is your birthday? | **YOUR** **BIRTHDAY** **WHEN** |  | lifeprint |  |
| wh-08 | wh | How many brothers and sisters do you have? | **YOU** **HAVE** **BROTHER** **SISTER** **HOW-MANY** |  | lifeprint |  |
| neg-01 | neg | I'm not hungry. | **ME** **NOT** **HUNGRY** |  | asl-bloom, lifeprint |  |
| neg-02 | neg | I don't understand. | **ME** **NOT** **UNDERSTAND** |  | lifeprint |  |
| neg-03 | neg | I don't like coffee. | **ME** **DON'T-LIKE** **COFFEE** |  | lifeprint |  |
| neg-04 | neg | I'm not tired. | **ME** **NOT** **TIRED** |  | lifeprint |  |
| neg-05 | neg | I'm not going to school tomorrow. | TOMORROW **ME** **NOT** **GO** **SCHOOL** |  | lifeprint |  |
| aff-01 | aff (nod) | Yes, I understand. | **ME** **UNDERSTAND** |  | asl-bloom |  |
| aff-02 | aff (nod) | I really am hungry. | **ME** **HUNGRY** |  | asl-bloom |  |
| aff-03 | aff (nod) | I do like coffee. | **ME** **LIKE** **COFFEE** |  | asl-bloom |  |
| t-01 | t (topic) | Coffee — I like it. | **COFFEE** ME LIKE | comment from ME | asl-bloom, lifeprint |  |
| t-02 | t (topic) | My car — it's red. | **MY** **CAR** RED | comment from RED | lifeprint |  |
| t-03 | t (topic) | The homework — I finished it. | **HOMEWORK** ME FINISH | comment from ME | lifeprint |  |
| c-01 | cond | If it rains, I'll stay home. | **IF** **RAIN** ME STAY HOME | comment from ME | lifeprint |  |
| c-02 | cond | If you're tired, go to bed. | **IF** **YOU** **TIRED** GO-TO-BED | comment from GO-TO-BED | lifeprint |  |

## Sources

- **asl-bloom** — ASL Bloom — Non-manual markers in ASL <https://www.aslbloom.com/blog/non-manual-markers-asl>
- **lifeprint** — Lifeprint ASL University (Bill Vicars) — lessons on questions, negation and topicalisation (pages to be confirmed by the reviewer) <https://www.lifeprint.com/>
- **handspeak** — Handspeak — ASL grammar: non-manual signals (pages to be confirmed by the reviewer) <https://www.handspeak.com/>

Glosses were drafted by the developer from common textbook patterns; the exact source pages are to be confirmed by the reviewer. Until then the README and the DEV post say clearly that the content is unreviewed.

## Accuracy session (optional, with the reviewer)

See [RESULTS.md](RESULTS.md): the reviewer watches 40 productions live (20 correct, 20 deliberately wrong across the four markers) and gives their own verdict; nothing is recorded.
