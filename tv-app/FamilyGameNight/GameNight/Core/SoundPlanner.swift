import Foundation

/// What to play because the game state changed.
struct SoundPlan: Equatable {
    var cues: [SoundCue] = []
    /// A Final Jeopardy countdown just began (or was restarted): start the "think" music.
    var startFinalMusic = false
    /// There is no Final Jeopardy countdown running: stop that music if it is playing.
    var stopFinalMusic = false
}

/// Decides which sound goes with which change in the game.
enum SoundPlanner {
    static func plan(from previous: ServerState?, to next: ServerState) -> SoundPlan {
        var plan = SoundPlan()
        // The first state after connecting is not a change, so nothing plays.
        guard let previous else { return plan }

        // The host's "test sound" button bumps this counter.
        if previous.room.settings.ping != next.room.settings.ping {
            plan.cues.append(.correct)
        }
        if let before = previous.feud, let after = next.feud {
            feudPlan(from: before, to: after, into: &plan)   // Feud/Core/FeudSounds.swift
            return plan
        }
        guard let before = previous.jeopardy, let after = next.jeopardy else { return plan }
        jeopardyPlan(from: before, to: after, into: &plan)
        return plan
    }

    /// Jeopardy: what the change between two views means in sound. The names are the same ones the family's own
    /// files use ("open", "buzz", "correct", "wrong", "timeup", "dd", "final", "fanfare", "think", "lobby").
    private static func jeopardyPlan(from before: JeopardyState, to after: JeopardyState, into plan: inout SoundPlan) {
        // A ruling just came in: right or wrong.
        if let result = after.lastResult, result != before.lastResult {
            plan.cues.append(result.correct ? .correct : .wrong)
        }

        if after.phase != before.phase {
            switch after.phase {
            case .ddWager:
                plan.cues.append(.dd)
            case .open:
                // The buzzers open once the clue is read. After a wrong answer they reopen, and the wrong-answer sound covers that.
                if before.phase == .reading { plan.cues.append(.open) }
            case .answering:
                plan.cues.append(.buzz)
            case .reveal:
                // Nothing right or wrong was just ruled on: the clue ran out of time, or was skipped.
                if after.lastResult == before.lastResult || after.lastResult == nil {
                    plan.cues.append(before.phase == .open ? .timeup : .reveal)
                }
            case .finalWager:
                plan.cues.append(.finalSting)
            case .finalReveal:
                if before.phase == .finalAnswer { plan.cues.append(.timeup) }
            case .gameover:
                plan.cues.append(.fanfare)
            default:
                break
            }
        }

        // Final Jeopardy's answers are shown one by one, each with a right or wrong sound.
        if let round = after.finalRound, let earlier = before.finalRound, round.reveals.count > earlier.reveals.count {
            for reveal in round.reveals[earlier.reveals.count...] {
                plan.cues.append(reveal.correct ? .correct : .wrong)
            }
        }

        // The "think" music runs with Final Jeopardy's countdown and stops with it.
        if runningCountdown(in: after) != nil {
            if runningCountdown(in: before) == nil { plan.startFinalMusic = true }
        } else {
            plan.stopFinalMusic = true
        }
    }

    private static func runningCountdown(in game: JeopardyState) -> TimerState? {
        guard game.phase == .finalAnswer, let timer = game.timer, timer.leftMs > 0 else { return nil }
        return timer
    }

    /// Music loops in the lobby, while players are joining. It only plays if the
    /// server has a "lobby" file (or a "think" file, which is used when there is no lobby one).
    static func wantsLobbyMusic(_ state: ServerState) -> Bool {
        if case .noGame = state.game { return true }
        return !state.room.inProgress
    }

    /// The countdown on screen right now, if any: a clue's buzz-in or answer timer, or
    /// the Final Jeopardy timer. Its last five seconds tick.
    static func activeTimer(in state: ServerState) -> TimerState? {
        if let feud = state.feud { return feudActiveTimer(in: state, game: feud) }
        guard let game = state.jeopardy, let timer = game.timer, !timer.timedOut else { return nil }
        switch game.phase {
        case .open, .answering, .ddAnswer, .finalAnswer: return timer
        default: return nil
        }
    }
}

/// Works out when the countdown tick should sound: once for each whole second
/// that appears, for the last five, and not while music is playing over it.
struct TickTracker {
    private var timerKey: Date?
    private var shown: Int?

    /// Call about ten times a second with the countdown on screen (nil when there is none).
    mutating func shouldTick(countdown: Countdown?, now: Date, musicPlaying: Bool) -> Bool {
        guard let countdown else {
            timerKey = nil
            shown = nil
            return false
        }
        let seconds = countdown.secondsShown(at: now)
        // A new timer: note where it starts. No tick for the number it opens on.
        if timerKey != countdown.receivedAt || shown == nil {
            timerKey = countdown.receivedAt
            shown = seconds
            return false
        }
        guard seconds != shown else { return false }
        shown = seconds
        return seconds > 0
            && seconds <= 5
            && countdown.remainingMs(at: now) < Double(countdown.totalMs)
            && !musicPlaying
    }
}
