# The Gateless Gate — Style Sheet

Decisions for the 2026 edition. The book is finished; this is the record of how,
and what to check if it is ever edited again.

---

## 0. Formatting — read this before editing

`gatelessgate.md` is auto-converted to JS by `scripts/build-text.js`, and each `###`
section is baked to a narration file. Formatting is load-bearing, not cosmetic.

- **`##` opens a page. `###` opens a section.** The nine section names in use are
  `The Case`, `Mumon's Comment`, `The Verse`, `Mumon's Preface`, `Amban's Comment`,
  `Mumon's Afterword`, `Colophon`, `Zen Warnings`, `Amban's Letter`. Matched exactly.
  Renaming one fails the build.
- **Exactly one blank line between blocks.** A blank line is a paragraph or stanza
  break, so a doubled one is a real change. *(A scripted edit once introduced 51 of
  these at a stroke. Check after any bulk pass.)*
- **One trailing newline.** No trailing whitespace anywhere.
- **Prose paragraphs are one long line** and rely on soft wrap. Line breaks inside a
  verse are the verse.
- **No bold or italics beyond what is already there.** Book titles other than this one
  take quotes: `"Zen Flesh, Zen Bones"`, `'Diamond Sutra'` (single, inside dialogue).
- **No em dashes or en dashes** in the book. Colons, commas, parentheses, periods.
  Two em dashes remain inside the HTML build comment, which no reader sees.

**Three `##` page titles changed in the 2026 pass** and may need narration keys
rebuilt or mp3s renamed:

| Case | Was | Now |
|---|---|---|
| 20 | The Enlightened Man | The Enlightened Person |
| 22 | Kashapa's Preaching Sign | Mahakashapa's Preaching Sign |
| 37 | A Buffalo Passes Through the Enclosure | A Buffalo Passes Through the Gate |

**Verify after any bulk edit:** 51 `##` pages · 154 `###` sections · every `The Verse`
exactly 4 lines · no consecutive blank lines · no trailing whitespace · one trailing
newline · no dashes.

---

## 1. Names

Chinese and Japanese Zen figures take **Japanese readings** — that is how Senzaki
received the text, and this is a Japanese-lineage Mumonkan. Indian figures keep
**Sanskrit** forms.

- Joshu, Hyakujo, Ummon, Nansen, Baso, Tokusan, Mumon, Goso, Gensha, Hakuun, Nata, Yogi
- Buddha, Bodhidharma, Ananda, Manjusri, Maitreya, Shakyamuni, Mahakashapa
- **No macrons** (Ryusho, not Ryūshō). **No decorative hyphens** (Mumon, Mahakashapa,
  Emyo, Momyo).
- `Mumonkan` must survive any `Mumon` sweep intact.
- **Bibliographic citations keep the Chinese** — `Wumen Huikai's Chinese of 1228`,
  `the Taishō canon (CBETA T48n2005)`. The provenance section states this policy so it
  reads as deliberate, and names Mumon Ekai so the colophon signature connects.

**Resolved collisions:**
- `Kashapa` now belongs **only** to the Kashapa Buddha (case 2, a past buddha).
  Ananda's colleague is **Mahakashapa** everywhere, including case 22's title.
- **Goso** and *Hoen* were the same man (五祖法演). Now Goso throughout.
- **Seijo** is genuinely two people — the master in case 9, the girl in case 35.
  Inherited, correct, left alone.

---

## 2. Register

American spelling. The test that matters most: **does the modern connotation point
the wrong way?** Worse than datedness, because the reader never notices being misled.

| Was | Read as | Now |
|---|---|---|
| all-round man | generalist | anyone who has been all the way through |
| the outsider's road | admirable rebel | off the road altogether |
| dumb man | stupid | a man who cannot speak |
| Hindu (of Bodhidharma) | factually wrong | foreigner |
| the chatterbox (case 40) | a person — there was none | cutting off all the talk |

**Repeated words vary by context.** A word is chosen for its sentence, not matched to
its earlier self. *Emancipated* → **free / set free / freeing / fully free /
enlightened**. *Intimately* → **fully / thoroughly / to the point / deeply**.
*Surpass* → **match / equal / go beyond / get ahead of**.

**But repetition doing work stays.** Case 28's verse repeats *surpass* on purpose —
the line turns around and walks back, and that chiasmus is the poem.

---

## 3. Person and gender

**Generic `he` → `you`.** Not primarily a gender fix: Mumon's commentaries are aimed
at the reader, and the third person was holding the reader at arm's length, working
against the koan. The front matter discloses this.

- Real people keep their pronouns. Generic nouns go neutral (**the enlightened
  person**). Specific or indefinite people keep *man* (Joshu, the man at the gate, the
  man in the tree, the man selling fried cakes). Technical terms stay (*the true man*,
  真人).
- **Where "you" would change the question, don't force it.** Case 2 asks about a
  *category*. Case 9's comment is a maxim, so it went plural.
- **Watch for orphaned pronouns.** Neutralizing a noun strands trailing `his`/`himself`
  — case 20 needed *their feet*, *themselves*, and *its head*.

---

## 4. Verses

- **Case capping verses: four lines.** All 49.
- **Sentence case.** Capital only after `.` `?` `!` or on a proper noun. A colon does
  not start a new sentence.
- **Other verse forms keep their own shape** — the Zen Warnings couplets stay couplets.
- **Balance the lines.** 16/15/11/5 words is compliant and still wrong.

---

## 5. Vocabulary

| Out | In |
|---|---|
| emancipated | free / set free / freeing / enlightened (per context) |
| abstruse · illumined · grievous | deep · enlightened · serious |
| decrepit · indolent · discernment | old · lazy · insight |
| precipice · eloquence · ineffable | cliff · the cleverest talk · subtle |
| the four gratifications | the four debts of gratitude (四恩) |
| transient lodging house · perspiration · assemblage | inn · sweat · assembly |
| subjectivity and objectivity | inside and outside (内外) |
| discontinuation | break |
| perception/nonperception world; cognition, noncognition | knowing / not-knowing; a delusion, blankness |
| affirmation and negation | yes and no |
| country dub · dunce · uppercut | a farm boy · fool · a punch in the jaw |
| church-goer · loot · chatterbox | pilgrim · stolen goods · talk / never stopped talking |
| Devas · the clinger · fox-like · nut shell | humans and gods · the one who clings · a fox · shell |
| tile-shards | a piece of broken tile (keep *broken* — the point is disposability) |
| stride of Dharma | gate of Dharma (法門 is a gate, and it echoes the title) |
| Grdhrakuta | Vulture Peak (which is what it means) |
| the Chinese god who pushed aside a mountain | a god once split a mountain with one hand |

**Kept on purpose:** "Dried Dung" (case 21 — 乾屎橛 is a shit-stick and most modern
translations restore it; kept, and the artwork depends on it) · Reps's Americana that
still lands (*city slicker*, *turned the tables*, *overplayed his hand*, *sold dog meat
under the sign of mutton* — a real Chinese idiom, 掛羊頭賣狗肉) · "the crooked Zen of
silent illumination" · "a board around your neck" (a cangue).

**關 renders two ways, on purpose.** *Barrier* for the single obstacle you break
through (case 1's 祖師關, the preface, the afterword). *Gate* for checkpoints you pass
in sequence (case 47's three). Case 37's buffalo goes through a **gate** — a
substitution, not a restoration; the Chinese is a window lattice (窗櫺), but the
enclosure version had no aperture at all and the koan needs one.

---

## 6. Known losses, documented

- **Case 17's fourth line** — 赤腳上刀山, "climb the sword mountain barefoot," flattened
  by the 1934 English to "you will be in trouble too."
- **Case 37** — the window lattice, replaced by a gate (above).
- **Case 24's title** matches case 32's wording better than its own case. Kept because
  the titles are what readers recognize.

**Recovered:** case 29's third negation. Mumon negates the patriarch's own answer —
不是心動, *not the mind moving either* — which the 1934 English had turned into an
affirmation, collapsing the comment into a restatement.

---

## 7. Narration notes

The front matter (markdown link, `CBETA T48n2005`, `©`, `CC BY-NC-ND 4.0`,
`NOTICE.md`, emphasis asterisks) sits under **no `###` heading**, so it is not
narrated. Do not feed it to TTS without stripping it.

The narrated body is **pure ASCII** — straight quotes, no curly quotes, no ellipses.
Only two non-ASCII characters exist, both in front matter (`Taishō`, `©`).

- **Audition `Zen Warnings` first.** Its eleven couplets depend on the line break after
  each colon. If the engine does not pause there, the section becomes a stream of
  contradictory fragments.
- **`108,000` (case 25)** is the only comma-grouped numeral in a book that otherwise
  spells every quantity out.
- **`1228` in the colophon** follows a comma and may be read "one thousand two hundred
  twenty-eight" rather than "twelve twenty-eight."
- Homographs to spot-check: *read* (case 28, past tense), *close* (case 18, adjective),
  *tears* (case 5), *bow* (case 45, the weapon), *minute* (case 18, the noun).

---

## 8. Still open

- **Case 46's verse** — the closing line is currently *"like the blind leading the
  blind."* A period instead of *like* would make it the standalone verdict it is in
  the Chinese (一盲引眾盲, its own line).
- **Zen Warnings, last two lines** — *"how do you actually walk **it**?"* and *"don't
  leave **the damage**"* both use referents the section never names.