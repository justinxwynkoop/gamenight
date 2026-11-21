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
        if let before = previous.spyNight, let after = next.spyNight {
            spyNightPlan(from: before, to: after, into: &plan)
            return plan
        }
        guard let before = previous.jeopardy, let after = next.jeopardy else { return plan }
        jeopardyPlan(from: before, to: after, into: &plan)
        return plan
    }

    /// Spy Night: the shared cue names, each meaning something of its own here (see games/spynight/ and
    /// public/games/spynight/tv.js, onChange): the roles are dealt (roundstart), a team is being picked (pick), the vote
    /// begins (open), a team is approved or rejected (correct, wrong), the mission begins (lock), it succeeds or fails
    /// (ding, strike), and the Resistance (fanfare) or the Spies (winner) win.
    static func spyNightPlan(from before: SpyNightState, to after: SpyNightState, into plan: inout SoundPlan) {
        if after.phase == .lobby, before.phase == .lobby, after.players.count > before.players.count {
            plan.cues.append(.join)
        }
        guard after.phase != before.phase else { return }
        switch after.phase {
        case .roles: plan.cues.append(.roundstart)
        case .team: plan.cues.append(.pick)
        case .vote: plan.cues.append(.open)
        case .voteResult: plan.cues.append(after.approved == true ? .correct : .wrong)
        case .mission: plan.cues.append(.lock)
        case .missionResult: plan.cues.append(after.result?.success == true ? .ding : .strike)
        case .gameover: plan.cues.append(after.spiesWon ? .winner : .fanfare)
        case .lobby, .unknown: break
        }
    }

    /// Jeopardy: what the change between two views means in sound. The names are the same ones the family's own
    /// files use ("open", "buzz", "correct", "wrong", "timeup", "dd", "final", "fanfare", "think", "lobby").
    /// It follows the web TV (public/games/jeopardy/tv.js, onChange).
    private static func jeopardyPlan(from before: JeopardyState, to after: JeopardyState, into plan: inout SoundPlan) {
        // A ruling just came in: right or wrong. (Going on from the ruling to the answer or the reopened buzzers keeps
        // the same result, so it stays quiet; flipping the ruling changes it, so that sounds too.)
        if let result = after.lastResult, result != before.lastResult {
            plan.cues.append(result.correct ? .correct : .wrong)
        }

        // A new player steps up to a podium in the lobby.
        if after.phase == .lobby, before.phase == .lobby, after.players.count > before.players.count {
            plan.cues.append(.join)
        }
        // Picking another clue while one is being read (the host's "skip") still sounds like a pick.
        if after.phase == .reading, before.phase == .reading, after.clue?.ci != before.clue?.ci || after.clue?.ri != before.clue?.ri {
            plan.cues.append(.pick)
        }

        if after.phase != before.phase {
            switch after.phase {
            case .roundIntro:
                plan.cues.append(.roundstart)
            case .board:
                // The board fills in once the round's titles have been shown.
                if before.phase == .roundIntro { plan.cues.append(.board) }
            case .reading:
                plan.cues.append(.pick)
            case .ddAnswer:
                if before.phase == .ddWager { plan.cues.append(.bet) }
            case .roundEnd:
                plan.cues.append(.applause)
            case .ddWager:
                plan.cues.append(.dd)
            case .open:
                // The buzzers open once the clue is read. After a wrong answer they reopen, and the wrong-answer sound covers that.
                if before.phase == .reading { plan.cues.append(.open) }
            case .answering:
                plan.cues.append(.buzz)
            case .reveal:
                // Nothing right or wrong was just ruled on: the clue ran out of time, or was skipped.
                if before.phase != .ruling && (after.lastResult == before.lastResult || after.lastResult == nil) {
                    plan.cues.append(before.phase == .open ? .timeup : .reveal)
                }
            case .finalWager:
                plan.cues.append(.finalSting)
            case .gameover:
                plan.cues.append(.fanfare)
                plan.cues.append(.applause)
            default:
                break
            }
        }

        // Each Final Jeopardy wager and answer locking in (the last answer goes straight on to the reveal, which has its own sound).
        if after.phase == .finalWager || after.phase == .finalAnswer, let round = after.finalRound, let earlier = before.finalRound,
           round.wagered.count > earlier.wagered.count || round.answered.count > earlier.answered.count {
            plan.cues.append(.lock)
        }

        // Final Jeopardy is revealed one player at a time: their response, then right or wrong. The correct answer is last.
        if after.phase == .finalReveal, let round = after.finalRound {
            let earlier = before.phase == .finalReveal ? before.finalRound : nil
            let moved = earlier?.revealIndex != round.revealIndex
            switch round.stage ?? "" {
            case "answer":
                if moved || earlier?.stage != "answer" { plan.cues.append(.reveal) }
            case "verdict":
                if moved || earlier?.stage != "verdict", let reveal = round.reveals.last {
                    plan.cues.append(reveal.correct ? .correct : .wrong)
                }
            case "done":
                if earlier?.stage != "done" { plan.cues.append(.reveal) }
            default:
                break
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

    /// The theme also comes back over the champion's podium once a Jeopardy game is won (after the fanfare).
    static func wantsThemeMusic(_ state: ServerState) -> Bool {
        wantsLobbyMusic(state) || state.jeopardy?.phase == .gameover
    }

    /// How long the theme waits after the winner's fanfare, so the two don't play over each other.
    static let themeAfterWinSeconds = 5.5

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
