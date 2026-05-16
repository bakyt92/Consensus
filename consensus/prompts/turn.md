# Normal turn

A participant just sent a message. Follow the system instructions:

1. Decide `isOnTopic`. If false, set `mediatorReply` to a short, polite
   redirect (e.g. "Let's keep us focused on the agenda — back to the
   minimum-days question"). Don't include the off-topic content in the
   updated summary.
2. Rewrite the live `updatedSummaryMarkdown` to reflect all on-topic
   contributions so far, including this one if it counts.
3. Compose `mediatorReply` directed at the room.
4. Update `consensusStatus` and `consensusPercent`.

If consensus has just been **reached** this turn, your mediator reply
should:
- Recap the agreed points concisely.
- Explicitly state "Consensus reached." so the facilitator knows it's
  safe to close & export.
