# Forward Impact Engineering Product Icons

The icons use a 24px grid, a 2px stroke, and no fill. The 2px stroke matches the
line weight of the characters. Draw each icon so it looks like it came from the
same notebook.

See [index.md](index.md) for the brand context of Forward Impact Engineering.
That file covers the palette, the typography, and the product taxonomy. See
[scenes.md](scenes.md) for the product scenes that compose these icons with the
three characters.

---

## Map — The Unfolded Map

```text
  ┌─────┬─────┐
  │  ·  │     │
  │ / \ │  ×  │   ← route line with marker
  │/   \│     │
  └─────┴─────┘
```

The icon shows a folded paper map, partially unfolded, with a route line and a
position marker. It represents the territory mapped out before you move through
it. Map is the central data store and the single source of truth. Everything
else references Map.

## Pathway — The Switchback Trail

```text
         ╱ ─ ╲
    ╱ ─ ╱     ╲
   ╱   ╱       ╲
  ~~~~~~~~~~~~     ← winding trail with switchbacks
```

A trail winds through switchbacks and elevation markers. The icon shows no
mountain peaks. The trail line is slightly thinner (1.5px). It represents the
career journey through difficult terrain. It shows the route others took. It
helps you plot your own path. Peaks belong to Summit. Pathway owns the trail.

## Guide — The Compass

```text
        N
        │
   W ───┼─── E
        │
        S
```

A circle houses the compass needle. The north half is filled with `--gray-900`.
It is the only filled element in the icon system. The icon means orientation and
direction. The Guide does not carry you. It shows you which way to go. The
filled north arrow subtly implies AI (a "smart" element within an analog tool).

## Landmark — The Cairn

```text
      ┃╲
     ┌┸─┐
    ┌────┐
   ┌──────┐
  ┌────────┐
  ──────────
```

Four or five flat stones stack into a tapered tower, with a pennant flag at the
apex. The tower sits on a ground line. The edges are slightly irregular for a
hand-drawn feel. The icon means observation, measurement, and reference points.
The cairn is human-made. It is not natural. In the same way, Landmark's analysis
derives meaning from collected data.

## Summit — The Peak

```text
      ⛳
      /\
     /  \   /\
    /    \ /  \
   /      \/    \
```

Two mountain peaks overlap. The taller peak stands in front with a small pennant
flag at the apex. The shapes are clean triangles. The icon has no fill,
consistent with the other icons. The peak is a collective goal. It is the
capability the team aims to reach together. It is not individual achievement.

**Flat variant:** A single peak with a flag. Use this simplified form for
favicons and tab bars.

## Outpost — The Tent

```text
      △
     / \
    /   \
   /  ┃  \
  /___┃___\
```

An equilateral triangle has a vertical rectangle entrance at center-bottom. The
tent sits on a ground line. The icon means shelter, preparation, and shared
space. The tent is temporary and portable. It reflects that knowledge management
should travel with you.

## Gear — The Tool Roll

```text
  ╭─┬─┬─┬─┬─╮
  │ │ │ │ │ │    ← pockets with tools
  │ ╿ ╿ ╿ ╿ │
  │ │ │ │ │ │
  ╰─┴─┴─┴─┴─╯
       ──────    ← tie strap trailing loose
```

A soft canvas tool roll lies unfurled flat on the ground. It shows five vertical
pockets. The tool handles poke out. The canvas drapes and sags slightly between
the pockets. It is fabric. It is not a box. The edges curl up where the roll was
wound. The corners do not lie perfectly flat. A tie strap trails loose from one
end. The icon has no fill, consistent with the icon system. Gear is the roll you
unfurl before the approach. Each pocket holds a library. Each tool lifts out
when you need it. When you finish the work, roll it up and carry on. The catalog
is the canvas. Each utility is a pocket.

---

## Icon System Rules

| Rule        | Specification                                                |
| ----------- | ------------------------------------------------------------ |
| Grid        | 24×24px with 2px padding (20px live area)                    |
| Stroke      | 2px, round caps, round joins                                 |
| Fill        | None, except Guide's compass needle (north half)             |
| Color       | `--gray-900` default, `--gray-400` when inactive             |
| Ground line | 1px stroke at bottom (Pathway, Landmark, Summit, Outpost)    |
| Style       | Hand-drawn feel: slightly imperfect corners, micro-variation |
| Sizes       | 24px (inline), 32px (nav), 48px (cards), 96px (marketing)    |

## Combined Icon: The Suite Mark

```text
 ┌──┬──┐      ╱─╲             N         ┃╲         ⛳/\        △      ╭┬┬┬╮
 │ /│× │     ╱   ╲            │        ┌┸─┐       /  \      / \     │╿╿╿│
 │/ │  │    ~~~~~~~~~~~~  ───┼───    ┌────┐     /    \    /___\    ╰┴┴┴╯
 └──┴──┘                      │      ──────    /      \
   Map       Pathway       Guide   Landmark   Summit   Outpost     Gear
```

Seven icons sit on a shared ground line, evenly spaced.
