# Requirements: Frontend Explorer

**Owner:** P4 · **Output:** A deployed web app · **Status:** Draft

## Introduction

This is the interface that judges and users experience. It loads the shared graph, supports search and exploration, shows evidence and confidence for every connection, and delivers the "Find My People" discovery journey. It is built against mock data from day one.

## Requirements

### Requirement 1: Data loading

1. THE app SHALL load `graph.json`, falling back to `data/mock/graph.sample.json`. A visible "Mock data" badge SHALL appear whenever mock data is in use.
2. IF the graph fails to load or fails basic shape checks, THEN THE app SHALL show an error state rather than a blank screen.

### Requirement 2: Search

**User story:** As a student, I want to search for a topic, person, organization, or technology, so that I can start exploring quickly.

1. WHEN the user types a query, THE app SHALL match node labels across all node types and group the results by type.
2. WHEN the user selects a result, THE app SHALL focus the graph on that node and its neighborhood.
3. WHEN a query has no results, THE app SHALL show an empty state that suggests the demo topic.

### Requirement 3: Interactive graph

1. THE graph SHALL render multiple node types, each distinguished by both shape or icon and color.
2. THE graph SHALL support pan, zoom, selecting a node, and expanding a node's neighbors.
3. THE app SHALL provide an accessible list or table view of the same neighborhood.

### Requirement 4: Detail panels

1. WHEN a person is selected, THE panel SHALL show:
   - The BU affiliation status, with its evidence links.
   - The source records.
   - Professional profile links, if any.
   - The person's research, patents, and awards.
   - Their documented collaborators.
2. WHEN a publication, patent, award, organization, or topic is selected, THE panel SHALL show its attributes, its source links, and its connected nodes.
3. WHEN a person is `ambiguous` or has `SAME_AS_CANDIDATE` edges, THE panel SHALL show an "Unconfirmed identity match" notice that lists the candidates.

### Requirement 5: Edge evidence

1. WHEN an edge is selected, THE app SHALL show its type, its confidence label, its derivation (documented, derived, or identity match), and every evidence record with its source name, record ID, and link.

### Requirement 6: Filters

1. THE app SHALL filter by BU affiliation status, topic, source type, and relationship type.
2. THE app SHALL offer one-click presets for "Research connections" (AUTHORED, COAUTHORED_WITH, HAS_TOPIC) and "Patent connections" (INVENTED, ASSIGNED_TO).

### Requirement 7: Find My People

**User story:** As a student interested in a topic, I want a ranked list of relevant people, with the reason each one is listed, so that I know whom to learn about.

1. WHEN the user enters a topic, THE app SHALL rank people by their evidence-backed connections to that topic: publications, patents, and awards linked through `HAS_TOPIC`.
2. Each result SHALL show its BU affiliation status, the specific connecting records with links, and a "why this person" explanation built only from graph edges.
3. THE ranking SHALL be deterministic. It SHALL NOT use an LLM.

### Requirement 8: Quality and delivery

1. THE app SHALL be keyboard navigable, SHALL NOT use color as the only signal, and SHALL provide loading, empty, and error states.
2. THE app SHALL be deployed to a public URL, and SHALL complete the demo journey in `.kiro/steering/product.md` without errors.

### Requirement 9: Evidence-grounded summary (stretch)

1. WHERE enabled, THE app MAY show an LLM summary of a person's records. The summary SHALL cite only records present in the graph and SHALL be labeled as AI-generated.
