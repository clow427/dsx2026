---
inclusion: always
---

# Product: Alumni Network Graph

## Purpose

A living, evidence-backed map of Boston University's alumni and research network. It connects people to publications, patents, funding awards, organizations, and research topics so students can discover relevant people to learn from.

## Primary user and demo journey

Primary user: a BU student exploring a field. Demo topic (proposed): **AI in healthcare**.

1. The student searches for a topic, person, organization, or technology.
2. The app shows a connected graph containing multiple node types.
3. The student opens a BU-linked researcher and sees their BU affiliation status, source records, research, professional links, and documented collaborators.
4. The student clicks an edge and sees the evidence for why it exists.
5. The student filters the graph to research-only or patent-only connections.
6. "Find My People" turns the topic into a ranked, evidence-backed list of people to explore.
7. Every claim links back to an original source.

## Minimum winning demo (definition of done for the team)

- Search by topic or person.
- Connected graph with multiple node types.
- Person detail panel showing BU affiliation status and its source records.
- Edge evidence panel.
- Filter to research or patent connections.
- One complete discovery journey with no errors.
- Public deployment, public repo containing `.kiro/`, a demo video under 3 minutes, and the Kiro usage write-up.

## Product principles

1. **Trustworthy connections over node count.** A few dozen well-supported people beat thousands of unreliable ones.
2. **Every factual claim links to a real source record.**
3. **Verified alumni ≠ BU-affiliated researchers.** Publishing at BU does not make someone an alumnus.
4. **Uncertain identity matches are flagged, never silently merged.**
5. **The app works without any LinkedIn data.**

## Out of scope for the hackathon

- Automated LinkedIn scraping, or any access that bypasses login, rate limits, or anti-bot protections.
- Databases and backend services, unless the whole team agrees they are needed.
- Any LLM that creates, infers, or decides relationships. An optional LLM summary may only restate records already in the graph, and it must cite them.
