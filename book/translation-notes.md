# The Gateless Gate — editorial and translation notes

> **What this is.** The record behind the 2026 edition. It covers three separate
> pieces of work:
>
> **Part One — new translations.** The front and back matter, translated from the
> Chinese of CBETA/Taishō T48n2005: the exact page and line spans, what each choice
> was, and what is still unresolved.
>
> **Part Two — the edit of the forty-nine cases.** The 1934 Senzaki/Reps English,
> modernised throughout in August 2026. The earlier version of this file said "none
> of the cases is touched here." That is no longer true of the edition, and Part Two
> is what changed.
>
> **Part Three — the verification of the forty-nine cases.** Every case checked line
> by line against the Chinese, August 2026: the errors repaired (each recorded with
> its Taishō line), the disputable calls flagged for a ruling, and Reps's readings
> that diverge by choice documented. Part Two's §7 said the edit reached the Chinese
> in two places; Part Three is where that count stopped being two.
>
> Nothing builds from this file. It does not ship with the book.
>
> The four pieces that ship — Mumon's preface, his afterword, the Zen Warnings and
> Amban's letter — have their English in [gateless-gate.md](gateless-gate.md), which
> is the source the book is built from; here they carry a pointer instead, so no
> English word has two homes. The seven pieces that do NOT ship keep their English
> in full below. This is the only place they exist.
>
> **One editorial drop, recorded here because nowhere else holds it.** Mumon points
> at his own verse twice in running prose — "The verse:" closing the preface, and
> "…you have let yourself down. As the lines have it:" closing the afterword. Neither
> is carried into the book: a **The Verse** heading stands where they stood and says
> the same thing, and leaving both would have the page announce the verse twice. The
> phrases are translated, they are Mumon's, and they are written out here so that
> deleting the working drafts did not delete them.
>
> **The collation against a non-CBETA witness has been performed** (20 August 2026),
> after a month of being the one thing this file said still wanted doing. The witness
> is independent of CBETA and its lineage is unstated; it confirms four of CBETA's
> eight emendations and leaves three unsupported, including the camel in case 48.
> See "The collation, finally performed" below.

Translations prepared 27 July 2026. Cases edited and the whole book brought into one
register, 11 August 2026. The forty-nine cases verified against the Chinese and the
errors repaired, 20 August 2026.

---
---

# PART ONE — THE NEW TRANSLATIONS

The 1934 Senzaki/Reps rendering carries only the forty-eight cases and Amban's
forty-ninth. Everything in Part One is the material that wraps them in the Chinese
original.

**A correction to what this file used to claim.** An earlier draft said this material
"has never appeared in our edition," which was true, but the book's front matter went
further and said it appears "in no earlier English edition of the Mumonkan." That is
false: Blyth, Shibayama, Sekida and Aitken all carry this apparatus, and an English
"Zen Warnings" is in open circulation. The claim now made is only what is true — that
these are new translations made for this edition, and that the 1934 text it rests on
carries none of them.

⚑ **And this file was wrong about its own fix until 20 August 2026.** The paragraph above
said "the front matter now claims only what is true," and the book's front matter did
carry the safe wording — but the false claim was still shipping in **five other places**
that nobody went back for: the About panel's Rights section, the header the book builder
writes into `THE-GATELESS-GATE.md`, `README.md`, and `NOTICE.md`, where it sat inside a
rights statement. An outside reader of the book flagged it, which is how it was found.
All five now carry the true claim. **The lesson is worth more than the fix: a claim
corrected in the source it was noticed in is not corrected in the product.** When a
factual assertion about the edition changes, grep every surface that repeats it —
`book/gateless-gate.md`, `src/ui/about_state.js`, `scripts/lib/book-md.js`, `README.md`,
`NOTICE.md` — because four of those five are outside the book file and no test covers
their content.

---

## Source

All Chinese below is from **CBETA / Taishō T48n2005 無門關**, traditional characters,
CBETA's punctuation retained except where noted.

- Text: CBETA TEI P5 XML, `T/T48/T48n2005.xml` — https://github.com/cbeta-org/xml-p5 — retrieved 27 July 2026
- Reading interface: https://cbetaonline.dila.edu.tw/T2005 and https://deerpark.app/cbeta/T2005 — consulted 27 July 2026
- Taishō base witness, per the edition's own apparatus (note 0292001):
  【原】寬永九年刊宗教大學藏本 — the Kan'ei 9 (1632) printing, Shūkyō Daigaku copy;
  【甲】延寶八年刊宗教大學藏本 — Enpō 8 (1680).

Each piece below carries its exact Taishō page and line span, e.g. `p.292b12–b25`.

## The collation, finally performed — 20 August 2026

For a month this section read "Chinese Wikisource could not be reached from this session…
**treat the collation as unperformed.**" It has now been done. Wikisource was reachable,
and the text was pulled as **raw wikitext** rather than through any summarising fetch,
because a model in the pipeline can silently normalise the very characters a collation
exists to compare.

**Why this was worth doing at all.** Our edition rests entirely on CBETA's digitisation.
CBETA did not merely transcribe the Taishō: at **eight points its editors printed a
different character** from the base text. Every one of those is a modern judgement about a
1228 document, and our English inherits all eight without ever having questioned one. The
earlier attempt failed not for want of a witness but because the witness (佛弟子文庫)
reproduced CBETA's emendations exactly — agreement from a copy of your own source is an
echo, not evidence.

**So the first job was to test the witness, not the text.** Wikisource diverges from CBETA
orthographically in at least four places — 注**腳**/注**脚**, **冰**消/**氷**消,
隔**窗**/隔**窓**, 扶**豎**/扶**竪** — which is what independent typesetting leaves behind
and what a copy cannot. **This witness is not derived from CBETA.** That is the finding
that makes the rest mean anything.

**⚑ But its lineage is unstated, and this bounds every conclusion below.** The page names
no 底本, and its substantive readings track the Taishō. It is best treated as
Taishō-adjacent with modernised orthography. Therefore: where it fails to confirm a CBETA
emendation, that is **absence of independent support, not refutation** — a witness sharing
the Taishō's ancestry inherits the Taishō's errors. Nothing here gets us back to 1228.

### Results — four agree, three do not, one passage absent

**Agrees with CBETA:** 報**因**佑慈禪寺 (the monastery, base against the Enpō witness),
懸崖**撒**手 (case 32's verse), 辜負自**己** (the afterword), 常**牧** (the Ōei colophon).
Note that the two real corrections among these — 己 for 已 and 牧 for 收 — differ from the
error by one stroke and by a close visual resemblance, so a careful transcriber might well
have fixed both silently. **Even the confirmations are weak evidence.**

**Reads with the Taishō, so CBETA's emendation stands unsupported here:**

- **貶得眼來** for CBETA's **眨得眼來** (p.292b22) — the preface's "blink, and it is gone."
  CBETA is very likely right on sense: 貶 is to demote or disparage and does nothing to an
  eye, while 眨 is to blink. A shared visual error inherited by both.
- **請續一向** for CBETA's **請續一句** (p.295c04) — case 20's verse, which ships as "Let
  another continue this poem." That English depends on 句, a line of verse; 一向 will not
  carry it. CBETA is again likely right, and worth knowing that the line rests on an
  emendation.
- **兩箇馳子相撞著** for CBETA's **兩箇駞子** (p.299a09) — **case 48's camel.**

**Absent:** the 無 that CBETA deletes at p.293a25 could not be located in this witness;
inconclusive rather than either way.

### ⚑ What this settles about case 48

The camel is **not in the mainstream transmission.** It is CBETA's 2019 emendation, taken
from 柳幹康's collation of a single Muromachi manuscript, and the independent witness reads
馳, the galloper, exactly as the Taishō does.

Part Three §4 declined to restore the camel on the ground that adopting it is a choice of
witness this edition has no standing to make silently. **That reasoning was methodological
when it was written; it is now empirical.** Reps's "two riders" tracks the reading that the
Taishō and an independent witness both carry, and the humped-and-therefore-nothing-straight
joke belongs to one manuscript and one 2019 article. The decision to keep the riders stands
on firmer ground than the argument that produced it.

For what it is worth: the 云/雲 conversion artifact the brief warns about **cannot touch
this material**. There is no 云 anywhere in the front or back matter, and the only 雲 is the
personal name 白雲 in the afterword.

---

## What was done

Each piece was translated three times independently — a philological pass, a
Song-Chan-idiom pass, and a plain-English pass, each blind to the other two and to any
existing English translation. The three were then diffed: 61 loci of divergence, 46 of them
semantic. Every semantic divergence was taken back to the Chinese and adjudicated. Names,
reign eras, cyclical dates, offices and place names were established separately, from
sources, by a pass that did no translating. Finally the readings were checked for
defensibility against Aitken (1990), Shibayama (1974), Sekida (1977), Blyth, Yamada and
J. C. Cleary — **for sense only.**

That check overturned two of our own conclusions and corrected one line in the brief. All
three are recorded below where they belong.

**On borrowing.** No phrasing here was taken from any published translation; the three
passes worked from the Chinese and were instructed to stop reading any search result that
began to show them an English rendering. Two of them logged doing exactly that. But the
famous lines admit few renderings, and a later check turned up short runs that coincide
with Aitken or J. C. Cleary anyway — "the family treasure", "the mind of nirvana is easy
to…". Those are listed at the end of this file rather than denied. Where a coincidence was
avoidable it was changed.

**Uncertainty is flagged in place.** Where the Chinese will not decide between two readings,
the note says so rather than picking one quietly. Every such locus is gathered at the end.

---
---

# FRONT MATTER

---

## 無門關自序 — Mumon's Preface

**T48n2005 p.292b12–b25.** The one that matters.

### Chinese

> 佛語心為宗。無門為法門。既是無門。且作麼生透。豈不見道。從門入者。不是家珍。從緣得者。始終成壞。恁麼說話。大似無風起浪好肉剜瘡。何況滯言句。覓解會。掉棒打月。隔靴爬痒。有甚交涉。慧開紹定戊子夏。首眾于東嘉龍翔。因衲子請益。遂將古人公案。作敲門瓦子。隨機引導學者。竟爾抄錄。不覺成集。初不以前後敘列。共成四十八則。通曰無門關。若是箇漢不顧危亡。單刀直入。八臂那吒攔他不住。縱使西天四七。東土二三。只得望風乞命。設或躊躇。也似隔窓看馬騎。眨得眼來。早已蹉過。頌曰。
>
> 　　大道無門　千差有路
> 　　透得此關　乾坤獨步

### English

The translation is in [gateless-gate.md](gateless-gate.md), on the Preface page.
It is not duplicated here — a second copy is a second thing to keep true.

### Notes

- **Date.** 紹定戊子 = **1228**, the first year of Shaoding. Shaoding ran **1228–1233** —
  Emperor Lizong's second era. (The brief flags a machine pass that produced "1122/1123";
  that is 宣和, a different era in a different dynasty, about 106 years off.) The cyclical
  year checks: 1228 − 3 = 1225; 1225 mod 60 = 25; 25 mod 10 → 戊, 25 mod 12 → 子. Chen Xun's
  preface gives the same year independently. **The span of 夏 is left open — see the flag
  below.**
- **東嘉 is Wenzhou** — an old literary name for it, from 永嘉, and 龍翔 is 江心龍翔寺, today's
  江心寺, on the island in the Ou River. The Chinese says 東嘉, which names nothing an English
  reader can hold, so the place is named rather than transliterated. **Since August 2026 it
  reads "Ryusho, in Onshu"** — the Japanese readings of 龍翔 and 溫州, per Part Two §3. The
  earlier draft read "Longxiang in Wenzhou." (Sources giving 福州 for 東嘉 are wrong.)
- **首眾 is the same office as 首座** — head monk, the senior monk under the abbot. Kept as
  "head monk" here and in Zongshou's note, where the same office recurs.
- **敲門瓦子** — the broken roof-tile you pick up to bang on someone's door and drop the moment
  it opens. Kept as an image; the discarding is the whole content and paraphrasing it to "a
  mere expedient" kills it. Note that this is the one place in the preface where 門 is an
  ordinary physical door, which quietly reinforces that the 關 of the title is something else.
- **西天四七，東土二三** is arithmetic dressed as poetry — four sevens, the twenty-eight Indian
  patriarchs; two threes, the six Chinese. The multiplication was done in the English and the
  word "patriarchs" supplied once, which the Chinese leaves implicit. A Song reader
  decompressed this instantly; an English reader stops and does sums. **Deliberate loss.**
- **那吒 / Nata.** Appears in no case of the 1934 book, so there is no romanisation to
  inherit. **The August 2026 pass adopted the Japanese reading, Nata**, under the rule in
  Part Two §3: the shipped text uses the Japanese readings throughout, because that is the
  route the book took into English. The Pinyin is Nezha.
- **眨** at p.292b22 is CBETA's correction. The Taishō prints 貶.
- **無門 is doing three jobs at once** — "no gate", the author's name, and the book's title —
  and it goes on doing them in the afterword, in Huanglong's Three Barriers, in Zongshou's
  verse and in Meng Gong's colophon. English holds one at a time. This is the single largest
  unavoidable loss in the whole set, and it is why the title is left standing in full wherever
  it can be.

### ⚑ Unresolved

- **佛語心為宗 (p.292b12).** "The Buddha's teaching takes mind as its source" **could also read**
  "the heart of the Buddha's word is the source" — taking 佛語心 as a single unit, from the
  four-fascicle Laṅkāvatāra's chapter title 一切佛語心品. Both parses are old and both are in
  print; Shibayama takes the unit reading and makes the Laṅkāvatāra connection explicitly.
  The structural parallelism with 無門為法門 favours the split; the object-predicate symmetry
  and the scriptural echo favour the unit. The English chosen survives under either. A third
  reading — "The Buddha said: mind is the essence" — appears in no published translation and
  was rejected.
- **千差有路 (p.292b24).** "There are a thousand roads" **could also read** "the world of a
  thousand distinctions is nothing but roads" (contrastive, against the gateless Way) or
  "there are a thousand ways to approach it" (the received interpretation). The English is
  deliberately silent about where the roads go, because the Chinese is.
  ⚑ **This went wrong once and was put back, 21 August 2026.** A later verse polish set the
  line as "approached by a thousand roads", which commits to the received reading and
  excludes the contrastive one — precisely the harmonising this file's own closing rules
  forbid. The neutral line is restored. A flagged uncertainty is easy to lose, because the
  wording that protects it looks like a wording that could be improved.
- **紹定戊子夏 (p.292b16) — a dating question, not a translation one.** "Summer" is safe in the
  English, but the span underneath it is not settled. **Calendrically**, 夏 is lunar months 4–6,
  about 6 May – 1 August 1228 Julian. **Monastically**, it is the summer retreat, 4/15–7/15,
  about 20 May – 16 August. The difference bites: the afterword is dated 7/10, which is
  *inside* the retreat but five days *after* the calendrical summer has ended. The monastic
  reading makes the two documents cohere; the calendrical one leaves the preface describing a
  summer that was already over. Neither has been adopted, and no span is printed in the English.

**Source:** CBETA T48n2005 p.292b12–b25, retrieved 27 July 2026.

---

## 習庵陳塤序 — Chen Xun's Preface

**T48n2005 p.292a27–b02.** An endorsement that endorses by threatening to throw the book in
a river. Whether it ships is your call; the brief asks for it translated either way.

The head-title 禪宗無門關 that the Taishō prints above this preface — the document's opening
title — is a Taishō editorial addition. The apparatus at 0292a25 says so outright:
「禪宗無門關五字新加」.

### Chinese

> 說道無門。盡大地人得入。說道有門。無阿師分。第一強添幾箇注脚。大似笠上頂笠。硬要習翁贊揚。又是乾竹絞汁。著得這些哮本。不消習翁一擲。一擲莫教一滴落江湖。千里烏騅追不得。紹定改元七月晦。習菴陳𡎖寫。

### English

Say there is no gate, and everybody on earth walks in. Say there is a gate, and there is no
share in it even for the master himself.

Then, first thing, he forces in a batch of notes — a hat worn on top of a hat. Then he leans
on Old Xi to write him up, which is squeezing juice out of dry bamboo.

Now that he has got this roaring book together, it will not take even one toss from Old Xi.
One toss — and don't let a single drop of it land in the rivers and lakes. Wuzhui the
thousand-li horse could never run it down.

Last day of the seventh month, the year the era changed to Shaoding. Written by Chen Xun of
Xi Hermitage.

### Notes

- **Chen Xun, and the Taishō's odd graph.** The Taishō prints 陳**𡎖** (U+21396). This is a
  genuine variant of **塤**, not a misprint — 𡎖 is 塤 with 員's 口 written 厶, and 漢典 lists it
  as an 異體字. The man is **陳塤, 1197–1241**, courtesy name 和仲, studio name 習庵, of 鄞縣
  (Ningbo), 進士 of 1217, ending as 吏部侍郎; 宋史 juan 423.
- **習翁 is Chen Xun himself**, in the third person. 翁 replaces 庵 in his own 號 to make a
  jocular persona-name — and he was about **31** when he wrote this, so "Old Xi" is affected
  self-aging and part of the joke. The self-reference and the signature have to stay visibly
  the same word in English or the joke has nowhere to land. Note that all three lay
  colophon-writers in this book do the same thing: 習翁 here, 無庵 in Meng Gong's colophon,
  安晚 in Amban's letter.
- **Date.** 紹定改元 = the year the era name was changed = Shaoding 1 = **1228**. 晦 is the last
  day of the lunar month; the seventh month of 1228 had 29 days, so this is 7/29 → **30 August
  1228** Julian. Note the chronology: the afterword is dated nineteen days *earlier* than this
  preface. The front matter is not the earlier material.
- **烏騅 / Wuzhui** is Xiang Yu's warhorse, and 千里 is its standing epithet, not a distance
  travelled. The name is kept: the 1934 book is full of bare unglossed names and a reader takes
  a famous horse the same way they take Joshu.
- **笠上頂笠 and 乾竹絞汁** are stock idioms for redundancy and for a futile demand. Both kept as
  images, which is what published translators do with them too.

### ⚑ Unresolved

- **哮本 (p.292a29).** "This roaring book of his" **could also read** as a graphic corruption of
  another word entirely, in which case there is no insult there at all and the phrase means
  only "this book of his". 哮本 is a **hapax** — a full-text search of the canon returns this
  passage and nothing else. There is no lexical entry, no commentarial gloss, and the two
  published translations that carry this preface **disagree with each other**: one takes 哮 as
  noise, the other renders the phrase as a slight, elementary sort of book with no noise in it.
  Our reading is compositional (哮 roar + 本 text) and matches the first. A reader who wants
  safety can drop "roaring" and lose the insult — but the insult is what the paragraph is made
  of, and Meng Gong picks the same gag up seventeen years later with 惡聲流布.

**Source:** CBETA T48n2005 p.292a27–b02, retrieved 27 July 2026.

---

## 進呈表 — Memorial Presented at the Emperor's Birthday

**T48n2005 p.292b03–b09.** *Optional — court formalities, tonally alien to everything around
them. Cut this whole section and nothing else changes.* Placed last in the front matter, as
agreed, so that cutting it takes nothing else with it.

Two notes on scope. The brief lists the memorial and the 慈懿皇后功德疏 as two items; in the
Taishō they are **one document** — the second is the signature block of the first, and the
Empress's name appears in it only as part of the monastery's name. And the Taishō prints all
of this inside the same block as Chen Xun's preface, with no heading of its own.

### Chinese

> 紹定二年正月初五日。恭遇天基聖節。臣僧慧開。預於元年十二月初五日。印行拈提佛祖機緣四十八則。祝延今上皇帝聖躬萬歲萬歲萬萬歲。皇帝陛下。恭願聖明齊日月。叡算等乾坤。八方歌有道之君。四海樂無為之化。
>
> 慈懿皇后功德報因佑慈禪寺前住持傳法臣僧慧開謹言

### English

On the fifth day of the first month of the second year of Shaoding, at the sacred festival of
the Emperor's birthday.

Your servant the monk Ekai had already, on the fifth day of the twelfth month of the first
year, put into print forty-eight cases in which the encounters of the buddhas and the
patriarchs are taken up and weighed, so as to pray for long life for the sacred person of the
reigning Emperor: ten thousand years, ten thousand years, ten thousand times ten thousand
years.

Your Majesty. I wish, with respect, that your wisdom may stand level with the sun and moon,
that your years may match heaven and earth, that every quarter may sing of a ruler who keeps
to the Way, and that the four seas may be glad of a rule that never has to force a thing.

Former abbot of Baoyin Youci Chan Monastery, the merit cloister of Empress Ciyi — your
servant the monk Ekai, holder of the dharma transmission, respectfully submits this.

### Notes

- **Dates.** 紹定二年正月初五日 = **31 January 1229** Julian. 元年十二月初五日 = **1 January 1229**
  Julian. The trap: the twelfth lunar month of "Shaoding 1" already sits inside the Western
  year 1229, so the printing and the presentation are one lunar month apart, not thirteen.
- **天基聖節** is a proper noun — 天基節 was the festival name minted for Emperor Lizong's
  birthday, and Lizong was born on the fifth day of the first month. So the date and the
  festival are the same fact stated twice; the Chinese is naming the feast, not being
  redundant. Transliterating it ("the Sacred Festival of the Heavenly Foundation") tells an
  English reader nothing, so the referent is translated instead. **Deliberate.**
- **The signature block is one continuous string and one man.** 慈懿皇后 is Empress Ciyi, the
  posthumous title of Li Fengniang (李鳳娘, 1144–1200), consort of Emperor Guangzong. 功德 is
  the institutional category: the house was her merit-cloister, endowed to generate merit for
  her. **報因佑慈禪寺 is one monastery, not two** — confirmed by a second attestation in X1354 —
  and it was founded by Ekai's own teacher. The unit at the end is **傳法臣僧**, from the
  standard memorial template in 敕修百丈清規 (「某州某寺住持傳法臣僧某」); his line is that template
  with 前 inserted. So it segments as [monastery] / 前住持 / 傳法臣僧慧開 / 謹言 — not "former
  abbot by dharma transmission".
- **A variant in the monastery's name.** This is the one real manuscript variant in the front
  matter, and it changes a name in print. The Taishō apparatus at 0292b08 reads 「因【大】，恩【甲】」:
  the base text has 報**因**佑慈禪寺, the 1680 Enpō witness has 報**恩**佑慈禪寺. Romanised
  "Baoyin" here, following the base text. If it ever goes to a proofreader, "Baoen" is the
  other witness's reading.
- **無為之化** is the Daoist-flavoured court formula: transformation brought about by not acting.
- The raised-character court typography (擡頭) that the Taishō carries is not reproduced.

**Source:** CBETA T48n2005 p.292b03–b09, retrieved 27 July 2026.

---
---

# BACK MATTER

Presented in the transmitted Taishō order.

**One correction to the brief before we start.** The brief attributes the 後序 to 無量宗壽. It
is **Mumon's own** — it is signed 「楊岐八世孫無門比丘慧開謹識」 in the text itself, and
every published translation heads it as Mumon's postscript. Zongshou's contribution is a
separate piece, four items later. The two are both below.

---

## 後序 — Mumon's Afterword

**T48n2005 p.299a15–a26.**

### Chinese

> 從上佛祖垂示機緣。據欵結案。初無剩語。揭翻腦蓋。露出眼睛。肯要諸人直下承當不從他覓。若是通方上士。纔聞舉著。便知落處。了無門戶可入。亦無階級可升。掉臂度關。不問關吏。豈不見玄沙道。無門解脫之門。無意道人之意。又白雲道明明知道。只是者箇為甚麼。透不過。恁麼說話。也是赤土搽牛嬭。若透得無門關。早是鈍置無門。若透不得無門關。亦乃辜負自己。所謂涅槃心易曉。差別智難明。明得差別智。家國自安寧。旹紹定改元解制前五日。楊岐八世孫無門比丘慧開謹識。

### English

The translation is in [gateless-gate.md](gateless-gate.md), on the Afterword page.
It is not duplicated here — a second copy is a second thing to keep true.

### Notes

- **Date.** 解制 is the lifting of the summer retreat, on 7/15. Five days before = 7/10 →
  **11 August 1228** Julian. That puts the afterword nineteen days *before* Chen Xun's preface.
- **據欵結案 is courtroom language.** 欵 = 款, the deposition — the accused's own sworn statement.
  That specificity is the whole metaphor: a koan convicts you out of your own mouth, and
  nothing is added (初無剩語). The same register runs on into 判斷公案 in Amban's letter and
  判古今 in Zongshou's verse.
- **關 is a frontier checkpoint, not a garden gate**, and this passage proves it: 掉臂度關，
  不問關吏 — he walks through the barrier without a word to the officers on it. The book turns
  on 門 and 關 being different words, so 關 is "checkpoint" or "barrier" wherever it stands
  alone in a sentence, and "the Gateless Gate" only where it is the book's name. That
  distinction is what keeps Meng Gong's 既是無門因甚有關 working four pieces later.
- **鈍置 is Song colloquial for tormenting someone, wearing them down, giving them a rough
  ride** — not "to dull". The squeeze play is exact: get through and a gateless gate turns out
  to have had something to pass, so the man who built it is a fraud; fail, and you have wasted
  yourself. Somebody loses either way, and the person named in the losing clause is also the
  title on the cover. English cannot hold all three senses of 無門; the man was taken.
  ⚑ **This note used to go on to say that the signature "tells the reader four lines
  later that Mumon is a person." It does not, because the book does not carry the
  signature.** 旹紹定改元解制前五日。楊岐八世孫無門比丘慧開謹識 — the dateline and the
  eighth-generation-Yogi signature — is translated and sits in this file, but the shipped
  afterword ends at "you have disappointed yourself" and goes straight to the verse.
  **Ruled 21 August 2026: it stays out.** A reader does not need to be told Mumon is a
  man, and a colophon after that closing line reads as an appendix rather than an ending.
  Yogi and Jotei are therefore prepared names that never reach print; the table below
  says so.
- **涅槃心易曉，差別智難明 is a quotation**, marked as one by 所謂. Its earliest canonical
  attestation is 古尊宿語錄 juan 10, the record of **汾陽善昭 (Fenyang Shanzhao, 947–1024)** —
  who is in Mumon's own ancestral line, which is coherent with Mumon signing himself an
  eighth-generation Yangqi heir in the very next breath. Fenyang's text has 又云 immediately
  after, so he may himself be quoting; call it the earliest attestation, not the origin. (An
  earlier draft attributed the couplet to Xuansha. That was wrong — contamination from the
  Xuansha quotation three lines above. Dropped.)
- **玄沙 Xuansha Shibei (835–908), 白雲 Baiyun Shouduan (1025–1072), 楊岐 Yangqi Fanghui
  (992–1049).** None is named in the 48 cases, so there was no 1934 romanisation to inherit,
  and the July draft used Pinyin. **The August 2026 pass changed all three to the Japanese
  readings — Gensha, Hakuun, Yogi** — because the shipped book is a Japanese-lineage Mumonkan
  throughout and Pinyin in the back matter was the only place it broke. Macrons dropped to
  match the 1934 book's bare *Joshu*, *Hyakujo*. See Part Two §3.
- **CBETA's pointing is not followed here.** It puts a period after 為甚麼, splitting it from
  透不過; that yields "Just this thing — why? Cannot get through," which is not speech. Joined,
  which also keeps 透不過 inside Baiyun's quotation rather than making it Mumon's aside, and
  matches the parallel construction of the Xuansha couplet just above. All three independent
  passes joined it.
- **己** at p.299a23 is CBETA's correction; the Taishō prints 已.

### ⚑ Unresolved

- **明明知道只是者箇。為甚麼透不過 (p.299a20).** "You know perfectly well it is just this, so why
  can't you get through?" **could also read** "I know perfectly well… so why can't I get
  through?" — Baiyun confessing rather than challenging. The Chinese supplies no pronoun. The
  second person is only the unmarked default for a saying introduced by 白雲道 and delivered
  from the high seat.
- **赤土搽牛嬭 (p.299a21).** The direction is settled by grammar — 搽 takes the substance applied
  as its object (搽粉, 搽藥), so it is milk onto red clay, not the reverse. **The force is not
  settled.** "Futile cosmetic effort — you cannot whiten red earth with milk" **could also
  read** as spoiling something good by adulterating it, or, less likely, as fraud. No
  lexicographic entry for the phrase was found anywhere. **And note that the one complete
  published translation reached takes the smear the other way round — red clay onto a cow's
  udder.** The direction here is a choice made against it, on the grammar of 搽, not the
  obvious sense. Futility fits the context: Mumon has
  just quoted Xuansha and Baiyun approvingly and is now saying the quoting was a smear job —
  the same move he makes in the preface when he trashes the saying he has just endorsed.

**Source:** CBETA T48n2005 p.299a15–a26, retrieved 27 July 2026.

---

## 禪箴 — Zen Warnings

**T48n2005 p.299a29–b06.** Eleven traps. Most couplets name a perfectly reasonable practice and
then call it a disease; the last few pair two faults instead. **Nothing in the list is
endorsed** — including "wide awake,
never dull" and "catch each thought the moment it stirs", which a reader will expect to be
approved of.

### Chinese

> 　　循規守矩。無繩自縛。
> 　　縱橫無礙。外道魔軍。
> 　　存心澄寂。默照邪禪。
> 　　恣意忘緣。墮落深坑。
> 　　惺惺不昧。帶鎖擔枷。
> 　　思善思惡。地獄天堂。
> 　　佛見法見。二銕圍山。
> 　　念起即覺。弄精魂漢。
> 　　兀然習定。鬼家活計。
> 　　進則迷理。退則乖宗。
> 　　不進不退。有氣死人。
> 　　且道如何履踐。
> 　　努力今生須了却。莫教永劫受餘殃。

### English

The translation is in [gateless-gate.md](gateless-gate.md), on the Afterword page.
It is not duplicated here — a second copy is a second thing to keep true.

### Notes

- **The couplet pairing is editorial and should be labelled as such.** The Taishō's line
  grouping is a column-wrap artifact and does not mark the sense units; the pairing above is
  the received one. It is almost certainly right — the sequence coheres line by line, and an
  off-by-one pairing would invert every line's polarity into nonsense — and published
  translations set the same units. But it is a commitment, not something the printed text
  states.
- **默照邪禪.** 默照, "silent illumination", is a named method, and 邪禪 is a hostile qualifier
  attached to it. Renaming it would erase the target, so the name stays. That the specific
  target is Hongzhi Zhengjue and the Caodong school, via Dahui Zonggao's polemic, is **our
  inference, not something any source states** — well-founded (默照禪 is Hongzhi's, 默照邪禪 is
  Dahui's coinage, and Mumon signs himself an eighth-generation Yangqi heir) but unattested.
- **鬼家活計** is 鬼窟裏作活計 in the background — *you* are the one making a living, and the
  address is the ghost cave. The trades belong to you, not the ghosts. The sneer is at dead
  sitting as a comfortable career.
- **二銕圍山** (銕 = 鐵). "Iron mountains on both sides of you" keeps the picture of being pinned
  and drops the cosmology — **deliberate**. That the referent is the double ring of iron
  mountains around the world, with the lightless hell between them, is **our gloss**; no
  translation or commentary reached states it for this line.
- **枷** is a cangue, the wooden collar locked round a prisoner's neck. "A board round your
  neck" is the object in words a reader already owns; "cangue" would need explaining.
- **禪箴 / "Zen Warnings".** 箴 is a needle, and the genre-word is "admonition" — but that is a
  word this voice would not use, and the piece it heads is eleven flat traps. A choice — and
  **not an original one**: "Zen Warnings" is already current as an English title for this
  section. That is one of the facts that sank the front matter's "no earlier English edition"
  claim.

**Source:** CBETA T48n2005 p.299a29–b06, retrieved 27 July 2026.

---

## 黃龍三關 — Huanglong's Three Barriers

**T48n2005 p.299b08–b15.** Four verses on the three questions of Huanglong Huinan
(1002–1069): how is my hand like the Buddha's hand, how is my foot like a donkey's foot, and
what were the circumstances of your birth. **Not case 47** — that is Tosotsu's three
barriers, a different set, and both are in this book.

**⚑ Whose verses these are is genuinely open — see the flag below. It is the most
consequential open question in this file.**

### Chinese

> 　　我手何似佛手。摸得枕頭背後。
> 　　不覺大笑呵呵。元來通身是手。
>
> 　　我脚何似驢脚。未舉步時踏著。
> 　　一任四海橫行。倒跨楊岐三脚。
>
> 　　人人有箇生緣。各各透徹機先。
> 　　那吒折骨還父。五祖豈藉爺緣。
>
> 　　佛手驢脚生緣。非佛非道非禪。
> 　　莫怪無門關險。結盡衲子深冤。

### English

　　How is my hand like the Buddha's hand?
　　Groping behind my back and finding the pillow.
　　Before I know it I am laughing out loud —
　　the whole body, it turns out, is hand.

　　How is my foot like a donkey's foot?
　　It has already landed before the step is taken.
　　Let it go where it likes across the four seas,
　　sitting backwards on Yangqi's three-legged donkey.

　　Every one of us came from somewhere.
　　Every one of us sees clean through it before the first move.
　　Nezha broke his bones and gave them back to his father.
　　What did the Fifth Patriarch want with a father?

　　Buddha's hand, donkey's foot, where you came from —
　　not Buddha, not the Way, not Zen.
　　Don't blame the Gateless Gate for being a hard pass.
　　It has made a bitter enemy of every monk alive.

### Notes

- **楊岐三脚** is Yangqi Fanghui's three-legged donkey, from his answer 「三脚驢子弄蹄行」 — the
  donkey is supplied from the preceding line's 驢脚, since "Yangqi's three legs" is unreadable.
  Confirmed in T1994A.
- **那吒 / Nezha** returned his flesh to his mother and his bones to his father, then stood
  forth in his own body. Pinyin, as in the preface.
- **黃龍 / Huanglong Huinan.** Pinyin — he is not named in the 48 cases. Japanese reading Ōryū.
- **三關 / "Three Barriers"** deliberately matches the phrase the 1934 edition uses for case 47.

### ⚑ Unresolved — attribution

**The Taishō gives these four verses no attribution at all**, and the four published
translations that carry the section **all assign them to 無量宗壽 (Wuliang Zongshou), not to
Mumon** — Blyth ("Sōju's Verse on Ōryū's Three Barriers"), Shibayama, Yamada, and J. C.
Cleary, who prints the *following* piece inside the same section.

The mechanism is a layout judgement, and a reasonable one: the signature 「紹定庚寅季春無量
〔宗壽〕書」 stands at the end of the *next* block, and the published tradition reads it as
governing everything back to the previous signature. CBETA's own div structure groups these
verses under a heading 無量宗壽書 as well.

**But that mechanism proves more than the published headings claim.** The same CBETA div
opens at 0299a28 and encloses **the Zen Warnings too** — so a signature governing everything
back to the previous one would sweep those in as Zongshou's as well, and no published
translation puts them there. Either the layout argument is too strong, or the attribution
rests on something the headings do not state.

The internal argument for Mumon is 「莫怪無門關險」 in verse four — he is defending his own
book. **That argument is weaker than it looks.** 莫怪 most naturally addresses others about a
third thing, and the couplet reads at least as well from the abbot who had just invited Mumon
to preach, telling resentful monks not to blame the book for being steep. Lineage gives no
help either way: Zongshou is in the Dahui line, which is also Yangqi descent, so 倒跨楊岐三脚
is unremarkable from either man.

**Do not print either attribution as settled.** An earlier draft of this file asserted the
verses were Mumon's own; the check against the published tradition overturned it.

### ⚑ Unresolved — 五祖豈藉爺緣 (p.299b13)

"The Fifth Patriarch" — Hongren, the fatherless child of the Zhou woman, known as 無姓兒 —
**could also read** "Goso", 五祖法演, who is in Mumon's own lineage and is what a reader of the
1934 cases will hear, since "Goso" means Fayan in cases 35, 36, 38 and 45.

The couplet's subject is parentage, and Fayan had ordinary parents, which is why Hongren is
taken here; the one published translation that renders the line reads it as the Fifth
Patriarch too. But **爺緣 is a hapax in the entire canon** — there is no commentarial tradition
to appeal to — and Fayan is named after Hongren's own mountain, so the shadow of the other man
may be deliberate. Writing "the Fifth Patriarch" out in English rather than romanising it is a
deliberate departure from the naming rule: "Goso" would send the reader to the wrong person.

A further divergence worth knowing: one published reading takes the "father" as the **Fourth**
Patriarch, i.e. 爺緣 as the *dharma*-lineage tie to Daoxin rather than a biological father. Both
land on Hongren; they differ on what connection he is said not to have needed.

**Source:** CBETA T48n2005 p.299b08–b15, retrieved 27 July 2026.

---

## 無量宗壽書 — Wuliang Zongshou's Verse of Thanks

**T48n2005 p.299b16–b20.** Written on the occasion of Mumon's installation as 立僧 at Ruiyan,
in the spring of 1230 — two years after the book was finished.

### Chinese

> 　　瑞巖近日有無門　掇向繩床判古今
> 　　凡聖路頭俱截斷　幾多蟠蟄起雷音
>
> 請
>
> 無門首座。立僧山偈奉謝。紹定庚寅季春無量（宗壽）書。

### English

　　These days at Ruiyan there is a Mumon.
　　Hoisted onto the rope chair, he passes sentence on old and new.
　　The roads of the ordinary and the holy, both cut clean through.
　　How many sleepers curled up all winter rise at that thunder?

Having invited Head Monk Mumon to take the high seat and teach the assembly, I offer this
verse from the mountain in thanks. Last month of spring, the gengyin year of Shaoding. Written
by Wuliang Zongshou.

### Notes

- **The occasion.** 立僧 is the office of 立僧首座 — a senior monk formally installed to expound
  the dharma to the assembly *on the abbot's behalf* — and 請…立僧 is the standard appointment
  idiom, with its own section headings in 禪苑清規 juan 7 (「請立僧」, 1103) and 敕修百丈清規 juan
  4 (「請立僧首座」). The installation rite in 敕修百丈清規 supplies two exact matches to this
  piece: 「立僧**趺座**」 answers the verse's 「掇向**繩床**」, and the closing 「伸**謝**」 answers
  「山偈**奉謝**」. So the thing set down on the rope chair is **Mumon**, and the verse is the
  abbot's thank-you.
- **CBETA's pointing here is misleading and is not followed.** It prints 「請無門首座。立僧山偈
  奉謝。」, which strands 請 without an object and leaves the sentence verbless. The segmentation
  is 請無門首座立僧 ／ 山偈奉謝. 「立僧山」 has exactly one hit in all of CBETA — this line — so it
  is not a lexical unit; 山偈 has four, one of them (白雲守端's 箇山偈, delivered publicly, its
  stated function 謝) an exact structural parallel. The lone 請 on its own line is respectful
  layout, not syntax.
- **無量宗壽 is one man**: 無量 the 道號, 宗壽 the dharma name, printed in the Taishō as a small
  interlinear gloss identifying who 無量 is. Not two people and not a hedge — the parentheses in
  the Chinese above reproduce the Taishō's typography and should not survive into the set page.
  He is 慶元府瑞巖無量宗壽禪師, in the line 大慧宗杲 → 佛照德光 → 育王秀巖師瑞 → 瑞巖宗壽, 南嶽下十八世
  — an exact generational peer of Mumon in a different branch, and abbot of Ruiyan.
- **瑞巖 is Ningbo, and this is a real trap.** This is 瑞巖開善禪寺 in 慶元府/明州; the 瑞巖 of
  **case 12** is 瑞巖師彥's mountain in **Taizhou** — a different mountain in a different
  prefecture. Carrying the 1934 romanisation "Zuigan" across sends the reader to the wrong
  place and the wrong man, so Pinyin "Ruiyan" is used deliberately.
- **Date.** 紹定庚寅 = **1230**, Shaoding 3. 季春 is the third lunar month, roughly 15 April –
  13 May 1230 Julian. No day given. This also fixes a point of Mumon's biography: head monk at
  Longxiang in 1228, head monk at Ruiyan in 1230.
- **有無門** puns — "has a Mumon" and "has no gate". The name was taken; the pun is lost.
- **蟠蟄** are the creatures coiled underground through the winter, woken by the first spring
  thunder — the 驚蟄 image, live because the piece is dated to late spring.

### ⚑ Unresolved

- **幾多蟠蟄起雷音 (p.299b18).** "How many coiled sleepers rise at that thunder" **could also
  read** "how many coiled sleepers send up a thunderclap of their own" — taking 起 as transitive
  with 雷音 as its object, which is what the word order strictly gives. The received seasonal
  image supports the first; the grammar supports the second, and it is the better compliment.
- **山偈 (p.299b19).** The word boundary is settled. The force of 山 is not: either locative and
  humble ("from up here in the mountains") or institutional (山中 / 本山, the abbot speaking in
  his house's corporate voice, which is literally the voice the 敕修百丈清規 installation formula
  puts in an abbot's mouth). Both yield the same English; this note does not claim to know which.

**Source:** CBETA T48n2005 p.299b16–b20, retrieved 27 July 2026.

---

## 孟珙跋 — Meng Gong's Colophon

**T48n2005 p.299b21–b29.** Summer 1245, on a reprint.

### Chinese

> 達磨西來。不執文字。直指人心。見性成佛。說箇直指。已是迂曲。更言成佛。郎當不少。既是無門。因甚有關。老婆心切惡聲流布。無庵欲贅。一語又成四十九則。其間些子誵訛。剔起眉毛薦取。淳祐乙巳夏重刊。
>
> 檢校少保寧武軍節度使京湖安撫制置大使兼屯田大使兼蘷路策應大使兼知江陵府漢東郡開國公食邑二千一百戶食實封陸佰戶
>
> 孟珙　跋

### English

Bodhidharma came from the west. No clinging to words. Pointing straight at a man's mind: see
your own nature and become a buddha.

To say "pointing straight" is already the long way round. To go on and say "become a buddha"
makes no small mess of it. And if there is no gate, why is there a barrier?

Grandmotherly kindness laid on thick, and the bad noise all over the place. Wu'an would like to
tack on one more word, and that would make forty-nine cases. There is a snag or two in there.
Lift your eyebrows and catch them.

Reprinted in the summer of the yisi year of Chunyou.

Acting Junior Guardian; Military Commissioner of the Ningwu Army; Grand Commissioner for
Pacification and Control of Jing-Hu; concurrently Grand Commissioner for the Military Farms;
concurrently Grand Commissioner for Coordinated Support of Kui Circuit; concurrently Prefect of
Jiangling; Dynasty-Founding Duke of Handong Commandery, with a nominal fief of two thousand one
hundred households and an effective fief of six hundred.

Meng Gong. Colophon.

### Notes

- **無庵 is Meng Gong himself**, in the third person by his own 號 — the same habit as 習翁 in
  Chen Xun's preface and 安晚 in Amban's letter. He is **孟珙 (1195–1246)**, courtesy name 璞玉,
  號無庵居士, the Southern Song general; a lost one-fascicle 《無庵法語》 recording his own Chan
  exchanges is catalogued in 《讀書附志》. The only Chan master of the name, 無庵法全, died some
  sixty-five years before this was written. The one published translation of the clause renders
  it in the **first person**, with no third party at all — which is only possible if 無庵 is the
  writer.
- **欲 is prospective, and the mood matters.** Meng Gong is *floating* a forty-ninth case in
  1245, not reporting one. He never wrote it. Amban did, a year later. **Both English and
  Chinese Wikipedia get this wrong and credit the 49th case to 無庵** — the indicative reading is
  a live, propagating error, which is why the conditional is used here.
- **CBETA's pointing is not followed.** It prints 「無庵欲贅。一語又成四十九則。」; 贅 is transitive
  and wants 一語 as its object. CBETA's version yields "Wu'an wished to be superfluous. One word
  further made forty-nine cases," which is not a sentence anyone wrote. The one published
  witness repunctuates the same way.
- **老婆心切** is the standard Chan phrase for a teacher so kind he explains everything and
  thereby ruins it. The grandmother is the joke and has to stay. **惡聲** is primarily an ill
  name, but in a colophon to a book that Chen Xun called a 哮本 the literal ugly noise is alive
  too — "bad noise" holds both.
- **蘷 is a block-cutter's variant of 夔** — Kuizhou Circuit. **策應** is specifically the
  coordinated movement of one theatre to relieve or reinforce a neighbouring one, and 策應大使 is
  a real Southern Song theatre command, attested independently for 賈似道 and 趙葵. **檢校少保**
  and **寧武軍節度使** are not two random honours: after Huizong's Zhenghe reform the surviving
  檢校 titles were the 三少, awarded specifically to long-serving 節度使, so the two go together.
  **陸佰** is the anti-fraud form of 六百.
- **The office string is left as one unbroken breath.** The comedy of its length standing
  immediately above a two-character signature is part of the document; it should not be turned
  into a sentence or broken into a list.
- **Date.** 淳祐乙巳 = **1245**, Chunyou 5 (淳祐 = 1241–1252). Summer is lunar months 4–6, roughly
  28 April – 24 July 1245 Julian. No day given.

### ⚑ Unresolved

- **兼屯田大使兼蘷路策應大使 (p.299b26–27) — a documentary conflict, not a parse.** The colophon's
  titulature **cannot be reconciled** with the secondary biographies of Meng Gong, which give
  夔州路制置大使兼屯田使 for the same period; one reference work records 「無策應大使記載」 outright.
  Either the colophon preserves a 1244–45 reshuffle or one tradition is corrupt. Only 宋史 juan
  412 will settle it and it could not be reached. **What is printed has been translated. Do not
  harmonise it.**
- **The 1245/1246 gap.** Meng Gong floats a forty-ninth case in 1245; Amban writes one in 1246,
  in the same 號-plus-欲 construction and with the same 大衍 conceit made explicit. Meng Gong was
  an acknowledged *Yijing* specialist with a lost work on the *Changes* to his name, and the two
  men are documented petitioning the throne together; he died about three months after Amban
  wrote, so he was alive to see it. **That reconstruction is ours. No published discussion of
  the discrepancy exists anywhere we could reach.** The best untried lead is 柳幹康,
  〈『無門関』三本の比較分析〉, 《花園大学国際禅学研究所論叢》14 (2019).

**Source:** CBETA T48n2005 p.299b21–b29, retrieved 27 July 2026.

---

## 安晚居士書 — Amban's Letter

**T48n2005 p.299c01–c07.** The preface to his forty-ninth case. **The case itself
(第四十九則語, p.299c08–c20) is not translated here** — it is already in the book in the 1934
rendering.

### Chinese

> 無門老禪。作四十八則語。判斷古德公案。大似賣油餅。人令買家開口接了更吞吐不得。然雖如是。安晚欲就渠熱爐熬上。再打一枚足成大衍之數。却仍前送似。未知。
>
> 老師從何處下牙。如一口喫得。放光動地。若猶未。也連見在四十八箇。都成熱沙去。速道速道。

### English

The translation is in [gateless-gate.md](gateless-gate.md), on the Afterword page.
It is not duplicated here — a second copy is a second thing to keep true.

### Notes

- **Amban is 鄭清之, Zheng Qingzhi (1176–1251)**, the Southern Song chancellor, whose studio name
  was 安晚. He names himself in the third person, then the Chinese drops the subject entirely at
  未知 and the English has to supply one; "I" is the choice made here. "Amban" is the 1934 book's spelling and is kept, since his forty-ninth case is
  already in the book under that name.
- **大衍之數** is from the *Xici* commentary to the *Book of Changes*: 「大衍之數五十，其用四十有九」
  — the Number of the Great Expansion is fifty, and forty-nine of them are used. Forty-nine is
  the count of milfoil stalks a diviner actually handles, which is exactly why 48 + 1 is the
  joke. **Published translators have generally dropped this**, paraphrasing it into a vague
  remark about having enough. It is kept here: the arithmetic is stated three lines later
  anyway, so the allusion costs nothing and its loss costs the whole point — a Chan collection
  completed by a number borrowed from the *Book of Changes*, deadpan, from a retired chancellor
  at his lake villa.
- **CBETA's pointing is not followed, in two places.** (i) It prints 「大似賣油餅。人令買家…」,
  breaking after 餅 and stranding 人令; the unit is **賣油餅人**, the oil-cake seller. The one
  published witness reads it the same way. All three of our independent passes fixed this
  separately, which is the strongest confirmation this method can produce. (ii) It puts a period
  after 四十八箇, splitting the correlative pair 連…都 — "even X … all of it". The threat is not
  that the new cake and the old ones go together; it is that **even the forty-eight he has
  already got** turn to hot sand, retroactively. The whole book stops being food.
- **The mid-sentence break after 未知** is a column artifact of the printed Taishō and has been
  closed. An English paragraph that stops on "And I wonder" reads as a production error, not as
  reverence.
- **就渠熱爐熬上** — 渠 is Song colloquial "him". Amban is borrowing Mumon's stove while it is
  still hot. 打一枚 is the ordinary verb for making a cake, not for striking anything. **送似** is
  Song colloquial for 送與, "send to" — not "send something resembling".

**Source:** CBETA T48n2005 p.299c01–c07, retrieved 27 July 2026.

---

## 安晚署年 — Amban's Dateline

**T48n2005 p.299c21–c22.** In the Taishō this follows the forty-ninth case, not the letter.

### Chinese

> 淳祐丙午季夏初吉安晚居士書于西湖漁莊

### English

Written at the Fishing Lodge on West Lake by Amban, a layman, in the first days of the last
month of summer, the bingwu year of Chunyou.

### Notes

- **Date.** 淳祐丙午 = **1246**, Chunyou 6 — one year after Meng Gong's colophon. 季夏 is the
  sixth lunar month; 6/1 would be 15 July 1246 Julian.
- **西湖漁莊 is a place with a name, not a description of a hobby.** 宋史 juan 414 records
  「更賜第於西湖之漁莊」 — an imperially bestowed residence, granted to Zheng Qingzhi in **1245**,
  one year before this colophon.
- **居士** is the standard designation for a lay Buddhist — a status marker, not part of his name
  and not a monastic rank.

### ⚑ Unresolved

- **初吉 (p.299c21).** "In the first days of the last month of summer" **could also read**
  strictly "on the first day" (毛傳: 初吉，朔日也) or broadly "within the first quarter of the
  month, days 1 to 7 or 8" (王國維's 四分月說 — which concerns Western Zhou bronze inscriptions
  and probably does not govern a Southern Song colophon). The English chosen is true under all
  three. Note that "the first auspicious day" is a calque and implies a day *chosen* for its
  auspiciousness, which is not what 初吉 says.

**Source:** CBETA T48n2005 p.299c21–c22, retrieved 27 July 2026.

---

## 應永重刊刊記 — The Ōei Reprint Colophon

**T48n2005 p.299c23–c25.** Japanese, 1405. Included because it is the last thing in the
Taishō text and it explains how the book survived; drop it if the page is tight.

### Chinese

> 舊板磨滅故。重命工鋟梓畢。這板置于武藏州兜率山廣園禪寺也。
>
> 應永乙酉十月十三日　幹緣比丘　常牧

### English

The old blocks had worn smooth, so the carvers were set to work again and the new ones are
finished. These blocks are kept at Kōonji, the Zen temple on Mount Tosotsu in Musashi.

Thirteenth day of the tenth month, the yiyou year of Ōei. Jōboku, the monk who had the work
done.

### Notes

- **Date.** 應永 is the Japanese Ōei era, 1394–1428; 乙酉 = **1405**, Ōei 12. Month 10, day 13 →
  4 November 1405 Julian. **Caveat: that conversion is computed on the Chinese calendar.** Japan
  in 1405 was still running the Senmyō calendar, which had drifted from the true new moon, so
  the Japanese date could sit a day or two off. Read it as ±2 days.
- **幹緣 is not 勸緣**, and the distinction is real: 吳都法乘 lists the two side by side —
  「幹緣住持僧德順　勸緣知縣事趙希芬」. The 勸緣 solicits the donations; the **幹緣 runs the project**.
  The exact parallel in 元亨釋書 is 「開板幹緣比丘單況命工刊行」, which is what this colophon says two
  clauses earlier (重命工鋟梓). So Jōboku commissioned the carvers and saw the recutting through,
  and he is almost certainly the unstated subject of that clause. "Raised the subscription"
  would be 勸緣, and is wrong.
- **廣園寺 is Kōonji** — Rinzai, Nanzenji line, on Mount Tosotsu in what is now Hachiōji, western
  Tokyo. Its own reading is Kōonji, **not** Kōgenji, which is what the characters suggest. It was
  founded around 1389, so it was about sixteen years old when these blocks arrived. 兜率 is
  Tosotsu, matching case 47 of the 1934 book; the mountain is named for the Tuṣita heaven.
- **牧** at p.299c25 is CBETA's correction; the Taishō prints 收. The correction is independently
  confirmed by National Diet Library catalogue records for the Edo reprints, which read
  「幹縁比丘常牧」.
- **鋟梓** is literally to cut catalpa wood, the standard term for cutting printing blocks.
- **常牧 is given as Jōboku**, the Japanese reading, because this is a Japanese colophon written
  in Japan. The Chinese reading would be Changmu. A choice.

**Source:** CBETA T48n2005 p.299c23–c25, retrieved 27 July 2026.


---
---

# PART TWO — THE EDIT OF THE FORTY-NINE CASES

August 2026. The cases are the 1934 Senzaki/Reps English, in the United States public
domain, reached by way of sacred-texts.com. **No case was retranslated from the
Chinese** except at the two places recorded in §7, both of which are flagged in the
book's own front matter as editing rather than translation.

## 1. What the base text was like

Senzaki was a Japanese Rinzai monk; Reps was the American who worked the English with
him. The book therefore arrived already in Japanese readings, and its faults are of
three distinct kinds, which want three distinct remedies:

- **Edwardian abstraction** in the capping verses — *emancipated*, *abstruse*,
  *illumined*, *grievous*, *ineffable*.
- **Philosophy-department English** where the Chinese is concrete — *subjectivity and
  objectivity*, *the perception world*, *cognition and noncognition*, *discontinuation*.
- **1930s American slang**, which is not archaism but a translator's voice — *city
  slicker*, *country dub*, *dunce*, *uppercut*, *doughnuts*, *chatterbox*.

Overlaid on all three, the capping verses had at some point been flattened into prose:
**23 of the 49 arrived as run-on paragraphs.**

## 2. The verses

- **All 49 capping verses are set as four lines.** Twenty-three were re-broken from
  prose. Two needed reshaping rather than re-breaking: **case 9** had five sentence-units
  and its last two were merged; **case 44** had three and its long opening was split.
- **Sentence case**, not a capital on every line. Capitalising each line is a
  19th-century convention the newly translated verses did not follow, so 49 verses were
  brought to the 2 rather than the reverse.
- **Line balance was treated as part of the four-line rule.** Cases 17, 28 and 46 were
  compliant and still ungainly (17 ran 16/15/11/5 words). Case 28's repair was the most
  substantive: the Chinese is a chiasmus — 聞名不如見面／見面不如聞名, the line turning
  around and walking back — and the 1934 English had padded the reversal into fifteen
  words and killed it. Restoring it removed words rather than adding them.

## 3. Names

**The rule: Chinese and Japanese Zen figures take Japanese readings; Indian figures keep
Sanskrit forms.** This is not a new policy — it is what the 1934 cases already did, since
that is the transmission Senzaki received. The July translations broke it by using Pinyin
in the back matter, which meant the preface introduced the author as *Wumen Huikai* and
case 1 then handed the reader *Joshu* with no signal they were the same system.

Changed in the shipped matter: Wumen Huikai → **Mumon Ekai** · Longxiang → **Ryusho** ·
Wenzhou → **Onshu** · Nezha → **Nata** · Xuansha → **Gensha** · Baiyun → **Hakuun** ·
Yangqi → **Yogi** · Shaoding → **Jotei**. No macrons, matching the 1934 book's bare
*Joshu* and *Hyakujo*.

**Bibliographic citations keep the Chinese** — `Wumen Huikai's Chinese of 1228`, `the
Taishō canon (CBETA T48n2005)` — because those identify a source document that has to
resolve. The provenance section now states this policy outright, and names *Mumon Ekai*
so the colophon's signature connects to the rest.

Collisions resolved inside the cases:

- **Kashapa** now belongs only to the **Kashapa Buddha** of case 2, a past buddha.
  Ananda's colleague is **Mahakashapa** everywhere, including case 22's title, which the
  1934 text left bare. The two were one character apart for two different beings.
- **Goso** and *Hoen* were the same man, 五祖法演, split across cases 35, 36, 45 and the
  buffalo koan (case 38 since Part Three's reorder; 37 in the 1934 numbering) with
  nothing linking them. Now Goso throughout.
- **Seijo** is genuinely two people — the master of case 9 and the girl of case 35.
  Inherited, correct, left alone.

## 4. Person and gender

**Generic third person became second person.** The argument is not primarily about
gender. Mumon's commentaries are addressed at the reader — the book already contained
190 instances of *you* and seventeen direct-address formulas — and the generic *he* was
a distancing device working against the koan. *"If anyone understands this, he is a
graduate of Zen"* holds the reader at arm's length; *"If you understand this, you are a
graduate of Zen"* puts them on the spot, which is the mechanism.

Roughly 30 passages converted. Constraints observed:

- **Real people keep their pronouns.** *Joshu's tongue has no bone so **he** can use it
  freely.*
- **Where "you" would change the question, it was not forced.** Case 2 asks about a
  *category* — "are **you** subject to the law of causation?" is a different question with
  a different answer. That noun went neutral instead: **the enlightened person** (case 2
  ×6; case 20's title carried it too until Part Three's verification renamed that page
  The Person of Great Strength). Case 9's comment is a maxim about categories and went plural.
- **Specific or indefinite people keep *man*** — Joshu, the man at the gate, the man in
  the tree, the man selling fried cakes. **Technical terms stay** — *the true man*, 真人.
- **Orphaned pronouns are the failure mode.** Neutralising a noun strands the pronouns
  after it: case 20 needed *their feet* and *themselves* in the prose, and *its head* in
  the verse.

The book's front matter discloses this in one clause — *"the reader addressed directly
where the old text spoke of a hypothetical man"* — on the principle that editions which
say what they did age better than editions that do not.

## 5. Vocabulary

**A word is chosen for the sentence it is in, not matched to its earlier self.**
*Emancipated* (5 instances, 解脱) became **free / set free / freeing / fully free /
enlightened**. *Intimately* (4, 親切) became **fully / thoroughly / to the point /
deeply**. *Surpass* (6) became **match / equal / go beyond / get ahead of**.

**But repetition that is doing work stays.** Case 28's verse repeats *surpass* on
purpose. That is the same fact as §2's chiasmus, seen from the vocabulary side.

Selected substitutions, with the reason where it is not obvious:

| Out | In | Why |
|---|---|---|
| the four gratifications | the four debts of gratitude | 四恩; the standard English, and self-explanatory |
| subjectivity and objectivity | inside and outside | 内外打成一片 |
| the perception / nonperception world; cognition, noncognition | knowing / not-knowing; a delusion, blankness | 道不屬知，不屬不知。知是妄覺，不知是無記 — two plain words, not four abstractions |
| stride of Dharma | gate of Dharma | 法門 is a *gate*; "stride" looks like an error upstream, and the correction echoes the title |
| Grdhrakuta | Vulture Peak | 靈鷲山 / Gṛdhrakūṭa **means** vulture peak; the 1934 text simply left it untranslated |
| the Chinese god who pushed aside a mountain | a god once split a mountain with one hand | 巨靈 split Mount Hua; "the Chinese god" named nobody and pictured nothing |
| tangling ghost | tangled ghost | 依草附木的精靈. *Hungry ghost* was considered and rejected: 餓鬼 is a different being in a different realm, and the error would be visible to a Buddhist reader |
| dumb man | a man who cannot speak | meant mute, now reads as stupid |
| Hindu (of Bodhidharma) | foreigner | 胡 is rude but not a religious claim, and Bodhidharma was a Buddhist |
| the chatterbox (case 40) | cutting off all the talk | 周遮 is **verbiage, not a person**; the 1934 text made an abstract noun into a character, which is why the phrase had no antecedent |

**The register test that mattered most: does the modern connotation point the wrong
way?** This is worse than datedness, because the reader is misled without noticing.
Two caught: *all-round man* (通方 means total depth; the English reads as *generalist*,
nearly the opposite) and *the outsider's road* (外道 is a condemnation; *outsider* in
current English is a compliment).

**Reps's Americana was not swept out wholesale.** It is a translator's voice, not
sloppiness, and stripping it makes the book more neutral and less alive. Four were
replaced because they had stopped working — *country dub* (opaque), *dunce*
(schoolroom-Victorian), *uppercut* (anachronistic in a Tang monastery), *church-goer*
(wrong religion). These were kept: *city slicker*, *turned the tables*, *overplayed his
hand*, and *sold dog meat under the sign of mutton*, which is not Reps at all but a
genuine Chinese idiom, 掛羊頭賣狗肉, that survived translation intact.

**"Dried Dung" (case 21) was kept knowingly.** 乾屎橛 is a dried shit-stick — the wiping
stick from the latrine, the filthiest object in the monastery — and the koan's force is
the maximum contrast between the question and the answer. Senzaki and Reps, privately
printing in Los Angeles in 1934, were never going to set that in type; nearly every
modern translation restores it. It is not restored here. That is a publishing decision,
made with the philology in view, not an oversight.

## 6. Syntax

Vocabulary and syntax are different faults and were swept separately. Eighteen sentences
were repaired: thirteen ungrammatical, five that parse but say something other than what
is meant. Representative:

- *"He made the good listeners **as bad**"* (case 6) — comparison with no second term.
- *"master or no master **can stop it**"* (case 8's verse) — the negation had gone
  missing, so the line asserted the opposite of its plain sense.
- *"Old Joshu **played the spy's work**"* (case 31) — fuses *play a part* with *do work*.
- *"you should feel **like drinking** a hot iron ball"* (case 1) — reads as *you should
  want one*, the opposite of the intended agony, and one does not drink a ball. Now
  *"feel as if you had swallowed."*
- *"his teaching was **just as useless**"* (case 21) — as useless as what? The sentences
  were merged so the comparison has its second term.

## 7. Two places the edit reached the Chinese

Both are departures from the "no case retranslated" rule and are recorded as such.
**Superseded in scale by Part Three**, the August 2026 verification pass, which repaired
some forty further places against the Chinese; these two remain the precedent it applied.

- **Case 29 — a recovered joke.** Mumon's comment in Chinese is 不是風動，不是幡動，**不是
  心動** — three negations. The sixth patriarch said mind *is* moving; Mumon negates that
  too, out-doing him, and then asks 甚處見祖師. The 1934 English turned the third negation
  into an affirmation and collapsed the comment into a restatement of the case. Restored.
- **The buffalo koan — a substitution, not a restoration.** (Case 37 when this was
  written; **case 38** since Part Three restored the Taishō order.) The Chinese is 水牯牛過**窗櫺**, a
  buffalo passing through a **window lattice**: head, horns and four hooves through the
  bars, and the tail stuck. The 1934 English has him leaving an enclosure at a cliff edge
  — **no aperture at all**, which leaves the koan with nothing for the tail to be caught
  in. The edition puts a **gate** there instead of a window. That is not what the Chinese
  says; it restores the mechanism (opening, stuck tail) and chimes with the book's own
  gate imagery, and the artwork shows a gate. **Recorded as a knowing departure.**

**關 renders two ways, on purpose.** *Barrier* for the single obstacle you break through
— case 1's 祖師關, the preface, the afterword's 掉臂度關. *Gate* for checkpoints passed in
sequence — case 47's three, whose title has always been "Three Gates of Tosotsu." The
distinction is functional, not accidental, and it is why case 38's buffalo can go through
a gate without colliding with case 1's barrier.

## 8. Method

Rules were applied by script with an exact-match, count-checked replacement for every
change, so that a silent partial match fails loudly rather than half-applying. After each
bulk pass the file was verified for: 51 `##` pages, 154 `###` sections, every `The Verse`
exactly four lines, no consecutive blank lines, no trailing whitespace, one trailing
newline, no dashes.

**That verification earned its keep.** A scripted sentence-case pass silently added a
second blank line after **every one of the 51 verses**. Since a blank line is a stanza
break in the build format, it would have shipped 51 spurious breaks.

Three independent read-throughs were run at the end, each blind to the editorial
decisions:

- a **cold reader**, instructed to read as someone who knows nothing about Zen and report
  every place they stumbled;
- a **consistency audit**, cross-referencing names, formulas, and repeated concepts across
  all 49 cases;
- a **syntax sweep** in two halves, reading every sentence against the single question
  "does this parse as English."

The cold read is the one worth defending as method. It caught what rule-based passes
structurally cannot: that the buffalo koan (case 37 then, 38 since the reorder) had no aperture in it, that case 40's verse
named a person who was never there, and — usefully against us — that case 28's restored
chiasmus *reads like a typesetting error* to someone who does not know the Chinese.

## 9. Known losses

- **Case 17's fourth line.** 赤腳上刀山, "climb the sword mountain barefoot," which the
  1934 English flattens to "you will be in trouble too." A vivid image reduced to a shrug.
  Not restored: restoring it is retranslation.
- **The buffalo koan's window lattice**, replaced by a gate (§7) — case 38 since the
  reorder.
- **無門 doing three jobs at once** — "no gate," the author's name, the book's title. Part
  One records this as the largest unavoidable loss in the translated matter; it is equally
  true across the cases.
- **Case 24's title** matches case 32's wording better than its own case's. Kept: the
  titles are what readers recognise.
- **Case 48's humps.** 兩箇駞子相撞著 sets up 世上應無直底人 — two bent things collide and
  neither is straight, so there is no straight man in the world. The English keeps Reps's
  deadlocked riders and loses the wordplay, knowingly: it is a choice of witness (CBETA
  2019 against the Taishō base), and the pun needs explaining in English before it lands,
  which is the end of it. The full reasoning, including why a "cancel each other out"
  rendering would invert the passage, is in Part Three §4 under case 48.

## 10. Narration

Each `###` section is baked to an audio file. The front matter sits under no `###`
heading and is therefore not narrated — which is fortunate, since it holds the markdown
link, `CBETA T48n2005`, `CC BY-NC-ND 4.0` and `NOTICE.md`.

**The file is now pure ASCII throughout** — straight quotes, no curly quotes, no
ellipses, and not one non-ASCII character anywhere, front matter and build comment
included. The last two went in August 2026: the macron on `Taishō`, which was the only
macron a reader ever saw in a book whose naming rule already spells every name bare
(*Joshu*, *Hyakujo*, *Tosotsu*), and `©`, now `(c)`. Neither was narrated, which is
exactly why they drifted — the ASCII discipline was enforced by the bake on the body and
by nothing at all on the front matter. `tests/book-md.test.js` now pins the property on
both the source and the generated page, and since the generated page carries the About
text, a curly apostrophe typed into `about_state.js` fails there too.

**Audition the Zen Warnings first.** Its eleven couplets depend on the line break after
each colon; without a pause there the section becomes a stream of contradictory fragments.
`108,000` (case 25) is the only comma-grouped numeral in a book that otherwise spells every
quantity out, and `1228` in the colophon follows a comma, where some engines read the digits
individually.

**A `##` page title costs a slug, never an mp3.** An earlier draft of this section said a
retitled page "may need narration keys rebuilt"; that is **wrong**, and the pre-bake sweep
of August 2026 established it. A narration unit is `CASES[id][section]` for
`case`/`comment`/`verse` only, and its file is `k{id}-{section}.mp3` — keyed by number and
section, never by title. A page title is not narrated at all, so retitling renames no file,
orphans no file, and does not by itself make a unit stale. (The rule that *does* bite is
about `###` **section** headings, per CLAUDE.md: those choose the key.) What a retitle does
cost is the **slug**, which derives from the title — so that page's saved marks and any
old deep link to it are dropped.

Retitled so far, all knowingly: **case 20** twice (The Enlightened Man → The Enlightened
Person in Part Two, then → **The Person of Great Strength** in §3), **case 22** (Kashapa's
→ Mahakashapa's Preaching Sign), the buffalo case (…Enclosure → …the Gate), **case 19**
(Everyday Life Is the Path → **Ordinary Mind Is the Path**), **case 33** (This Mind Is Not
Buddha → **Not Mind, Not Buddha**), **case 11** (Joshu Examines a Monk in Meditation →
**Joshu Tests Two Hermits**), **case 12** (Zuigan Calls His Own Master → **Zuigan Calls to
Himself**), **case 39** (Ummon's Sidetrack → **Ummon Catches a Slip**), **case 40**
(…Water Vase → **…Water Jug**), and **case 31** (Joshu Investigates → **Joshu Tests the
Old Woman**). The 37/38 reorder renumbered two pages but kept their slugs, and lost
nothing.

**Case 31's retitle is the one to learn from.** Nobody chose it: §4b changed 勘破 inside
the case from "investigate" to "checked her out" and "seen through", and the page went on
calling itself *Joshu Investigates* over a case in which nothing investigates. The final
read-aloud sweep caught it. **A word repaired in a case can strand the title above it**,
exactly as case 11's repaired comment stranded its own case — so after any wording pass,
read each changed page's title against its changed text.

---
---

# PART THREE — THE VERIFICATION OF THE FORTY-NINE CASES

August 2026. Part Two edited the 1934 English on its own terms; this part checked it
against the Chinese. Every case — case, comment, and verse — was read line against line
with **CBETA T48n2005** open (the same XML witness as Part One, retrieved again 19 August
2026 from the cbeta-org/xml-p5 repository). Until this pass, nobody had ever done that for
an edited-Reps text: the errors that read as good English were all still invisible.

Each divergence was classified **error** (the English asserts what the Chinese does not,
reverses a sense, or destroys the koan's mechanism — the class the §7 case-29 fix belongs
to) or **choice** (Reps's interpretation, compression, or voice — defensible, and part of
what this edition is). Errors were repaired, in the book's register, with the smallest
edit that restores the Chinese. Choices were recorded, not touched. A third pile —
divergences tangled with a page title, a diorama, or a genuinely disputed reading — was
**flagged and left alone**; those are listed in §3 and are editorial decisions, not
philology.

Where Part Two §7 said the edit reached the Chinese in two places, it now reaches it in
these places too. Every repair below is a knowing, recorded departure from the 1934 text.

## 1. A structural repair first: cases 37 and 38 are back in the Taishō order

In the Taishō (both the 目錄 at 0292c12 and the body), case 37 is 庭前柏樹 — Joshu's tree —
and case 38 is 牛過窓櫺, the buffalo. The 1934 Senzaki/Reps book printed them the other
way around, and the first draft of this pass left the 1934 order standing. **Reversed on
review, 20 August 2026: the edition now follows the original order** — 37 the tree, 38
the buffalo — since nothing recommends the 1934 accident over the order every other
edition shares. The dioramas, their tests and the k37/k38 modules swapped numbers with
their cases; slugs travel with the koan, so saved marks and deep links to both pages
survived. The narration units under both numbers are stale until the next bake, and every
"case 37's gate" reference elsewhere in this file now reads case 38.

## 2. The repairs

Each entry: the Chinese with its Taishō line, what the 1934 text said, what the book now
says, and why it was an error rather than a choice. All repairs are in
[gateless-gate.md](gateless-gate.md); the narration units they touch are stale until the
next bake.

**Case 1, comment (0293a11).** 好似法燭一點便著 — like a dharma-candle, one touch and it
lights. Was "as a candle burning and illuminating the whole universe": instant ignition
had become gradual cosmic glow. Now "like a candle that takes the flame at one touch."

**Case 1, verse (0293a14).** 喪身失命 — "you lose your body and your life." Was "you lose
your own Buddha nature" — invented, and doctrinally backwards (Buddha nature is exactly
what cannot be lost). Now literal.

**Case 2, comment (0293b06).** 便知得前百丈贏得風流五百生 — Mumon's punchline, that the
five hundred fox lives were a windfall (風流, grace, style), was dropped entirely by Reps.
Restored as "Then you will also see that the old man's five hundred fox lives were five
hundred lives of grace." 前百丈 is strictly "the former Hyakujo" — the old man as the
mountain's earlier abbot — simplified to "the old man" because the English case never
names him. ⚑ 風流 is contested ground — grace, style, splendor, worldly panache — and
"lives of grace" is the received English shape, not a uniquely literal one; it may land
on a published translator's wording and is listed with the coincidences at the end of
this file.

**Case 3, comment (0293b18).** 天龍同俱胝并童子。與自己一串穿却 — Tenryu, Gutei, the boy
*and you yourself* are strung on one skewer — a positive image: seeing it strings you on
with them. Reps had
"If anyone clings to a finger, Tenryu will be so disappointed that he will annihilate
Gutei, the boy, and the one who clings" — clinging, disappointment and annihilation all
invented; union had become punishment. Same class as the case-29 reversal.

**Case 3, verse (0293b22).** 巨靈擡手無多子 — the god raised his hand and it was 無多子,
no great matter. Reps's fourth line "Old Gutei is a poor imitator" appears nowhere in the
Chinese; the effortlessness became dispraise. Now "and thought nothing of it." The §5
line "a god once split a mountain with one hand" stands.

**Case 4, verse (0293b29).** 惺惺添懵 — it adds muddle to the wide-awake. Was "What an
absurd question!" — editorial comment where the Chinese makes a claim. Now "It muddles
even the wide-awake."

**Case 5, comment (0293c07).** 活却從前死路頭。死却從前活路頭 — the answer brings the dead
road to life AND puts the live road to death. Reps kept only the first half; the symmetry
is the content. Both halves now stand.

**Case 5, verse (0293c11).** 通身迸鬼眼 — demon eyes burst out over their whole bodies.
Was "lets tears stream from their dead eyes" — the tears invented, the bursting lost.

**Case 6, comment (0293c17).** 壓良為賤 — the slaver's idiom: passing free people off as
base. Was "He made the good listeners bad" (a §6 grammar repair on top of Reps's
misreading — the listeners did not become bad; he degraded them). Now "He passed good
people off as slaves," which also pairs with the dog-meat market fraud beside it.

**Case 6, verse (0293c25).** 迦葉破顏。人天罔措 — Kashapa's face breaks into a smile;
humans and gods are at a loss. Reps misread 罔措 (at a loss) as "can match" and 破顏 (a
breaking smile) as "wrinkled face," producing praise of a face. Now literal. 罔措 recurs
in case 24's verse and is now rendered "at a loss" both times.

**Case 8, case (0294a07).** 拈却兩頭。去却軸。明甚麼邊事 — take off both wheels, remove
the axle: what does that clarify? The demolition is total. Reps had "removed the hub
uniting the spokes," asked "what would become of the wheel?", and invented a second
question ("could he be called the master wheelwright?"). Now the full demolition and the
one real question. "A hundred spokes" restored from 一百輻 (Reps had rationalised it into
two wheels of fifty). 兩頭 is literally "the two ends"; the wheels are the received
referent, not the only possible one.

**Case 8, verse (0294a12).** 達者猶迷 — even the adept goes astray. Reps's line had lost
its negation by 1934 and §6 repaired it to "none can stop it" — completing Reps's
invention, since the Chinese has no stopping in it. Now "even the master loses his way."

**Case 11, case and title (0294b06–08) — found by reading the book aloud, after the
comment below had been repaired.** 趙州到**一庵主**處…**又到一庵主**處 — Joshu comes to
*a* hermit's hut, and then to *another* hermit's hut. **Two different men, one visit
each.** The 1934 English merged them into one monk visited twice ("A few days later Joshu
went again to visit the monk"), which costs the koan its mechanism: the point is that two
different men make the identical gesture and draw opposite verdicts, and with one man it
is only Joshu being inconsistent. It also left the repaired comment talking about "the two
hermits" over a case that had one monk in it — the contradiction that surfaced this. The
case now has both hermits, and 便行 is "went on" rather than "left". The page is retitled
**Joshu Tests Two Hermits**: 庵主 is a hermit in a hut, not a monk in meditation (that was
Reps's addition), and naming the two prepares the ear for the mechanism. **The verb was
"Examines" for a day and should not go back.** That was Reps's word, kept to keep the page
recognisable, but "examine a person" in current English is a doctor, a barrister or an
examining board, and none of them is a master calling at a hut. "Tests" is the plain
English for what 勘 does in Chan — probing what someone has — and the book already uses it
that way in case 17 ("to test his pupil"). It also sets the reversal up: the title says
Joshu tests them, and the comment says they saw through him, which is 勘破, the same
character coming back the other way. ("Visits" was considered and dropped: true to the
action, but it loses the testing the koan is made of.) 勘 is "investigates" in case 31's
title and "tests" here, per §5's rule that a word is chosen for the sentence it is in.
Slug moved with the title; `src/koans/k11.js` records why the diorama still stages one
figure.

**Case 11, comment (0294b13–15).** 爭奈趙州却被二庵主勘破 — and yet Joshu was himself seen
through by the two hermits. Reps: "Yet perhaps Joshu is wrong. Or, through that monk, he
may have discovered his mistake" — wrong agent, wrong direction, and hedged. And the
double bind that follows kept only one horn; 若道無優劣。亦未具參學眼 ("…no difference —
you also lack the eye") is restored, since the two horns are the koan.

**Case 12, case and comment (0294b20).** 惺惺著 — "Be wide awake!" Was "Become sober,"
which in current English points at alcohol (§5's own register test), and the same 惺惺 is
"wide awake" in this book's Zen Warnings. Now "Wake up." in both places.

**Case 12, verse (0294b26).** "The true man in a mask" — the mask was Reps's, carried in
from his comment image; 不識真 has no mask. Now "the true man."

**Case 13, case (0294c03).** 巖頭密啟其意 — Ganto secretly disclosed his meaning to him.
Was "Ganto admitted this indirectly" — erases the secret disclosure the story turns on.
Now "Ganto secretly made his meaning known to him." (A first repair said "whispered";
密 gives the secrecy, not the means — a whisper is a detail the text does not supply.
Softened on review.)

**Case 13, verse (0294c11).** 末後與最初。不是者一句 — the last and the first are NOT this
one phrase. Reps: "are they not the same?" — a negation turned into a rhetorical
affirmation, the same class as the case-29 fix. Now "they are not the same."

**Case 16, comment (0295a14).** 切忌隨聲逐色 — above all, do not chase sounds and forms.
Was "you need not follow" — a prohibition weakened to non-necessity. Now "must not chase."
(The same 切忌 weakening in case 30's verse is repaired below.)

**Case 17, comment (0295a29).** 國清才子貴 — when the state is at peace, its talents are
prized. Was "When the country is prosperous everyone is lazy" — 貴 (prized) had become
laziness, garbling the aphorism's parallel with the spoiled children.

**Case 19, comment (0295b19).** 南泉被趙州發問。直得瓦解氷消。分疎不下 — questioned by
Joshu, NANSEN crumbles like tiles and melting ice and cannot explain himself. Reps flipped
it: "Nansen could melt Joshu's frozen doubts at once." The following sentence's "I doubt
though if Joshu reached the point that Nansen did" was also invented (縱饒悟去。更參三十年
始得 compares Joshu to nothing). Mumon needles both men; the English had him praising one.

**Case 21, comment (0295c07).** 家貧難辨素食。事忙不及草書 — too poor to put together even
a plain meal, too busy even for cursive (the fast script — no time even to scribble).
Reps read 辨 as "distinguish the taste" and 草書 as fair-copy letters. And 佛法興衰可見 —
"you can see the rise and fall of the Dharma" — had become "his teaching was just as
useless." Now the poverty, the scribble, the propped gate (撑門拄戶, the same idiom as
case 17's verse) and the deadpan.

**Case 22, case (0295c14).** 倒却門前剎竿著 — take down the flagpole in front of the gate.
Reps added "and put up your own," inventing a succession-advertisement the cut deliberately
lacks. "Preaching sign" stays — it is the title's word — but nothing goes up.

**Case 22, verse (0295c21).** 兄呼弟應揚家醜 — brother calls, brother answers, *airing the
family shame*. The sting was dropped; case 34's comment keeps the same idiom. Restored.

**Case 23, case (0295c25).** 悚慄 — trembling with fear (Emyo, unable to lift the robe).
Was "for shame"; the shame comes two lines later, the shudder is fear.

**Case 25, case (0296a24).** 諦聽諦聽 — "Listen carefully! Listen carefully!" Was "Do you
understand?" — an imperative turned into a question.

**Case 26, case (0296b03).** 一得一失 — "One gain, one loss." The master does not say
which monk. Reps assigned it ("The state of the first monk is good, not that of the
other"), which guts Mumon's own question three lines later — 且道是誰得誰失, "who gained
and who lost?" — the question the koan runs on.

**Case 26, comment (0296b06).** 切忌向得失裏商量 — above all, do not weigh it out in gain
and loss: an order to the reader, not (as Reps had it) Mumon declining a topic.

**Case 27, comment (0296b14).** 郎當不少 — "It left him in no small mess." Was "He must
have been greatly upset." The same phrase in Meng Gong's colophon is translated in Part
One as "makes no small mess of it"; the two now agree.

**Case 28, case (0296b24).** 不疑天下老和尚舌頭 — never again doubt the tongues of the old
masters of all the world. Reps narrowed the vow to "the teacher's words" — one man. The
claim is universal, which is what makes it worth doubting.

**Case 28, comment (0296c11–13).** Two images restored. 憐兒不覺醜 — a doting parent
cannot see the child's ugliness (was "so kind he forgot his own dignity" — the blindness
is to Tokusan's faults, not his own dignity). And 見他有些子火種。郎忙將惡水驀頭一澆澆殺 —
seeing one live ember, he doused it dead with slop water — Mumon's reading of the
blown-out candle. Reps had "pouring muddy water over a drunken man to sober him": no
drunk, no sobering, and the act is extinguishing, not reviving. 冷地看來一場好笑 is now
"Looked at coldly, the whole thing is one good laugh."

**Case 28, verse (0296c16).** 雖然救得鼻孔。爭奈瞎却眼睛 — he saved his nose but went
blind. Was "His nose was very high, but he was blind after all" — 救得 (rescued) misread
as pride. The paradox — the saving cost the eyes — is the verse.

**Case 30, comment (0297a02).** 大梅引多少人錯認定盤星 — Daibai has led many to misread
the 定盤星, the zero-marker on a steelyard: to be cheated on the weight. Was "has given
many a pupil the sickness of formality" — invented. The same idiom in case 46's verse
(below) now uses the same English.

**Case 30, verse (0297a06).** 切忌尋覓 — "never go searching around." Was "you need not
search around"; same 切忌 repair as case 16.

**Case 31, verse (0297a19).** 問既一般。答亦相似。飯裏有砂。泥中有刺 — the question was
the same, the answer alike; sand in the rice, thorns in the mud. Reps read 一般 (the same)
as "common" and rebuilt lines three and four into similes about question-types. The flat
parallel — hidden grit inside a plain exchange — is restored, keeping Reps's bowl and mud.

**Case 32, case (0297a22).** 世尊據座 — the Buddha held his seat. Was "kept silence"; the
answer is the seated presence, and silence is what the outsider ruled out.

**Case 32, comment (0297a27).** 宛不如外道見解 — clearly fell short of the outsider's
understanding. Was "did not go beyond" — strictly-worse had become at-most-equal.

**Case 32, verse (0297b02).** 懸崖撒手 — hanging from the cliff, let go: the release. Was
"Walk over the cliffs with hands free" — confident strolling where the Chinese lets go of
the last hold.

**Case 33, case (0297b04).** 非心非佛 — "Not mind, not Buddha." Two negations, the flip of
case 30's 即心即佛. Reps's "This mind is not Buddha" is a different, single statement, and
it made case 33 nearly indistinguishable from case 34's 心不是佛. The title keeps the 1934
wording (§3 below).

**Case 33, verse (0297b07).** 路逢劍客須呈。不遇詩人莫献 — meeting a swordsman you MUST
present the sword; NOT meeting a poet, do NOT offer the poem. Reps dropped both the
obligation and the negation ("you may give… you may offer"), flattening the asymmetry
that is the couplet's point.

**Case 34, verse (0297b14).** 雨下地上濕 — when rain falls, the earth is wet. Was "when
the earth is parched rain will fall" — providence where the Chinese is a truism, and the
truism's banality is the teaching.

**Case 35, comment (0297b19).** 切莫亂走 — "do not go running wildly about" — restored
between the failure and the boiling crab; it is the instruction the crab illustrates.

**Case 36, comment (0297b29).** 也須一切處著眼 — you must keep your eye on it everywhere.
Was "you should look about without seeing anything" — near-opposite: watchfulness
everywhere had become vacant gazing.

**Case 36, verse (0297c03).** 直下會便會 — understand right there, and you understand. Was
"and you will be called one who understands Zen" — the punch had become a credential.

**Case 37, verse (0297c11)** — Joshu's tree, case 38 before the reorder. 滯句者迷 —
stuck in the phrases, you go astray. Was "if you try to explain with words, you will not
attain enlightenment in this life" — the lifetime sentence invented.

**Case 24, verse (0296a20).** 進步口喃喃。知君大罔措 — press forward chattering and you
(the reader) will be utterly at a loss. Reps aimed it at Fuketsu and invented embarrassed
listeners. Lines one and two, which are genuinely ambiguous about their subject, stand.

**Case 39, comment (0297c27).** 自救不了 — you cannot even save yourself. Was "perceive
yourself"; 救 is save.

**Case 42, case (0298a28).** 云何女人得近佛坐。而我不得 — how may this woman sit close to
the Buddha's seat, when I may not? Reps recast the question as attainment of her state;
the Chinese asks about the seat.

**Case 42, verse (0298b12–13).** 渠儂得自由 — freedom, whoever the subject is (渠儂 is
Song colloquial "that one," and readings split between the two bodhisattvas and the girl;
the English commits to neither: "Freedom, either way"). Was "Neither is a good actor" —
freedom granted had become skill denied. And 敗闕當風流 — the fiasco passes for style —
was "Had both failed, the drama still would be a comedy," an invented conditional; now
"The fiasco itself made a fine performance."

**Case 43, verse (0298b22).** 佛祖乞命 — buddhas and patriarchs beg for their lives. Was
"cannot escape this attack." The Chinese repeats the preface's 乞命, and the book's own
preface already has "beg for their lives"; the echo is now audible in English.

**Case 46, verse (0298c18).** 錯認定盤星 — "you will misread the marker on the scale."
Was "you will cling to the measure of the hundred feet" — invented, and inconsistent with
case 30's rendering of the same idiom.

**Case 47, case (0298c23–24).** 便知去處…向甚處去 — you should know where you are GOING;
where are you going? Was "know where you are… Where are you?" — the destination had become
a location. The third gate asks about the journey after death.

**Case 48, case (0299a05).** 東海鯉魚打一棒。雨似盆傾 — strike the carp of the Eastern Sea
one blow and the rain pours like an upturned basin. Reps had the carp "tipping over the
rain-cloud with his tail" — tail and cloud invented, the blow and the basin gone. Reps's
"Dragon Carp of the Eastern Sea" is kept.

**Front matter.** The "This edition" paragraph now states the verification: every case
checked line by line against the Chinese, and repaired where the 1934 rendering strayed.
That sentence is the claim this part of the file substantiates.

## 3. The seven flagged items, and how each was ruled — 20 August 2026

All seven were put to the author and resolved the day after the pass. The rulings:
restore the Chinese wherever the 1934 text is wrong, and retitle wherever the title is
wrong — titles included, deliberately, knowing that slugs derive from titles, so a
retitled page orphans its saved marks and old deep links.

1. **Case 2 — 不昧因果 (0293a22). REPAIRED.** Hyakujo's answer now reads "The enlightened
   person is not blind to the law of causation" (case and comment both), restoring the
   one-character flip against 不落 "is not subject to." The verse now carries the same
   pair — "Not subject, not blind: / the same die shows two faces. / Not blind, not
   subject: / a thousand errors, ten thousand errors" (千錯萬錯 literal) — where Reps had
   a third rendering, "controlled," and "both are a serious error."
2. **Case 18 — the weighing scene. REPAIRED in the text, kept in the art.** The case is
   now the bare exchange the Chinese is: "A monk asked Tozan: 'What is Buddha?' / Tozan
   said: 'Three pounds of flax.'" The weighing is the commentators' traditional staging;
   the k18 diorama keeps it as this page's illustration, and the module's header records
   the split. Title unchanged ("Tozan's Three Pounds" is exact).
3. **Case 19 — 平常心是道. REPAIRED AND RETITLED.** The page is now "Ordinary Mind Is the
   Path"; Nansen answers "Ordinary mind is the path"; the exchange runs on aiming (還可
   趣向否 "Can it be aimed at?", 擬向即乖 "If you aim for it, you will be far away from
   it", 不擬 "If I do not aim for it…"), and 不擬之道 is "the true path beyond aiming" —
   the callback restored. Slug changed with the title.
4. **Case 20 — 大力量人. REPAIRED AND RETITLED.** Now "The Person of Great Strength";
   the question is the strongman paradox, "Why can the person of great strength not lift
   their leg?" (擡脚不起), the second utterance "It is not with the tongue that we speak"
   (開口不在舌頭上), and the verse asserts instead of supposing: "One lift of the foot
   turns the great ocean over; / one bow of the head looks down on the heavens" (踏翻
   treads it over — a first repair said "kicks," which 踏 does not say; softened on
   review).
5. **Case 33 — the title. RETITLED** to "Not Mind, Not Buddha," matching the repaired
   body and the Contents pairing against case 30's "This Mind Is Buddha."
6. **Case 41 — 謝三郎不識四字 (0298a21). REPAIRED.** Now "Ha! Sha Sanro cannot read even
   four words" — the line translated as it stands, and 字 rendered "word" as case 1
   already renders 無字 ("this one word, Mu"). **Revised again after a read-aloud pass:
   the shipped line is "Ha! And Bodhidharma could not read four words."** A name no
   reader can place, dropped into the last sentence of a comment, is a non-sequitur in
   English where it is an allusion in Chinese — and this edition elsewhere drops exactly
   such names (Fan Dan, Xiang Yu, Zhang Zhuo, General Guan are all unnamed, §4). What is
   left is the commentarial reading itself: the jab lands on Bodhidharma, whose answer to
   Emperor Wu was 不識, "I do not know." That commits to one reading of a contested line,
   which is why it is written down here. The verse's 事因囑起 also reads "began with that
   entrusting" rather than "the handing-down", which was a noun the ear could not hold. The research that settled it: 謝三郎 is the proverbial illiterate ("knows the
   three characters of his own name and not a fourth"), and the Japanese commentarial
   tradition points the jab at **Bodhidharma himself**, whose famous answer to Emperor Wu
   was 不識, "I don't know" — a compliment-shaped jab at not-knowing, which Reps's
   "brainless disciples" inverted into plain insult. The verse is also repaired: 事因囑起
   "The whole affair began with the handing-down," 撓聒叢林 "The uproar that fills the
   monasteries," and 元來是爾 "was you, all along" — the direct address restored, its
   target left as open as the Chinese leaves it.
7. **Case 49 — REPAIRED throughout the case proper.** The sutra line reads "Stop, stop.
   Do not speak. My teaching is subtle, beyond all thinking" in both places; 妙從何有 is
   "Where does its subtlety come from?"; 豈但豐干饒舌。元是釋迦多口 is "It was not only
   Bukan whose tongue ran loose: Shakyamuni himself was all mouth" (豐干 takes the
   Japanese reading, Bukan of the Kanzan-Jittoku trio); the spook-and-kudzu sentence
   (造作妖怪…葛藤纏倒) is restored in place of Reps's "persons like Mumon… fry up useless
   cakes"; the dropped 匙挑不上。甑蒸不熟 ("no spoon can lift it, no steamer can cook it
   through") and the bystander's question (傍人問云) are back; the little circle is drawn
   **around the words "beyond thinking"** (却急去難思兩字上), which Reps had as "on the
   sutra"; and 維摩不二門 is "Vimalakirti's gate of not-two" — Reps's "Vimalakirti's
   gateless gate" had conflated the nonduality gate with this book's own title. The verse
   follows the Chinese: "If anyone tells you fire is the lamp, / turn your head away and
   do not answer. / Only a thief knows a thief: / one question, and he owns it at once"
   (一問即承 — the thief confesses at one question; Reps's "without question" inverted
   it). The first paragraph of the case — Reps's loose rendering of Amban's letter — is
   untouched: the careful translation of the letter closes the afterword, and the book's
   blurb owns the doubling.

## 4. Divergences recorded as choices — checked, and left as Reps

By case. These are compressions, glosses and voice, not errors; several are the book's
charm. None should be "fixed" without rereading §2 of Part Two first.

- **1** — the naming sentence 遂目之曰禪宗無門關 (Mumon christening the book after Mu),
  the tangled eyebrows (眉毛廝結), the 360 joints and 84,000 pores, and General Guan's
  sword (關將軍大刀 → "a great warrior with a sharp sword") are all compressed away; verse
  line 2 replaces 全提正令 ("the full presentation of the true imperative") with "This is
  the most serious question of all."
- **2** — 大修行底人 "person of great practice" → "the enlightened person" (see §4 of
  Part Two); Obaku's question reframed around "some modern master." (The verse's
  "controlled" pair was repaired under §3's first ruling; its line 2, 兩采一賽 — "two
  throws, one game," a gambling idiom — stays as Reps's "the same die shows two faces.")
- **4** — the bearded picture is Reps's scene-setting (the Chinese only asks why the
  Western barbarian has no beard); 早成兩箇 "it has already become two" → "you never saw
  him at all."
- **5** — (Reps's "ego-killing" gloss on 惡毒 was replaced in §4b; the verse now reads
  "poison without limit".)
- **6** — Mahakashapa "tried to control the lines of his face" is invented psychology;
  傍若無人 → "thought he could cheat anyone"; 誑謼閭閻 → the "city slicker" line, swept in §4c.
- **7** — the flat assertion 者僧聽事不真。喚鐘作甕 is softened to "I doubt… I hope"; the
  verse's lantern-seeker is Reps unpacking 燈是火 into an anecdote.
- **9** — 大通智勝佛 unnamed ("a Buddha who lived before recorded history"); 其問甚諦當
  ("a thoroughly apt question") → "self-explanatory"; 為伊不成佛 ("because he does not
  BECOME a buddha") → "He was not a Buddha"; the verse's immortal-without-a-fief →
  "desire no praise."
- **10** — Fan Dan and Xiang Yu genericized to "poorest/bravest man in China"; "You have
  Zen" is an explanatory insert; 活計雖無 is "no livelihood at all," slightly softened.
- **11** — 肯一箇不肯一箇 does not say which fist was approved; Reps assigned
  first/second. 殺人刀／活人劍 (two blades) merged into one sword — the received
  interpretation, kept.
- **13** — 末後句 "the last word" → "the ultimate truth" throughout; the cheeky 老漢 and
  the unrung bell dropped; 一棚傀儡 "a stageful of puppets" → "dummies", repaired in §4b.
- **14** — "boldly" is added to the cut; 險 ("danger!") → "you should watch your own
  head." Both keep the force.
- **15** — 三頓棒 is three ROUNDS of the staff, not three blows (title says blows; kept);
  飯袋子 "rice-bag!" → "good for nothing", repaired in §4c; 江西湖南 → "one monastery to another"; 與洞山
  出一口氣 ("vindicate Tozan / breathe one breath with him") → "eat the same food as
  Tozan"; 草木叢林皆合喫棒 ("the grasses and trees all deserve the staff" — with 叢林
  punning on "monastery") → "every one of you."
- **16** — "It is not true Zen" is added; 騎聲蓋色 "rides sounds and caps forms" →
  "controls"; the verse personalizes 事同一家 ("all things one family") into
  family/stranger. The chiasmus survives.
- **17** — 辜負 is "apologize" here but "disappointed yourself" in the afterword (same
  word; inherited); verse lines 1–2 are a Reps rewrite and line 4 is §9's known loss —
  all left with it.
- **22** — 靈山一會 ("the Vulture Peak assembly, solemnly not yet dispersed") → "the old
  brotherhood still gathering" (case 6 translates 靈山); Vipasyin Buddha's gāthā
  genericized.
- **23** — 本來面目 "original face" → "true self" throughout (iconic; consistent); the
  grandmother of 老婆心切 dropped ("certainly was kind"); the lychee generic; 擲 "flung"
  → "placed."
- **24** — the technical 語默涉離微 simplified to "without speaking, without silence";
  verse lines 1–2 ("another's words, not his to give") import the comment's borrowing
  theme into a genuinely ambiguous couplet.
- **25** — 離四句絕百非 → "transcendent, above words and thought."
- **26** — the meditation-screen detail is added; verse line 4 綿綿密密不通風 ("airtight,
  no wind gets through") → "retire from every wind."
- **28** — 天下人不奈伊何 and the solitary peak are loose; "in comparison with this
  enlightenment" added twice to the torch speech; the verse's 聞名/見面 (name/face)
  became the cousin proverb about hearings and seeings — the chiasmus itself was restored
  in §2 of Part Two.
- **29** — 二僧悚然 (the monks shudder) still ends the Chinese case, not the English;
  "passing by" added; 一狀領過 ("convicted on one indictment" — the courtroom register of
  據欵結案) → "the same understanding"; 忍俊不禁一場漏逗 ("could not hold back — one
  grand leak") → the dull-heads bargain.
- **31** — 臺山 is Mount Wutai (glossed as "a popular temple"); 好箇師僧又恁麼去 ("a fine
  monk, and off he goes like that") → "He also is a common pilgrim"; 著賊 ("got robbed")
  expanded into the spy image; 無大人相 → "not an able general."
- **32 — repaired, not a choice, August 2026.** 外道 is one word used four times, and Reps
  gave it two Englishes: "philosopher" in the title and case, "outsider" in the comment. The
  koan turns on inside against outside — a non-Buddhist understands where the Buddha's own
  disciple does not, and the comment asks 外道與佛弟子相去多少, how far apart the outsider and
  the disciple are. "Philosopher" cannot carry that, since a philosopher is not defined by
  standing outside. **Now "outsider" throughout, and the page is retitled An Outsider Asks
  Buddha.** (§5 once objected that "outsider" reads as a compliment now; that was 外道 as a
  wrong *path*. Here it is plain category, and the disciples-and-outsiders pairing settles it.)
- **35** — the Tang tale is unpacked into the case (the Chinese is one line); 萬福萬福
  ("Blessings! Blessings!" — a deadpan felicitation) → "Each is happy in its unity and
  variety."
- **37** (the tree, since the reorder) — 柏樹 is a cypress/juniper; "oak" is the 1934
  book's famous rendering, kept with its title.
- **38** (the buffalo, since the reorder) — 顛倒 dropped from "open one eye upside-down";
  被壞 ("is ruined") → "will be butchered." The gate itself is §7's recorded departure.
- **39** — Graduate Zhang Zhuo (張拙秀才) unnamed; 孤危 ("solitary and steep") →
  "particular skillfulness."
- **40** — 大溈 (Mount Gui) → "a new monastery"; 重關 "double barrier" → "a barrier";
  佛如麻 "buddhas thick as hemp" → "everything, even the Buddha."
- **41** — 六根不具 ("not all six faculties intact," wry) → "lost his arm and was
  deformed"; 為汝安心竟 (a completed act: "There — I have finished pacifying it") → a
  state ("is pacified already"). The punchline and verse were repaired under §3's
  sixth ruling.
- **42** — **resolved, August 2026, and no longer a choice.** 不通小小 was not mistranslated
  by Reps; it was **dropped**, and "set a very poor stage" rendered 做者一場雜劇 alone. The
  readings of 不通小小 split over whether the play is contemptible ("a farce — and no small
  one") or admirable ("not in the least petty"), but **both agree it is not small**, so the
  restored clause is the part that is not in dispute. The English is now "staged a whole
  farce here, and no small one": 雜劇 is the genre — a variety-play — rather than Reps's
  verdict on its quality, and "no small one" survives either reading. 那伽大定 (the naga's
  samadhi) and 業識忙忙 stay simplified.
- **45** — 釋迦彌勒 → "the past and future Buddhas" (case 37's comment names them); 奴
  "slaves" → "servants."
- **46** — 𢬵身能捨命 ("ready to fling away body and life") concretized to jumping; 嗄 (the
  grunt) → "Look out!" (The 麁飡易飽 line listed here was case 47's, not this one; corrected
  20 August 2026 when the bake list showed k47-comment changing.)
- **47** — 設三關問學者 ("set three barriers to question students") → "built three gates
  and made the monks pass through them" (the book's imagery, kept); 撥草參玄 ("parting
  the grasses to seek the profound") → "studying Zen."
- **48 — examined properly in August 2026 and deliberately left alone. Do not reopen it
  without reading this.** 兩箇駞子相撞著。世上應無直底人 → "two riders neither of whom can get
  ahead of the other. It is very difficult to find the right person." Both halves are
  Reps's invention, and there is a real joke under them: **駞 is humped** (CBETA's 2019
  emendation, from 柳幹康's collation of the Muromachi manuscript), which sets up **直,
  straight**, in the very next clause. That the emendation makes the couplet cohere is
  itself an argument for it; the Taishō prints 馳, a galloper, which is where Reps's
  "riders" came from and which leaves the 直 line hanging on nothing.
  **What the joke is, and is not.** It is *not* cancellation — two humps meeting and
  levelling out. It runs the other way: two bent things blunder into each other and
  **neither of them is straight**, so you would conclude there is no straight man anywhere.
  The sentence Mumon writes next settles it — 二大老總未識路頭在, "neither of these two old
  men knows where the road is." He is disparaging both masters, not describing a
  resolution. Any English built on "they cancel each other out" therefore **inverts** the
  passage: cancellation yields something straight, and the Chinese insists nothing is.
  **Not restored, for two independent reasons, either of which would be enough.**
  (i) It is a **choice of witness**, not a mistranslation — following CBETA's 2019 reading
  against the Taishō base text is a different kind of decision from every other repair in
  Part Three, and this edition has no standing to make it silently.
  (ii) **The wordplay does not survive into English.** It needs the reader to hold "humped"
  and "straight" as one word's opposite, and an English reader has to be told that before
  it lands, at which point it is not a joke.
  Reps's version keeps the one thing that does carry, the deadlock between two masters, and
  crucially it does **not** assert the resolution the cancellation reading would. So it
  stands. Recorded in §9 as a known loss rather than repaired.
  (A wave image was floated for the collision and dropped on a second ground: this same
  comment already has 立白浪滔天, "raises waves that almost touch heaven," three sentences
  earlier, and the preface and case 41 both use 無風起浪, raising waves where there is no
  wind. A fourth wave here would read as a callback to those.)
  Also inherited: verse lines 3–4 (機先, 向上竅) paraphrased.
- **49** — the letter appears twice by design (Reps's rendering opens the case, the new
  translation closes the afterword — the book's blurb owns it), and that first
  paragraph stays Reps's voice, including "as a bargain" where the letter's 大衍
  allusion lives. Everything from the sutra quotation onward was repaired under §3's
  seventh ruling.

## 4d. The choices re-examined — 20 August 2026

§4 sorted every divergence into **error** (repaired) or **choice** (left as Reps). That
sorting was one judgement per item, made while deliberately calibrating AGAINST
over-correction — so its predictable failure mode is not false alarms but **under-calls**:
things filed as voice that are really meaning. All 34 cases carrying a recorded choice were
read again, cold, against one question: *did this get let off too easily?* **Five had.**

- **Case 9 — 其問甚諦當.** Seijo *praises* the question: it is thoroughly to the point.
  Reps has him deflect it — "Your question is self-explanatory" — which is a different
  speech act, and it leaves him dodging and then answering anyway. Now **"That question is
  very much to the point."**
- **Case 9 — 為伊不成佛.** "Because he does **not become** a buddha." Reps: "He was not a
  Buddha" — a historical fact where the Chinese has the koan's whole point, that
  buddhahood is not a thing one becomes. Now **"Because he does not become a Buddha."**
- **Case 47 — 麁飡易飽。細嚼難飢.** The clearest of the five, and an **inversion**. The
  Chinese is advice about eating: coarse fare fills you *easily*, chewed fine it is hard to
  go hungry. Reps made it a threat of deprivation — "living on poor food, and will not have
  even enough of that to satisfy you" — turning 易飽, *easily filled*, into not enough.
- **Case 26 — 綿綿密密不通風.** Seamless and close, so no wind gets through: a state so
  complete nothing penetrates it. Reps: "retire from every wind", which is withdrawal, very
  nearly its opposite. 爭似從空都放下 ("how much better to let it all go from the emptiness")
  was also flattened to "forget the great sky", and both lines are now restored.
- **Case 29 — 一狀領過.** Courtroom language, like 據欵結案 in the afterword: wind, flag and
  mind are **convicted on a single indictment**. Reps's "the same understanding" makes them
  share an insight rather than share a guilty verdict.

**Confirmed as genuine choices on the second look**, so the record is not one-sided: case
11 (Reps assigns which fist was approved, but the case itself establishes the order), case
14 (險, "danger!", as "watch your own head" — keeps the force), case 22 (Reps redirects
毘婆尸佛早留心 from Vipasyin to the reader, but keeps its force, and naming Vipasyin would
break this edition's own rule against unglossed names), case 47 (撥草參玄 compressed).

**Five under-calls in 34 cases is the honest error rate of the sorting**, and it is recorded
here rather than quietly fixed, because it bounds how much the rest of §4 should be trusted.
A third pass would likely find one or two more.

## 4b. The modern-register pass — August 2026

A second read-aloud pass, on a different question from §2's: not "does the English say
what the Chinese says" but **"does a reader in 2026 hear what Reps meant."** These are
places where the 1934 wording was defensible when it was written and has since drifted, or
where it was always philosophy-department English. Nothing here was found by comparing
characters; it was found by listening. The trigger was case 11's title, where "examines"
was accurate to 勘 and wrong in current English.

**Words whose modern sense points somewhere else:**

- **Case 13 — "dummies" → "a stage full of puppets."** 一棚傀儡 is a *stage of puppets*,
  and in 1934 a "dummy" was a mannequin or a ventriloquist's figure, so Reps was exact.
  The word has drifted to mean fools, which makes Mumon call two masters stupid when he is
  saying they are worked on strings. **The clearest case in the book of the English moving
  while the Chinese stood still.**
- **Case 40 — "water vase" → "water jug", title included.** 淨瓶 is the monk's water
  pitcher. "Vase" puts flowers on a table, so the koan became a man kicking over an
  ornament instead of a working tool. `src/kit/vase.js` keeps its name and records why.
- **Case 31 — "investigate" → "check out" / "see through", and the title with it.** 勘破 is
  *to see through* someone. "I have investigated that old woman" reads as police procedure
  now, and faintly sinister with it. The page had to follow: it was still called *Joshu
  Investigates* over a case in which nothing investigated, so it is now **Joshu Tests the
  Old Woman** — 趙州勘婆, the same 勘 as case 11, and the pair now shows in English what it
  shows in Chinese.
- **Case 39 — "sidetracked" → "slipped", and the title with it.** 話墮 is *words fallen*:
  the monk is caught out by his own speech, mid-quotation. "Sidetrack" is a railway
  metaphor that now means merely distracted. **And the title had the wrong man**: Reps's
  "Ummon's Sidetrack" reads as Ummon going astray, when the slip is the monk's and Ummon
  only calls it. The page is now **Ummon Catches a Slip**.
- **枷 had three Englishes and now has one.** It is the cangue, the collar locked round a
  prisoner's neck: "iron stocks" in case 17's verse and case 40, "a board around your neck"
  in the Zen Warnings. All three now read **yoke**. Not "board", which was the standing
  choice: 鐵枷 wants its metal, and "an iron board" is an ironing board. A yoke sits on the
  neck and is *carried*, which is what 擔 says in both places.

**The 1930s psychology, which dated the book faster than anything else in it.** None of
these compounds is in the Chinese:

- **Case 1 — "your ego-shell is crushed"** for 驀然打發。驚天動地, which is "it breaks open
  all at once; heaven is startled and the earth shakes." The shell was Reps's own.
- **Case 5 — "ego-killing poison"** for 惡毒無盡限, "malice without limit" — now "poison
  without limit." "Ego-killing" was a benign gloss on a word that is not benign.
- **Case 12 — "ego-soul"** for 識神, the discriminating consciousness — now "the thinking
  mind." "Ego-soul" sends a reader to Theosophy.

**Philosophy-department English, the fault Part Two §1 named and did not finish:**

- **Case 2 — "Because that answer clung to absoluteness"** is **not in the Chinese at
  all.** The old man says he answered so and fell into a fox's body; Reps inserted an
  abstraction at the hinge of the book's most famous cause-and-effect koan. Cut.
- **Case 16 — "actualizes the truth in everyday life"** for 頭頭上明。著著上妙 — now "clear
  about each thing, sure of every move." Reps's "controls sound, color, and form" **stays**
  in front of it. A first attempt replaced that too, with the literal 騎聲蓋色 ("rides on
  sound and covers form"), and the pre-bake read caught it as a step backwards: more
  faithful to the characters, and opaque to anyone hearing it once. This pass is about what
  a reader receives, so where the literal is the harder read, the literal loses.
- **Case 9 — "ten cycles of existence"** for 十劫 — now "ten ages", which is also the
  book's own word for a long span (cases 22, 35, and the Zen Warnings).

**Smaller:**

- **Case 1 — "a tangled ghost" → "a ghost clinging to grass and trees"** (依草附木精靈, a
  spirit with no body of its own that leans on whatever it can). The clinging is the
  insult, and "tangled" lost it.
- **Case 22 — "golden-woven robe" → "golden robe."** "Successorship" stays: the robe needs
  to say what it is for, or a reader wonders why a garment is the question.
- **Case 25 — "hitting the gavel" → "struck the block."** 白槌 is the wooden block struck
  to open a talk; a gavel puts a judge or an auctioneer in the room.
- **Case 49 — "add one more as a bargain" → "add one more and round the count out to
  forty-nine."** "Bargain" now means a discount. The real joke is the number, and the
  afterword's translation of the letter already carries it; this makes the case agree with
  it instead of shopping.
- **Case 12's title — "Zuigan Calls His Own Master" → "Zuigan Calls to Himself."** He calls
  "Master!" to himself and answers himself; the old title reads as summoning a teacher.

Three of these move a title, and slugs derive from titles, so cases 12, 39 and 40 lose
their saved marks and old deep links, knowingly, as cases 19, 20 and 33 did in §3.

## 4c. The Reps voice, swept — 20 August 2026

Part Two §5 kept Reps's Americana on the reasoning that "it is a translator's voice, not
sloppiness, and stripping it makes the book more neutral and less alive." **That decision
assumed the book was edited Reps.** Once the cases had been checked against the Chinese
throughout, the Chinese became the controlling text and Reps the draft that survived where
it was accurate — and a preserved 1930s voice stopped being the thing the edition was for.
The rationale was reopened on that ground and six places went.

**Every one is defensible on accuracy alone**, which is why these six and not others: each
stands where the Chinese has content that Reps replaced with period idiom or with filler.

- **Case 6** — 誑謼閭閻, swindling the people of the lanes. Reps's *"like a city slicker
  cheating a farm boy"* is a 1930s pairing with no counterpart in the Chinese. Now **"he is
  swindling the whole village."**
- **Case 15** — 飯袋子, *rice bag*, a stock Chan insult: you are a sack for rice to go into.
  Flattened to *"You are good for nothing."* Now **"You sack of rice."**
- **Case 15** — 未是性燥, not quick-natured, slow off the mark. Reps read it as intelligence:
  *"he wasn't so smart."* Now **"He was no quick study, even so."**
- **Case 20** — 何故𦗚 is a real question with a Chan interrogative particle prodding for an
  answer, and 要識真金。火裏看 is the assay idiom: fire is the **test**, not a medium you peer
  through. Reps had *"Why, look here, to test real gold you must see it through fire."* Now
  **"Why is that? If you want to know real gold, look in the fire."**
- **Case 40** — the **same** 何故𦗚, which Reps costumed differently as *"Why, can't you
  see."* Now **"Why is that?"**, so one Chinese phrase finally has one English.
- **Case 48** — 正眼觀來, *seen with a true eye*, replaced by the filler *"Frankly."* Now
  **"Seen with a true eye."**

**Three candidates were examined and kept.** *"Overplayed his hand"* (case 10) and *"turned
the tables"* (case 31) read as dated but are ordinary current English. *"Very mischievous"*
(case 49) sits inside the paragraph that is **deliberately** Reps's loose paraphrase of
Amban's letter, since the careful translation of that letter closes the Afterword and the
blurb owns the doubling; modernising half of it would blur a distinction that is on purpose.

**Still not swept, and available if this goes further:** case 20's comment also compresses
傾膓倒腹 (*poured out his guts and turned his belly over*) to "spoke plainly enough", softens
喫痛棒 (*eat a painful staff*) to "test out my big stick", and turns Mumon's third-person
無門處 (*Mumon's place*) into "my place". None is wrong, so none made the six.

## 4e. An outside read of the PRODUCT — 21 August 2026

Every pass before this one read `book/gateless-gate.md`, the source. This one read
**THE-GATELESS-GATE.md**, the generated book, against this file — and found things no
amount of source-reading could, because **the builder sits between the two**. That is the
finding worth keeping: *checking the source is not checking the product.*

**The label bug, which reached actual readers.** `src/ui/scroll_state.js` held one table —
`comment: "Mumon's Comment"` — and both the reading UI and the book builder rendered from
it. So **case 49 was headed "Mumon's Comment" over the one comment in the book Mumon did
not write.** The source said `### Amban's Comment` all along; `parse-book.js` matched that
heading, validated it, and threw it away. Fixed at the root: `takeParts` now returns the
label it matched when it differs from the default, the case entry carries it, and both
renderers prefer it. `tests/parse-book.test.js` had a comment reading "the label never
reaches the module — only the key does", which is the bug written down as if it were a
design.

**The About had gone stale in four places**, all of them invisible from the source file
because `scripts/lib/book-md.js` builds its own colophon from `about_state.js`:
the Chinese was still described as "not independently collated against a second witness"
the day after the collation was run; the verification sentence and the direct-address
disclosure that Parts Two and Three both claim the front matter carries had never reached
the generated book at all; and it quoted Amban on an "old doughnut seller" and an addition
made "as a bargain" — two phrasings the register and voice passes had already removed from
the book itself. **The About was quoting a text the edition no longer contained.**

**Two record-versus-product mismatches.** §3's case-20 ruling still said *leg* where the
book says *foot* (the book is right; the note is now corrected), and the preface verse had
drifted to "approached by a thousand roads" against a flag demanding neutrality — see the
千差有路 entry, now restored.

**And the afterword signature was never in the book**, though three separate places here
assumed it was. Ruled out deliberately rather than added; see the 鈍置 note.

### What was accepted from the same read, and what was declined

Accepted, as consistency repairs the edition's own tests already called for: case 3's
鈍置 rendered "cheapens", which is exactly the dulling reading the afterword note says is
wrong (now "makes a fool of old Tenryu", matching the afterword); case 15's "twenty-fifth
of August", a Western month in a Tang exchange, in a book that removed an uppercut from a
Tang monastery (now "the twenty-fifth of the eighth month"); case 23's "knows for himself"
after a neutralised noun, the orphaned-pronoun failure Part Two §4 names; case 31's "checked
her out", which in current English appraises a woman's looks (now "tested her", which also
makes the 勘 pairing with case 11's title audible); case 29's surviving "bargain", swept
from case 49 for its discount drift; and two 門/關 edge spots — 關吏 as "the man at the
gate" inside a sentence that calls 關 a barrier (now "the officer on it"), and the
preface's 敲門瓦子, the one 門 this file calls an ordinary house door, which now knocks at
a door rather than a gate.

Declined: rendering 據座 as "held his seat" (faithful but stilted; "sat still" stays), and
unifying 胡 as "foreigner" in case 2's redbeard punchline. The inconsistency there is real,
but the sentence is murky for a different reason — the idiom turns on having heard of
redbeards and then meeting one — and swapping the noun would not fix it. **Left as a known
weak spot rather than half-mended.**

## 4f. The readability pass — 21 August 2026

The finished book read end to end for English flow, not for fidelity. Fidelity had already
been settled; this asked only whether the sentences work. Roughly sixty edits, none of which
changes what a line means.

**The class that mattered most is the register test again**, and it caught six the earlier
sweeps missed — because those hunted words that had *drifted*, and these are words that were
always ambiguous and are now read the wrong way first:

- **"leading each student on"** (preface) for 隨機引導. To lead someone on is now to string
  them along. Exactly backwards for a teacher. Now **guiding**.
- **"Old Zuigan sells out and buys himself"** for 自買自賣, *himself buys, himself sells*.
  "Sells out" imports a betrayal that is not there; the Chinese is a closed loop. Now
  **"buys and sells himself."**
- **"One holds, the other gives out"** (case 48) for 把定放行, the standard Chan pair
  *hold fast / let pass*. "Gives out" is what a knee does. Now **"One holds fast, the other
  lets go."**
- **"you will turn into Zen"** (case 47) — a garden path whose natural parse is the reader
  turning into Zen. One word: **turn it into Zen**.
- **"did not admit the first"** (case 11) — "admit" now means confess, or let in. 肯/不肯 is
  one verb affirmed and negated, so: **refuse the first and approve the second**.
- **"but especially transmitted beyond teaching"** (case 6) for 教外別傳. This is the
  classic four-phrase formula, *a separate transmission outside the teachings*, and
  "especially" is not an intensifier that belongs anywhere near it. **The oldest surviving
  defect in the book**, and it read as a typo for ninety years. Now **"transmitted
  separately, outside the teachings."**

**Twenty sentence-level stumbles** were repaired: a question mark mid-sentence in case 1, a
dangling participle ("As a fruit ripening in season"), a verb that cannot govern a quotation
("wondered the monks"), "After he remained years in China", "oppositely", "asked of Sozan",
the book's one inverted attribution ("Said Mahakashapa"), and case 26's "observing the
physical movement", which is the philosophy-department filler Part Two §1 names as a fault
class and had survived every pass. **Three of the twenty repaired wordings introduced by
this session's own earlier passes**: "the dead road of before" twice over, "the officer on
it" sitting oddly on a barrier, and "struck that trade" where English strikes bargains and
makes trades.

**Twenty smaller items** — articles, comma splices, "arose" for "rose", three "proceed on
from"s — took the same pass.

### Rulings on the four left open

- **Case 2's redbeard line.** Reopened and changed after all: "I thought the Persian's
  beard was red; now I see a red-bearded Persian before me." The turn — hearsay, then the
  thing itself — was inaudible in Reps's version. **Note that this reverses a decline
  recorded in §4e**; the earlier ruling was against swapping the *noun*, which would not
  have fixed the sentence. Recasting it did.
- **Case 15's narrator aside** ("wondering how long Tozan would continue with such factual
  answers") — **cut**. It is Reps's insertion, the only novelistic narrator-comment in any
  case, and it tells the reader what to think about an exchange that works without it.
- **Case 33's "you are a graduate of Zen"** — now **"your study is finished."** 參學事畢 is
  the business of study being over, and **參學 is already "study" in case 11** ("no eye for
  study"), so this also unifies a term. The diploma is gone; the deadpan one-line abruptness
  that makes the comment land is not.
- **Kept:** case 19's articleless "the same freedom as sky" (poetic, and the narration does
  not trip on it) and case 28's "Why don't you retire?" (formal, but clear, and the whole
  scene is a night visit to a teacher).

The same review supplied the protect list now standing before "The open questions,
gathered" — the most durable thing to come out of any of these passes, because it names what
must not be tidied and says where each reason lives.

## 5. Narration

After the second round — the seven rulings, the retitles, and the 37/38 reorder — the
repairs touch 70 of the 153 narration units (25,268 characters — still a modest bake).
`node scripts/build-narration.js --dry-run` lists them. Not baked as part of this pass:
the wording should survive review first, since a re-worded line after baking is a unit
baked twice.

---
---

# THE PROTECT LIST — wordings that look wrong and are not

Assembled 21 August 2026, from a readability review that read the finished book and then
went looking for what it must NOT change. Everything here has a reason recorded elsewhere
in this file; this is the index, in one place, because the reasons are scattered and the
wordings are not obviously deliberate.

**Why this section exists.** "Has a start and a finish" was reverted once by accident — a
grammar pass repaired a misspelling in the clause and, not knowing the wording was chosen
to avoid a published translation, restored the very phrase it was avoiding. Every entry
below is exposed to that same failure: each looks like a small infelicity a careful editor
would tidy.

| Looks like an error | It is | Where the reason lives |
|---|---|---|
| Case 9: "Because he does not **become** a Buddha" | The tense clash with the past-tense question IS the repair; buddhahood is not something one becomes | §4d |
| Case 28 verse: lines 1 and 2 contradict each other | The restored chiasmus, 聞名不如見面／見面不如聞名. A cold reader called it a typesetting error and it stayed | Part Two §2 |
| Case 13 verse: "they are **not** the same" | A repaired negation, not a typo for "are they not the same?" | §2 |
| Case 16 verse: the family/stranger reversal in lines 3-4 | The chiasmus is the point | Part Two §2 |
| Case 33 verse: give the sword, do **not** offer the poem | The must/must-not asymmetry is the repaired content | §2 |
| Preface: "has a **start and a finish**" | Deliberately not "a beginning and an end" — avoids Aitken. **Already reverted once by accident** | coincidences |
| Preface verse: "there are a thousand roads" | Deliberately silent about where the roads go, because 千差有路 is. Drifted to "approached by" once and was restored | open question 4, §4e |
| Afterword verse: "the easy part / is hard" | Built to break a shared run with J. C. Cleary | coincidences |
| Zen Warnings: "**hell and heaven**" | The Chinese order 地獄天堂, kept against the English idiom | §4e |
| Zen Warnings: "making a living in a house of ghosts" | Kept knowingly despite a recorded six-word overlap with Wonderwheel | Zen Warnings collation |
| Case 48: "It is very difficult to find the right person" and the two riders | Reps's invention, kept: restoring the camel is a choice of witness the collation showed is not the mainstream reading | §4, collation |
| Case 2 verse: "the same die shows two faces" | Reps's image for 兩采一賽, kept as his voice | §4 |
| Case 24's title vs its own case | A recorded known loss; titles are what readers recognise | Part Two §9 |
| Case 1: "Has a dog Buddha nature **or not**?" and case 4's "Why hasn't that fellow a beard?" | House archaism, and the two pair with each other. **This one is a judgement, not a finding** — no note establishes it, but modernising one alone would break the pairing | — |

Two further classes are protected by their own sections rather than listed here: the six
names that ship in Japanese readings (Part Two §3), and everything in "The open questions,
gathered", where the English was built to survive both readings and picking one quietly
destroys information.

# The open questions, gathered

For a reader of Classical Chinese. Each is phrased as the reading printed above, followed by
what it could equally bear. None is a coin flip resolved in silence.

1. **Whose the 黃龍三關 verses are** (p.299b08–b15). The Taishō gives no attribution; all four
   published translations assign them to Zongshou; our internal argument for Mumon is weak.
   *The most consequential item here.*
2. **哮本** (p.292a29) — "this roaring book of his" could be a corruption of another word, in
   which case there is no insult. A hapax; published translators disagree with each other.
3. **佛語心為宗** (p.292b12) — "the Buddha's teaching takes mind as its source" could read "the
   heart of the Buddha's word is the source", taking 佛語心 as a Laṅkāvatāra unit.
4. **千差有路** (p.292b24) — "there are a thousand roads" could be contrastive (the world of
   distinctions is nothing *but* roads) or approaching (a thousand ways *to* it).
5. **明明知道只是者箇。為甚麼透不過** (p.299a20) — second person (a challenge) or first (Baiyun
   confessing). No pronoun in the Chinese.
6. **赤土搽牛嬭** (p.299a21) — direction settled by grammar; the *force* is not. Futile cosmetic
   effort, or spoiling something good, or fraud.
7. **五祖豈藉爺緣** (p.299b13) — the Fifth Patriarch (Hongren, fatherless) or Goso (Fayan, who is
   what a reader of the 1934 cases will hear). 爺緣 is a hapax. Also open: whether the "father"
   is biological or the Fourth Patriarch.
8. **幾多蟠蟄起雷音** (p.299b18) — sleepers *rising at* the thunder, or sleepers *sending up* a
   thunderclap. The grammar favours the second.
9. **山偈** (p.299b19) — the force of 山: locative and humble, or institutional. Same English
   either way.
10. **初吉** (p.299c21) — day one, days one to seven or eight, or simply an auspicious start.
11. **兼屯田大使兼蘷路策應大使** (p.299b26–27) — a documentary conflict with Meng Gong's
    biographies, not a parse. Unresolvable without 宋史 juan 412.
12. **紹定戊子夏** (p.292b16) — a dating question rather than a translation one. Calendrical
    summer (lunar months 4–6) ends five days *before* the afterword is dated; the monastic
    retreat (4/15–7/15) contains it. "Summer" is safe either way and no span is printed, but
    the two documents only cohere under the monastic reading.
13. **The 1245/1246 gap** (p.299b24, p.299c21) — Meng Gong floats a forty-ninth case a year
    before Amban writes one, in the same construction and with the same *Yijing* conceit.
    The reading that makes them one conversation is **ours**; no published discussion of the
    discrepancy exists anywhere we could reach.

---

# Where our wording coincides with a published translation

Nothing here was copied. The three passes worked from the Chinese, were told to stop reading
any search result that started showing them an English rendering, and two of them logged
doing so. But 大道無門 has only so many English shapes, and a check run afterwards turned up
short runs that land on the same words a published translator used. They are listed so that
nobody has to discover them later:

- **"the family treasure"** for 家珍 — Aitken has the same three words. The shipped text
  reads "can never be your own treasure", which is clear of it.
- **"has a beginning and an end"** for 始終 — Aitken again. Changed to **"has a start and a
  finish"**. ⚑ **This one was accidentally re-created in August 2026** and has been restored:
  a grammar pass repaired a misspelling in the clause and, in doing so, reverted the wording
  to Aitken's. A deliberate divergence is invisible to a proofreader, which is exactly why it
  is written down here. Anyone editing this clause again should leave *start* and *finish*
  alone.
- **"The great way has no gate"** for 大道無門 — Aitken's line almost exactly. The July draft
  changed it to "The great road has no gate". **Settled August 2026: the verse reads "The
  Great Way is gateless," and the coincidence is accepted.** "The Great Way" for 大道 is close
  to forced — 道 is *Way* in every philosophical register of English — and "great road" was
  buying distance at the cost of the weaker noun *and* the word the next line needs for 路.
  The predicate is genuinely ours, and *gateless* is the word in the book's own title, so the
  first line of the first verse chimes with the cover. A coincidence on a forced phrase, in
  exchange for the title echo, is the right trade.
- **"you walk … alone"** for 獨步 — the frame is Aitken's. **Settled August 2026: the verse
  reads "you walk alone through heaven and earth," and this file's own earlier advice was
  overruled.** The July draft's "you go alone" bought distance; the shipped text before this
  read "you walk unhindered," which cleared Aitken entirely but was **wrong** — 獨步 is
  literally *alone-step*, and *unhindered* is a different and weaker claim. This file already
  conceded that "獨步 does not offer many alternatives." **Where a coincidence is forced by
  the source, accuracy wins.** The line as a whole is still distinct from Aitken's "You walk
  the universe alone," since 乾坤 is rendered literally here where he generalised.
- **"the mind of nirvana is easy to…"** for 涅槃心易曉 — a five-word run shared with J. C.
  Cleary. **Settled August 2026 by changing what the line does rather than which verb ends
  it.** Swapping only the final word left almost the whole run standing; the July draft's
  "easy enough to make out" cleared it but was vague and hedged. The couplet is a reversal —
  you expect enlightenment to be the hard part, and Mumon says it is the easy half — so the
  English now says so outright:

  > The mind of Nirvana is **the easy part**.
  > Telling one thing from another **is hard**.

  *The easy part* / *is hard* is a matched pair across the two lines, which is the shape of
  易/難 in the Chinese, and it breaks the shared run at the point where the run actually lives.
  A comparative (*is harder*) was tried and dropped: it makes the opposition relative where
  the Chinese states it flat. 難 says *hard*, not *harder*.

- **"five hundred lives of grace"** for 風流五百生 — case 2's restored punchline (Part
  Three). The phrase-shape is the received one for this line and may land on Shibayama's
  or Aitken's exact wording; the published fox-case pages could not be re-fetched from
  this session to verify. If it proves exact and unwanted, "five hundred lives lived in
  style" is the ready alternative.

## The Zen Warnings, checked at last — 20 August 2026

For a month this section read "**Not yet re-checked:** the Zen Warnings, Huanglong's Three
Barriers and Zongshou's verse," because the volumes could not be fetched. The Warnings are
the only one of the three that **ships**, and they have now been run, couplet by couplet,
against four independent published renderings: **Blyth**, **Eiichi Shimomissé**, **Gregory
Wonderwheel** (the only complete one reached) and an unattributed version in circulation.

**The result is clean.** No run of our English matches a published one at any length worth
worrying about. Every overlap found is a **technical term or a forced two-to-four-word
phrase** where English offers no real alternative:

- **"silent illumination"** (默照) — a named method, Hongzhi's; the note above already
  records that renaming it would erase the target. Our qualifier is **"crooked"** where the
  others have *perverted*, *false* and *wrong*.
- **"iron mountains"** (鐵圍山), **"deep pit"** (深坑), **"devil's army"** (魔軍),
  **"chains"** (鎖) — all two words, all the standard English.
- Couplet 1 shares the frame *"Follow the … and keep to the …"* with Blyth, who has
  *compass* and *rule* where we have *rules* and *forms*. That frame is what the
  four-character parallel 循規守矩 gives anyone who renders it as a parallel.

**And in several places ours is the more faithful.** Couplet 6 keeps the Chinese order —
地獄天堂, "hell and heaven" — where the published versions all flip to the English idiom
*heaven and hell*. Couplet 9's 兀然 is **"like a stump"** here and *"on a high plateau"* in
Wonderwheel, which is a different reading of the character, not a different wording of the
same one. Our closing (努力今生須了却。莫教永劫受餘殃) shares nothing at all with his.

### ⚑ The one overlap worth recording

**Couplet 9, 鬼家活計.** Ours reads "**making a living in a house of ghosts**"; Wonderwheel
has "the stratagem of **living in the house of ghosts**." That is a six-word run separated
by one article, and it is the longest coincidence in the piece by some distance.

It is **kept**, on the rule this file already applies elsewhere — where a coincidence is
forced by the source, accuracy wins. 活計 *is* livelihood, and "making a living" is the
English for it; the sneer this note documents above, at dead sitting as a comfortable
career, is carried by exactly those words and by nothing else. Wonderwheel's "stratagem"
does not carry it. If it ever needs clearing, "making your living among ghosts" breaks the
run and costs the ghost-house its walls.

**Still owed, and now the only items:** Huanglong's Three Barriers and Zongshou's verse.
**Neither ships** — both are notes-only, so nothing a reader ever sees depends on them.

---

# Known failure modes, and what happened to them

The brief names three documented machine-translation errors. All three were checked
independently, by a pass that did no translating.

- **彌衍宗紹.** **One person: Miyan Zongshao** — 道號 彌衍 plus dharma name 宗紹. He is the
  student who *compiled* the book, and his byline 「參學比丘彌衍宗紹編」 stands at p.292c21, just
  before case 1. It is not in the translation set above, but for the record: the segmentation is
  **彌衍 | 宗紹, never 彌衍宗 | 紹**. "Bhikkhu Miyanzong" cuts in the wrong place, severs the
  dharma name, orphans 紹, and drops 編 — so he also stops being the compiler.
- **紹定 = 1228–1233.** Not 1122/1123, which is 宣和 — a different era, in the Northern Song,
  about 106 years earlier and before the dynasty this book was presented to. 紹定二年 = 1229.
  淳祐 = 1241–1252. Every cyclical year in the text was checked against its era and all six
  agree: 戊子 = 1228, 庚寅 = 1230, 乙巳 = 1245, 丙午 = 1246, 應永乙酉 = 1405.
- **無門關.** Rendered **The Gateless Gate** throughout, the 1934 edition's own title. Never
  calqued. Where 關 stands alone inside a sentence it is "barrier", "checkpoint" or "pass",
  because the book turns on 門 and 關 being different words — a point Mumon makes himself in the
  afterword with 掉臂度關，不問關吏, and Meng Gong makes again with 既是無門因甚有關.

Three further traps were found that the brief does not list:

- **瑞巖 is two different mountains.** Zongshou's is in Ningbo; case 12's is in Taizhou. Carrying
  the 1934 romanisation "Zuigan" across sends the reader to the wrong man.
- **五祖 is two different men.** In the cases it is Fayan — who appears as **Goso in cases
  35, 36, 38 and 45** (numbering per Part Three's restored Taishō order; the buffalo koan
  was case 37 in the 1934 book, and case 37 is now Joshu's tree). In
  Huanglong's Three Barriers it is almost certainly Hongren. Following the naming rule here
  would introduce the error.
- **幹緣 is not 勸緣.** The first runs the project; the second raises the money.

---

# Names

**The rule changed in August 2026.** The July draft used the 1934 edition's Japanese readings
only where a name also appeared in the forty-eight cases, and Pinyin elsewhere. That left the
front matter introducing the author as *Wumen Huikai* and case 1 handing the reader *Joshu*,
with nothing to say they were the same system.

**The shipped text now uses Japanese readings throughout** — for Chinese and Japanese Zen
figures; Indian figures keep their Sanskrit forms. Pieces that do **not** ship keep Pinyin,
since they are scholarly apparatus rather than reading text, and bibliographic citations keep
the Chinese. The provenance section states this policy so a reader can see it is deliberate.

| Chinese | Used here | Basis |
|---|---|---|
| 慧開 | Ekai | 1934 ("Ekai, called Mumon") |
| 無門 | Mumon | 1934 |
| 安晚 | Amban | 1934 (case 49) |
| 兜率 | Tosotsu | 1934 (case 47) |
| 五祖 (in 黃龍三關) | the Fifth Patriarch | **deliberate departure** — "Goso" is Fayan in the 1934 cases; see the flag |
| 玄沙 | **Gensha** | ships — Japanese reading (Ch. Xuansha) |
| 白雲 | **Hakuun** | ships — Japanese reading (Ch. Baiyun) |
| 楊岐 | **Yogi** | prepared, but **does not ship** — it occurs only in the afterword signature, which the book does not carry (see below) |
| 那吒 | **Nata** | ships — Japanese reading (Ch. Nezha) |
| 龍翔 | **Ryusho** | ships — Japanese reading (Ch. Longxiang) |
| 東嘉 / 溫州 | **Onshu** | ships — Japanese reading (Ch. Wenzhou) |
| 紹定 | **Jotei** | prepared, but **does not ship**, for the same reason as Yogi |
| 陳塤 | Chen Xun | Pinyin — does not ship |
| 孟珙 | Meng Gong | Pinyin — does not ship |
| 無庵 | Wu'an | Pinyin — Meng Gong's own 號; does not ship |
| 無量宗壽 | Wuliang Zongshou | Pinyin — does not ship |
| 彌衍宗紹 | Miyan Zongshao | Pinyin — does not ship |
| 黃龍 | Huanglong | Pinyin — does not ship (Jp. Ōryū) |
| 瑞巖 (Ningbo) | Ruiyan | Pinyin — **not** "Zuigan"; different house from case 12 |
| 迦葉 (the disciple) | Mahakashapa | 1934, standardised — bare *Kashapa* now belongs only to the Kashapa Buddha of case 2 |
| 五祖法演 | Goso | 1934 — standardised; *Hoen* in case 45 was the same man |
| 常牧 | Jōboku | Japanese — a Japanese colophon written in Japan |
| 廣園寺 | Kōonji | Japanese — the temple's own reading |

---

---

# For whoever edits this next

Three things this file exists to prevent:

1. **Do not "fix" a deliberate divergence.** Several wordings are odd on purpose, to avoid
   coinciding with a published translation. They look like errors and one has already been
   reverted by accident. The list is above. The same goes the other way: every repair in
   Part Three §2 was made against the Chinese on purpose — do not "restore" a familiar
   Reps line without reading its entry first.
2. **Do not harmonise the flagged uncertainties.** Where the Chinese will not decide between
   two readings, the English was built to survive both. Picking one quietly loses information
   that took real work to establish.
3. **Verify the structure after any bulk edit.** 51 `##` pages, 154 `###` sections, every
   `The Verse` exactly four lines, no consecutive blank lines, one trailing newline, no
   dashes. A scripted pass once added a blank line after all 51 verses without a single
   visible symptom.

*Translations prepared July 2026; cases edited and the whole book brought into one register
August 2026; both with AI assistance. Not by Senzaki and Reps, and not written to be mistaken
for them. The uncertainty flags above are the honest state of the text and are meant to be
read, and acted on, by someone who reads Classical Chinese.*