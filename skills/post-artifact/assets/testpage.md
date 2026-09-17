# Yearn Artifacts Test Page

---

## The size ladder

Markdown gives you six heading sizes and one body size, so this is the whole range.

# h1 — the big loud one
## h2 — still shouting
### h3 — indoor voice
#### h4 — polite
##### h5 — muttering
###### h6 — the small print

Body text sits here at 1rem with a comfortable 1.7 line height, and `inline code drops
to 0.875rem` — which is as little as text gets without raw HTML, because the renderer
escapes it on purpose.

> A blockquote, for when the text needs to lean.

---

## Colorful charts

### A flowchart that colors its own nodes

```mermaid
flowchart LR
  A[Write report] --> B{Markdown?}
  B -->|yes| C[Render HTML]
  B -->|no| D[Serve bytes]
  C --> E[Draw diagrams]
  C --> F[Snap OG image]
  E --> G((Publish))
  F --> G
  D --> G

  classDef blue fill:#0657F9,stroke:#0345C7,color:#FFFFFF
  classDef pink fill:#F471B5,stroke:#DB2777,color:#2A0A1A
  classDef green fill:#22C55E,stroke:#15803D,color:#052E16
  classDef amber fill:#F59E0B,stroke:#B45309,color:#2A1A02
  classDef purple fill:#A855F7,stroke:#7E22CE,color:#FFFFFF

  class A,C blue
  class B amber
  class D pink
  class E,F purple
  class G green
```

### A sequence diagram with a pinned palette

```mermaid
%%{init: {'theme':'base','themeVariables':{'primaryColor':'#0657F9','primaryTextColor':'#FFFFFF','primaryBorderColor':'#0345C7','lineColor':'#A855F7','actorBkg':'#06B6D4','actorTextColor':'#042F2E','actorBorder':'#0E7490','signalColor':'#F471B5','signalTextColor':'#A855F7','labelBoxBkgColor':'#F59E0B','labelTextColor':'#2A1A02','noteBkgColor':'#22C55E','noteTextColor':'#052E16','noteBorderColor':'#15803D'}}}%%
sequenceDiagram
  autonumber
  participant You
  participant Skill as post-artifact
  participant API as Artifacts
  You->>Skill: publish this thing
  Skill->>API: POST /REPORT.md + bearer key
  API->>API: render, diagram, screenshot
  API-->>Skill: { key, url }
  Skill-->>You: a link with a random hex name
  Note over You,API: the URL is the only handle — there is no index
```

### A pie chart, because pie

```mermaid
%%{init: {'theme':'base','themeVariables':{'pie1':'#0657F9','pie2':'#F471B5','pie3':'#22C55E','pie4':'#F59E0B','pie5':'#A855F7','pieStrokeColor':'#0F172A','pieOuterStrokeColor':'#0F172A','pieTitleTextSize':'18px'}}}%%
pie showData title What a test page is made of
  "Headings nobody reads" : 28
  "Diagrams that look busy" : 34
  "Lorem-adjacent filler" : 18
  "Tables with fake numbers" : 12
  "One deliberate failure" : 8
```

### A state machine

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Drafted
  Drafted --> Published: POST with key
  Published --> Expired: retention elapses
  Published --> Deleted: DELETE with key
  Expired --> [*]
  Deleted --> [*]

  classDef live fill:#22C55E,stroke:#15803D,color:#052E16
  classDef gone fill:#F471B5,stroke:#DB2777,color:#2A0A1A
  class Published live
  class Expired,Deleted gone
```

Click any diagram to zoom it. Toggle the page theme and they all re-render — the ones
with pinned palettes keep their colors, the flowchart's `classDef` fills stay put, and
everything else follows the theme.

---

## Tables, lists, and the rest

| Retention | URL prefix | Good for |
| --- | --- | --- |
| `1d` | `/1d/` | test pages exactly like this one |
| `7d` | `/7d/` | something a review thread will outlive |
| `30d` | *(none)* | the default, and usually right |
| `1y` | `/1y/` | audits worth keeping around |
| `archive` | `/archive/` | never expires — ask before using |

An ordered list:

1. Write the file
2. Publish the file
3. Hand over the link
   1. Do not paste it anywhere public
   2. Reads are not authenticated

An unordered one, nested:

- Supported here
  - Tables, strikethrough, nested lists
  - Fenced code with a language tag
  - Mermaid, rendered client-side
- Not supported here
  - Raw HTML — ~~`<small>` and friends~~ escaped on purpose
  - Footnotes and task-list checkboxes — no plugins loaded

Some fenced code:

```ts
const { url } = await postArtifact({
  file: "./REPORT.md",
  retention: "1d",
  apiKey: process.env.ARTIFACTS_API_KEY!
});
console.log(url); // the only handle you get
```

Bare links get auto-linked: https://artifacts.yearn.dev — and [named ones](https://artifacts.yearn.dev) work too.

---

## The deliberate failure

The block below is not valid mermaid. It is supposed to fail. A diagram that cannot
parse should degrade to its own source in a code block, not blank out or drop an error
graphic on the page. If you see the source below, the fallback works.

```mermaid
flowchart LR
  A --> --> B[[[
  this is not a diagram
```

---

That is the whole tour. If every section above looked right, the renderer is healthy.
