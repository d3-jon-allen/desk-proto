# Desk prototype

Standalone throwaway for the attention desk → focus → drawer cycle.

Not wired to the ARX MFE. Fake data, fake agent, real interaction model.

```bash
npm install
npm run dev
```

Opens on [http://localhost:5177](http://localhost:5177).

- **Desk** — continuous surface: roster or one focused issue; chat never leaves
- **Drawer** — parked issue clusters (working set per case)
- **Gallery** — [http://localhost:5177/gallery.html](http://localhost:5177/gallery.html) — Issue / Object / Insight / readout chip

## Investigation walkthrough (Torgus tie-out)

You are the **broker**. Torgus is a **reinsurer** with a tie-out break on section A – EU.

1. Desk opens on the **open-issues roster** (chat already there)
2. Open the TOR resolve case → siblings park conceptually; focus is **Section: A – EU**
3. Ask **What % of section ITD is the residual?** → calc chip in chat → **Add to desk** pins Residual / ITD beside the section
4. Ask **Can you give me more context on this?** → treaty sections table under the focus row
5. **Draft a query** → send (draft stays with “Query sent” / Review)
6. **All issues** or ask **Show me all open issues** → cluster parks in the **Drawer**, roster returns (chat stays)
7. **Next issue** (action bar) or reopen from the Drawer

Optional: portfolio “any other open residuals?” (no assumed matching sections).

No Save — work auto-parks in the Drawer when you leave an issue.
