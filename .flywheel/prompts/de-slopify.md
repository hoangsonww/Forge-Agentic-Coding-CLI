# De-slopify documentation

**Use with:** any agent, after it wrote README / docs / user-facing
text. Must be done manually line-by-line; no regex.

---

I want you to read through the complete text carefully and look for
any telltale signs of "AI slop" style writing.

One big tell is the use of emdash. Replace it with a semicolon, a
comma, or recast the sentence so it sounds good while avoiding
emdash.

Also avoid these tropes:

- "It's not [just] XYZ, it's ABC"
- "Here's why" / "Here's why it matters:"
- "Let's dive in"
- "At its core…"
- "It's worth noting…"
- forced enthusiasm, pseudo-profound openers, unnecessary hedges

Anything that sounds like the kind of thing an LLM would write
disproportionately more commonly than a human writer and which sounds
inauthentic/cringe.

You CANNOT do this with regex or a script. You MUST manually read
each line and revise it in a systematic, methodical, diligent way.
