# Product

**Name:** Pick Two

**Status:** Proposed MVP  
**Date:** 2026-09-05

## 1. Product summary

Pick Two is a responsive web application for making group decisions through blind pairwise
comparisons.

A creator asks a question, adds several options, and shares a public link. Participants choose
between two options at a time. Pick Two combines those choices into a ranked result.

For example, a creator might ask, "What should we name our product?" and add Orbit, Juniper,
Northstar, and Kite. Instead of manually ordering the entire list, each participant answers a
short sequence of choices such as "Orbit or Juniper?" The group receives a final ranking after
enough comparisons have been collected.

## 2. Application patterns

Pick Two uses these application patterns:

- Authenticated creator routes and public participant routes.
- User-owned relational data and authorization.
- CRUD forms, boundary validation, and typed API calls.
- Anonymous participation through shareable tokens.
- Transactional writes and non-trivial domain logic.
- Query caching, mutations, aggregation, and result visualization.
- Dense desktop layouts and focused responsive interactions.
- Worker-runtime integration tests and abuse prevention.

Domain-specific code stays behind clear route, service, and persistence boundaries.

## 3. Target users

### Creator

A maker, product team member, organizer, or researcher who wants a group to compare a finite set
of options without requiring every participant to rank the full list.

The creator needs to:

- Create and configure a ranking room.
- Add and edit the available options.
- Publish the room and share its voting link.
- Control whether voting is open and whether results are visible.
- Review participation and final rankings.

### Participant

Anyone who receives a voting link. A participant should not need an account.

The participant needs to:

- Understand the question immediately.
- Choose between two options with minimal friction.
- See progress through the ballot.
- Finish without encountering duplicate comparisons.
- View results when the creator permits it.

## 4. Product surfaces

### Creator workspace

The creator experience is a desktop-first SaaS workspace that remains usable on smaller screens.
It uses application navigation, tables or card grids, multi-column forms, management controls,
and result visualizations.

```text
Dashboard
`-- Ranking rooms
    `-- Room
        |-- Overview
        |-- Options
        |-- Results
        |-- Sharing
        `-- Settings
```

### Participant voting

The participant experience is a focused, device-independent public flow:

```text
Open shared link
  -> receive two options
  -> choose one
  -> repeat
  -> see completion or permitted results
```

Voting is intentionally mobile-friendly because links will often arrive through messaging apps,
but it is not a mobile application. On larger screens, the two choices sit side by side in a
centered voting surface.

## 5. Primary user journey

The MVP proves one complete journey:

```text
Sign in
  -> create a ranking
  -> add options
  -> publish
  -> copy the public link
  -> collect anonymous votes
  -> close the ranking
  -> inspect final results
```

The key interaction is pairwise choice. Participants never need to understand or manipulate a
complete ordered list.

## 6. Information architecture

```text
/                         Landing or authentication redirect
/sign-in                  Creator authentication
/dashboard                Creator overview
/rooms/new                Create a ranking room
/rooms/$roomId            Manage a ranking room
/rooms/$roomId/results    Inspect detailed results
/r/$shareToken            Participate in public voting
/r/$shareToken/results    View public results when enabled
```

## 7. Core concepts

```text
users
  `-- rooms
      |-- options
      `-- ballots
          `-- pairwise_votes
```

- A **room** contains the question, lifecycle state, sharing configuration, and result visibility.
- An **option** is one candidate answer in a room.
- A **ballot** represents one anonymous participant's voting session.
- A **pairwise vote** records which option won and lost a presented comparison.

The exact persistence schema and API boundaries are defined in `ARCHITECTURE.md` and the
implementation.

## 8. Product rules

- A room contains 4–5 options during the MVP to keep participation short.
- Each ballot compares every unique pair: 6 comparisons for 4 options, or 10 for 5.
- Creators see the comparison count while configuring a room and before publishing.
- A room moves through draft, open, and closed states.
- Owners can archive draft or closed rooms; open rooms must be closed first.
- Archived rooms appear in an Archived dashboard filter and must be restored before editing or publishing.
- Restoring preserves the previous draft or closed state. Archiving preserves all votes, results,
  and public result visibility.
- Only the authenticated owner can configure or close a room.
- Anyone with a valid public token can participate while voting is open.
- Anonymous participant identity uses a first-party cookie.
- A ballot cannot submit the same pair more than once.
- The server assigns every unique pair in a randomized order and enforces that order.
  Participants cannot choose or skip ahead to another comparison.
- Result calculation lives in a deterministic domain service independent of HTTP and storage.
- The initial ranking uses win percentage: wins divided by comparisons involving that option.
  All saved votes count, including partial ballots. Equal percentages share a competition rank;
  options without comparisons remain unranked. Input order does not affect results.
- Results default to private. Creators can share them after closing or while voting is open.
- The creator controls whether participants can see results before the room closes.
- Closed rooms reject new votes but preserve existing results.

## 9. MVP scope

The MVP includes:

- Email and password authentication for creators, with required email verification codes.
- Password recovery through a single-use email link that expires after 15 minutes.
  Resetting a password revokes existing sessions and requires signing in again.
  Recovery requests do not reveal whether an account exists.
- Room creation, editing, publishing, closing, and archiving.
- Text-based option management.
- Shareable public voting links.
- Anonymous ballots and pairwise voting.
- Ranked results with basic participation totals.
- Loading, empty, error, and success states.
- Responsive creator and participant layouts.
- Authorization, validation, and Worker integration tests.

The MVP explicitly postpones:

- The Astro marketing site.
- Google OAuth and passwordless email OTP sign-in.
- Organizations, invitations, and team roles.
- Image uploads and R2.
- Realtime result updates.
- Comments and discussions.
- Custom branding and vanity URLs.
- Payments and subscriptions.
- Notifications and transactional product email.
- Advanced ranking and statistical models.

## 10. Experience principles

### Make each decision effortless

The voting screen presents one question and two clear choices. Secondary information must not
compete with the decision.

### Preserve context for creators

Creator screens should expose room state, participation, sharing, and configuration without
forcing the user through a mobile-style sequence of narrow panels.

### Explain the result

Results should show the ranking, score or share, and participation totals. The interface must not
imply statistical certainty that the available data does not support.

### Work without participant accounts

Opening a voting link must lead directly to a comprehensible ballot. Authentication belongs only
to the creator workflow during the MVP.

### Use responsive design deliberately

The creator workspace prioritizes desktop productivity. The public ballot prioritizes focus and
touch-friendly interaction. Both surfaces are part of the same responsive web application.

## 11. Success criteria

The MVP is successful when:

- A new creator can publish a room without assistance.
- A participant can complete a ballot from a shared link without signing in.
- Duplicate or invalid votes are rejected reliably.
- The same recorded votes always produce the same ranking.
- A creator can understand the winning options and participation level.
- The complete journey works locally and in the Cloudflare Workers runtime.
- The implementation demonstrates reusable application patterns without requiring the product
  domain throughout unrelated infrastructure.

## 12. Implementation sequence

1. Add the application router, query client, and creator shell.
2. Add D1, the Drizzle schema, migrations, and readiness checks.
3. Integrate creator authentication.
4. Implement room creation and option management.
5. Implement public tokens, ballots, and pairwise voting.
6. Implement deterministic ranking and results.
7. Add request tracing, stable errors, security controls, and rate limits.
8. Test the complete creator and participant journey.
9. Reconsider the marketing site only after the core product loop is compelling.
