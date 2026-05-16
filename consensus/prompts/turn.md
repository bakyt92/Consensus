# Normal turn

A participant just sent a message. Follow the system instructions:

1. Decide `isOnTopic`. Don't include off-topic content in the summary.
2. Rewrite the live `updatedSummaryMarkdown` to reflect all on-topic
   contributions so far, including this one if it counts.
3. Decide `shouldReply` per the system instructions — default to silence.
   Reasons that justify speaking:
   - `isOnTopic` is false → name it briefly and redirect (e.g. "Let's
     keep this on the minimum-days question — back to you, Priya").
   - A new tension between participants you can name.
   - The room is stalled and needs a redirect.
   - Substantive alignment worth recapping.
   - Consensus has just been reached.
   Otherwise set `shouldReply` to false and `mediatorReply` to "".
4. Update `consensusStatus` and `consensusPercent`.

If consensus has just been **reached** this turn, you MUST set
`shouldReply` to true and your `mediatorReply` should:
- Recap the agreed points concisely.
- Explicitly state "Consensus reached." so the facilitator knows it's
  safe to close & export.
