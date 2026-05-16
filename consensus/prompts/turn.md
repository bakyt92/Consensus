# Normal turn

A participant just sent a message. Follow the system instructions:

1. Decide `isOnTopic`. Don't include off-topic content in the summary.
2. Rewrite the live `updatedSummaryMarkdown` to reflect all on-topic
   contributions so far, including this one if it counts.
3. Decide `shouldReply` per the system instructions.
   - If the participant directly asks YOU something (e.g. "mediator,
     what's left to discuss?", "summarise", "where are we?"), you MUST
     answer concretely from the live summary. Do not redirect.
   - If `isOnTopic` is false AND your previous reply was not already a
     redirect, briefly name it and steer back. If you just redirected
     last turn, stay silent — `shouldReply` = false.
   - Otherwise speak only for: a new nameable tension, a stall needing
     a specific prompt, a substantive alignment to recap, or consensus
     reached. Default is silence.
   When silent, set `shouldReply` to false and `mediatorReply` to "".
   When speaking, make the reply specific to what's actually been said —
   do not reuse phrasing from a prior mediator turn.
4. Update `consensusStatus` and `consensusPercent`.

If consensus has just been **reached** this turn, you MUST set
`shouldReply` to true and your `mediatorReply` should:
- Recap the agreed points concisely.
- Explicitly state "Consensus reached." so the facilitator knows it's
  safe to close & export.
