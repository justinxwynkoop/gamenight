import Foundation

/// Something the TV should read out loud.
struct SpeechPlan: Equatable {
    var text: String
    /// Names this reading (round, clue and part) so the same clue is never read twice.
    var key: String
    /// When the voice finishes a normal clue, the TV tells the game (`readDone` with this column and row), which then
    /// opens the buzzers a moment later.
    var doneColumn: Int?
    var doneRow: Int?
    /// Final Jeopardy: start the "think" music once the voice has read the clue.
    var thenFinalMusic = false
    /// A sound or video to play first (before the voice).
    var media: JeoMedia?
    /// False when reading aloud is off and only the clue's sound or video plays: the TV then gives everyone time to
    /// read the clue on screen before it says it is done.
    var speaks = true
}

/// Which clue the TV reads out loud, and when (a port of speakClue in public/games/jeopardy/tv.js).
enum CluePlanner {
    /// Phases during which a clue that was being read keeps being read (the voice is not cut off).
    private static let clueGoesOn: Set<JeoPhase> = [.reading, .ddAnswer, .open, .answering, .ruling, .reveal]

    /// What to read now, if anything, and whether to stop the voice and the clue's sound or video (`stopClip`, once the
    /// clue is no longer on screen). `spoken` is the key of the last reading.
    static func plan(from before: JeopardyState?, to after: JeopardyState, spoken: String?)
        -> (speak: SpeechPlan?, stop: Bool, stopClip: Bool) {
        let stopClip = after.phase != .reading && after.phase != .ddAnswer
        guard let before else { return (nil, false, stopClip) }
        let stop = spoken != nil && !clueGoesOn.contains(after.phase) && after.phase != .finalAnswer
        let readsAloud = after.readsAloud == true

        if readsAloud, after.phase == .finalAnswer, before.phase != .finalAnswer, let q = after.finalRound?.q, !q.isEmpty {
            return (SpeechPlan(text: q, key: "final:\(after.round)", thenFinalMusic: true), false, stopClip)
        }
        guard after.phase == .reading || after.phase == .ddAnswer, let clue = after.clue, let q = clue.q, !q.isEmpty
        else { return (nil, stop, stopClip) }
        let media = clue.media?.plays == true ? clue.media : nil
        guard readsAloud || media != nil else { return (nil, stop, stopClip) }
        let key = "\(after.round):\(clue.ci):\(clue.ri):\(after.phase == .ddAnswer ? "dd" : "q")"
        guard key != spoken else { return (nil, false, false) }
        let newClue = before.clue?.ci != clue.ci || before.clue?.ri != clue.ri
        guard newClue || before.phase != after.phase else { return (nil, false, false) }
        let reading = after.phase == .reading && !after.hostJudges
        return (SpeechPlan(text: q, key: key, doneColumn: reading ? clue.ci : nil, doneRow: reading ? clue.ri : nil,
                           media: media, speaks: readsAloud), false, false)
    }

    /// How long to leave a clue on screen after its sound or video when nobody reads it out (the web TV's pace).
    static func readingPause(_ text: String) -> Double {
        min(8, 1.5 + Double(text.count) * 0.055)
    }

    /// The text as the voice should say it: a run of underscores ("this ___") is read as "blank".
    static func spoken(_ text: String) -> String {
        text.replacingOccurrences(of: "_{2,}", with: "blank", options: .regularExpression)
    }
}
