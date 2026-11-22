import XCTest
@testable import GameNightCore

final class SoundSynthTests: XCTestCase {
    func testEveryCueRendersAudibleSoundThatStaysInRange() {
        for cue in SoundCue.allCases {
            let samples = SoundSynth.render(cue)
            XCTAssertFalse(samples.isEmpty, "\(cue)")
            let peak = samples.map { abs($0) }.max() ?? 0
            XCTAssertGreaterThan(peak, 0.05, "\(cue) should be audible")
            XCTAssertLessThanOrEqual(peak, 0.65, "\(cue) should leave headroom (no clipping)")
            XCTAssertTrue(samples.allSatisfy { $0.isFinite }, "\(cue)")
            XCTAssertLessThan(abs(samples[0]), 0.01, "\(cue) should start from silence")
            XCTAssertEqual(samples.last, 0, "\(cue) should end in silence")
        }
    }

    func testLengthsMatchTheWebRecipes() {
        func seconds(_ cue: SoundCue) -> Double {
            Double(SoundSynth.render(cue).count) / Double(SoundSynth.sampleRate)
        }
        XCTAssertEqual(seconds(.tick), 0.035 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.open), 0.09 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.buzz), 0.09 + 0.3 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.fanfare), 6 * 0.12 + 0.8 + 0.05, accuracy: 0.001)
        XCTAssertEqual(seconds(.finalSting), 0.05 + 0.9 + 0.05, accuracy: 0.001)
    }

    func testRecipes() {
        XCTAssertEqual(SoundSynth.tones(for: .correct).map(\.frequency), [523, 659, 784, 1047])
        XCTAssertEqual(SoundSynth.tones(for: .dd).count, 5)
        XCTAssertEqual(SoundSynth.tones(for: .fanfare).count, 7)
        XCTAssertEqual(SoundSynth.tones(for: .wrong), [ToneSpec(frequency: 160, start: 0, duration: 0.55, wave: .square, gain: 0.35, slideTo: 95)])
        XCTAssertEqual(SoundSynth.tones(for: .tick).first?.wave, .square)
    }

    func testEnvelopeShape() {
        XCTAssertEqual(SoundSynth.envelope(0, duration: 0.5, gain: 0.6), 0.0001, accuracy: 1e-9)
        XCTAssertEqual(SoundSynth.envelope(0.012, duration: 0.5, gain: 0.6), 0.6, accuracy: 1e-9)
        XCTAssertLessThan(SoundSynth.envelope(0.4, duration: 0.5, gain: 0.6), 0.6)
        XCTAssertEqual(SoundSynth.envelope(0.5, duration: 0.5, gain: 0.6), 0)
    }

    func testFileNamesTheServerMayProvide() {
        XCTAssertEqual(SoundCue.finalSting.rawValue, "final")
        XCTAssertTrue(SoundCue.customNames.isSuperset(of: ["open", "buzz", "correct", "wrong", "timeup", "tick", "reveal", "dd", "final", "fanfare", "ding", "strike", "strikeout", "faceoff", "roundstart", "winner", "zero", "fmpoints", "fastmoney", "think", "lobby"]))
        XCTAssertTrue(SoundCue.customNames.isSuperset(of: ["pick", "board", "lock", "bet", "join", "applause"]))
        XCTAssertEqual(SoundCue.customNames.count, 27)
    }

    func testWavContainer() {
        let samples: [Float] = [0, 0.5, -0.5, 1, -1, 2]   // 2 is clipped to full scale
        let data = SoundSynth.wav(from: samples, sampleRate: 44100)
        let bytes = [UInt8](data)
        XCTAssertEqual(bytes.count, 44 + samples.count * 2)
        XCTAssertEqual(String(decoding: bytes[0..<4], as: UTF8.self), "RIFF")
        XCTAssertEqual(String(decoding: bytes[8..<12], as: UTF8.self), "WAVE")
        XCTAssertEqual(String(decoding: bytes[12..<16], as: UTF8.self), "fmt ")
        XCTAssertEqual(String(decoding: bytes[36..<40], as: UTF8.self), "data")
        func u32(_ at: Int) -> UInt32 { (0..<4).reduce(0) { $0 | UInt32(bytes[at + $1]) << UInt32(8 * $1) } }
        func u16(_ at: Int) -> UInt16 { UInt16(bytes[at]) | UInt16(bytes[at + 1]) << 8 }
        XCTAssertEqual(u32(4), UInt32(36 + samples.count * 2))
        XCTAssertEqual(u16(20), 1)       // PCM
        XCTAssertEqual(u16(22), 1)       // mono
        XCTAssertEqual(u32(24), 44100)
        XCTAssertEqual(u32(28), 88200)
        XCTAssertEqual(u16(34), 16)
        XCTAssertEqual(u32(40), UInt32(samples.count * 2))
        let decoded = (0..<samples.count).map { Int16(bitPattern: u16(44 + $0 * 2)) }
        XCTAssertEqual(decoded, [0, 16383, -16383, 32767, -32767, 32767])
    }
}

final class SoundPlannerTests: XCTestCase {
    private func plan(_ from: String, _ to: String) throws -> SoundPlan {
        SoundPlanner.plan(from: try Fixture.state(from), to: try Fixture.state(to))
    }

    func testNothingPlaysOnTheFirstState() throws {
        XCTAssertEqual(SoundPlanner.plan(from: nil, to: try Fixture.state("jp-open")), SoundPlan())
    }

    func testNothingPlaysWhenNothingChanged() throws {
        XCTAssertEqual(try plan("jp-board", "jp-board"), SoundPlan(stopFinalMusic: true))
    }

    func testBuzzersOpen() throws {
        XCTAssertEqual(try plan("jp-reading", "jp-open").cues, [.open])
    }

    func testSomeoneBuzzesIn() throws {
        XCTAssertEqual(try plan("jp-open", "jp-answering").cues, [.buzz])
    }

    func testAWrongAnswerSoundsWrongEvenThoughTheBuzzersReopen() throws {
        XCTAssertEqual(try plan("jp-answering", "jp-open-after-wrong").cues, [.wrong])
    }

    func testCorrectAnswer() throws {
        XCTAssertEqual(try plan("jp-open-after-wrong", "jp-reveal-correct").cues, [.correct])
    }

    func testAnAnswerClockRunningOutSoundsLikeTimeUp() throws {
        let text = String(decoding: try Fixture.data("jp-ruling-wrong"), as: UTF8.self)
        let timedOut = text.replacingOccurrences(of: "\"timedOut\": false", with: "\"timedOut\": true")
        XCTAssertNotEqual(text, timedOut)
        let after = try JSONDecoder().decode(ServerState.self, from: Data(timedOut.utf8))
        XCTAssertEqual(SoundPlanner.plan(from: try Fixture.state("jp-answering"), to: after).cues, [.timeup])
    }

    func testNobodyBuzzingRunsOutOfTime() throws {
        XCTAssertEqual(try plan("jp-open", "jp-reveal-nobody").cues, [.timeup])
    }

    func testBackToTheBoardIsSilent() throws {
        XCTAssertEqual(try plan("jp-reveal-correct", "jp-board").cues, [])
    }

    func testPickingAClue() throws {
        XCTAssertEqual(try plan("jp-board", "jp-reading").cues, [.pick])
        XCTAssertEqual(try plan("jp-reading", "jp-reading").cues, [], "the same clue still being read")
        var other = try Fixture.state("jp-reading")
        guard case .jeopardy(var game) = other.game else { return XCTFail("expected a Jeopardy state") }
        game.clue?.ri = 3
        other.game = .jeopardy(game)
        XCTAssertEqual(SoundPlanner.plan(from: try Fixture.state("jp-reading"), to: other).cues, [.pick])
    }

    func testAPlayerJoins() throws {
        let all = try Fixture.state("jp-lobby")
        guard case .jeopardy(var game) = all.game else { return XCTFail("expected a Jeopardy state") }
        game.players.removeLast()
        var fewer = all
        fewer.game = .jeopardy(game)
        XCTAssertEqual(SoundPlanner.plan(from: fewer, to: all).cues, [.join])
        XCTAssertEqual(SoundPlanner.plan(from: all, to: fewer).cues, [], "leaving is quiet")
    }

    func testFinalAnswersLockIn() throws {
        let none = try Fixture.state("jp-final-answer")
        guard case .jeopardy(var game) = none.game else { return XCTFail("expected a Jeopardy state") }
        game.finalRound?.answered = ["p1"]
        var one = none
        one.game = .jeopardy(game)
        XCTAssertEqual(SoundPlanner.plan(from: none, to: one).cues, [.lock])
        XCTAssertEqual(SoundPlanner.plan(from: one, to: one).cues, [])
    }

    func testRoundEnds() throws {
        var earlier = try Fixture.state("jp-round-end")
        guard case .jeopardy(var game) = earlier.game else { return XCTFail("expected a Jeopardy state") }
        game.phase = .reveal
        earlier.game = .jeopardy(game)
        XCTAssertEqual(SoundPlanner.plan(from: earlier, to: try Fixture.state("jp-round-end")).cues, [.applause])
    }

    func testDailyDouble() throws {
        XCTAssertEqual(try plan("jp-board", "jp-dd-wager").cues, [.dd])
        XCTAssertEqual(try plan("jp-dd-wager", "jp-dd-answer").cues, [.bet])
        XCTAssertEqual(try plan("jp-dd-answer", "jp-dd-reveal").cues, [.correct])
    }

    func testFinalJeopardyBegins() throws {
        var earlier = try Fixture.state("jp-final-wager")
        guard case .jeopardy(var game) = earlier.game else { return XCTFail("expected a Jeopardy state") }
        game.phase = .roundEnd
        game.finalRound = nil
        earlier.game = .jeopardy(game)
        let result = SoundPlanner.plan(from: earlier, to: try Fixture.state("jp-final-wager"))
        XCTAssertEqual(result.cues, [.finalSting])
        XCTAssertFalse(result.startFinalMusic)
        XCTAssertTrue(result.stopFinalMusic)
    }

    func testFinalMusicStartsWithTheCountdownAndOnlyOnce() throws {
        let started = try plan("jp-final-wager", "jp-final-answer")
        XCTAssertEqual(started.cues, [.lock], "the last wager locks in")
        XCTAssertTrue(started.startFinalMusic)
        XCTAssertFalse(started.stopFinalMusic)

        var later = try Fixture.state("jp-final-answer")
        guard case .jeopardy(var game) = later.game else { return XCTFail("expected a Jeopardy state") }
        game.timer?.leftMs = 20000
        later.game = .jeopardy(game)
        let carryingOn = SoundPlanner.plan(from: try Fixture.state("jp-final-answer"), to: later)
        XCTAssertFalse(carryingOn.startFinalMusic)
        XCTAssertFalse(carryingOn.stopFinalMusic)
    }

    func testFinalMusicStopsWhenTheCountdownEnds() throws {
        let result = try plan("jp-final-answer", "jp-final-reveal-answer")
        XCTAssertTrue(result.stopFinalMusic)
        XCTAssertFalse(result.startFinalMusic)
        XCTAssertEqual(result.cues, [.reveal], "the first response goes up")
    }

    func testFinalAnswersAreRevealedOneByOne() throws {
        XCTAssertEqual(try plan("jp-final-reveal-answer", "jp-final-reveal-first").cues, [.wrong])
        XCTAssertEqual(try plan("jp-final-reveal-first", "jp-final-reveal-first").cues, [], "nothing new, nothing plays")
        XCTAssertEqual(try plan("jp-final-reveal-first", "jp-final-reveal-more").cues, [.correct])
        XCTAssertEqual(try plan("jp-final-reveal-more", "jp-final-reveal-done").cues, [.reveal], "the correct answer")
    }

    func testWinner() throws {
        XCTAssertEqual(try plan("jp-final-reveal-done", "jp-gameover").cues, [.fanfare, .applause])
    }

    func testRoundIntro() throws {
        XCTAssertEqual(try plan("jp-lobby", "jp-round-intro").cues, [.roundstart])
        XCTAssertEqual(try plan("jp-round-end", "jp-round-intro-2").cues, [.roundstart])
        XCTAssertEqual(try plan("jp-round-intro", "jp-board").cues, [.board], "the board fills in")
    }

    func testTheRulingSoundsOnceAndTheNextStepIsQuiet() throws {
        XCTAssertEqual(try plan("jp-answering", "jp-ruling-wrong").cues, [.wrong])
        XCTAssertEqual(try plan("jp-ruling-wrong", "jp-open-after-wrong").cues, [])
        XCTAssertEqual(try plan("jp-open-after-wrong", "jp-ruling-right").cues, [.correct])
        XCTAssertEqual(try plan("jp-ruling-right", "jp-reveal-correct").cues, [])
    }

    func testHostTestSoundButton() throws {
        let before = try Fixture.state("jp-board")
        var after = before
        after.room.settings.ping += 1
        XCTAssertEqual(SoundPlanner.plan(from: before, to: after).cues, [.correct])
    }

    func testOtherGamesGetOnlyTheRoomSounds() throws {
        let before = try Fixture.state("jp-board")
        var after = try Fixture.state("other-game")
        after.room.settings.ping += 1
        XCTAssertEqual(SoundPlanner.plan(from: before, to: after).cues, [.correct])
        XCTAssertEqual(SoundPlanner.plan(from: before, to: try Fixture.state("other-game")).cues, [])
    }

    // MARK: Music and ticks

    func testLobbyMusicWhileJoining() throws {
        for name in ["jp-lobby", "jp-lobby-archive", "no-game-chosen", "other-game", "feud-lobby"] {
            XCTAssertTrue(SoundPlanner.wantsLobbyMusic(try Fixture.state(name)), name)
        }
        for name in ["jp-board", "jp-open", "jp-final-answer", "jp-gameover"] {
            XCTAssertFalse(SoundPlanner.wantsLobbyMusic(try Fixture.state(name)), name)
        }
        // The theme comes back after a win, but not during play.
        XCTAssertTrue(SoundPlanner.wantsThemeMusic(try Fixture.state("jp-gameover")))
        XCTAssertTrue(SoundPlanner.wantsThemeMusic(try Fixture.state("jp-lobby")))
        for name in ["jp-board", "jp-open", "jp-final-answer", "jp-round-end"] {
            XCTAssertFalse(SoundPlanner.wantsThemeMusic(try Fixture.state(name)), name)
        }
    }

    func testWhichCountdownIsOnScreen() throws {
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("jp-open"))?.kind, "buzz")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("jp-answering"))?.kind, "answer")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("jp-dd-answer"))?.kind, "answer")
        XCTAssertEqual(SoundPlanner.activeTimer(in: try Fixture.state("jp-final-answer"))?.kind, "final")
        for name in ["jp-board", "jp-reading", "jp-round-intro", "jp-ruling-wrong", "jp-reveal-correct", "jp-dd-wager", "jp-final-wager", "jp-final-reveal-first", "jp-gameover", "jp-lobby"] {
            XCTAssertNil(SoundPlanner.activeTimer(in: try Fixture.state(name)), name)
        }
    }
}

final class TickTrackerTests: XCTestCase {
    private let start = Date(timeIntervalSinceReferenceDate: 5000)

    private func countdown(left: Int = 10000, total: Int = 10000, receivedAt: Date? = nil) -> Countdown {
        Countdown(timer: TimerState(kind: "buzz", totalMs: total, leftMs: left, timedOut: false), receivedAt: receivedAt ?? start)
    }

    private func ticks(_ countdown: Countdown, over seconds: Double, musicPlaying: Bool = false) -> [Int] {
        var tracker = TickTracker()
        var ticked: [Int] = []
        var time = 0.0
        while time <= seconds {
            let now = start.addingTimeInterval(time)
            if tracker.shouldTick(countdown: countdown, now: now, musicPlaying: musicPlaying) {
                ticked.append(countdown.secondsShown(at: now))
            }
            time += 0.1
        }
        return ticked
    }

    func testTicksOncePerSecondForTheLastFive() {
        XCTAssertEqual(ticks(countdown(), over: 10), [5, 4, 3, 2, 1])
    }

    func testNoTickWhenItStartsInsideTheLastFiveSeconds() {
        // A timer that opens on 4 does not tick for the 4, only for 3, 2, 1.
        XCTAssertEqual(ticks(countdown(left: 4000), over: 5), [3, 2, 1])
    }

    func testNoTicksOverMusic() {
        XCTAssertEqual(ticks(countdown(), over: 10, musicPlaying: true), [])
    }

    func testResetsWhenThereIsNoCountdownAndWhenANewOneStarts() {
        var tracker = TickTracker()
        let first = countdown()
        XCTAssertFalse(tracker.shouldTick(countdown: first, now: start, musicPlaying: false))
        XCTAssertTrue(tracker.shouldTick(countdown: first, now: start.addingTimeInterval(5.1), musicPlaying: false))
        XCTAssertFalse(tracker.shouldTick(countdown: nil, now: start.addingTimeInterval(6), musicPlaying: false))
        // The next timer begins fresh: no tick on its opening number.
        let second = countdown(left: 5000, receivedAt: start.addingTimeInterval(7))
        XCTAssertFalse(tracker.shouldTick(countdown: second, now: start.addingTimeInterval(7), musicPlaying: false))
        XCTAssertTrue(tracker.shouldTick(countdown: second, now: start.addingTimeInterval(8.05), musicPlaying: false))
    }
}

final class ServerSoundListTests: XCTestCase {
    func testDecodesTheServersSoundList() throws {
        let json = Data(#"[{"name":"buzz","url":"/sounds/buzz.mp3"},{"name":"think","url":"/sounds/think.m4a"}]"#.utf8)
        let sounds = try JSONDecoder().decode([ServerSound].self, from: json)
        XCTAssertEqual(sounds, [ServerSound(name: "buzz", url: "/sounds/buzz.mp3"), ServerSound(name: "think", url: "/sounds/think.m4a")])
        XCTAssertEqual(try JSONDecoder().decode([ServerSound].self, from: Data("[]".utf8)), [])
    }
}

final class CluePlannerTests: XCTestCase {
    private func jeopardy(_ name: String) throws -> JeopardyState {
        try XCTUnwrap(try Fixture.state(name).jeopardy)
    }

    func testAPickedClueIsReadAndTheGameIsToldWhenTheVoiceStops() throws {
        let reading = try jeopardy("jp-reading")
        let plan = CluePlanner.plan(from: try jeopardy("jp-board"), to: reading, spoken: nil)
        let say = try XCTUnwrap(plan.speak)
        XCTAssertEqual(say.text, reading.clue?.q)
        XCTAssertEqual(say.doneColumn, reading.clue?.ci)
        XCTAssertEqual(say.doneRow, reading.clue?.ri)
        XCTAssertFalse(say.thenFinalMusic)
        XCTAssertNil(CluePlanner.plan(from: reading, to: reading, spoken: say.key).speak, "never read twice")
    }

    func testTheVoiceGoesOnThroughTheBuzzAndStopsBackAtTheBoard() throws {
        XCTAssertFalse(CluePlanner.plan(from: try jeopardy("jp-reading"), to: try jeopardy("jp-open"), spoken: "x").stop)
        XCTAssertTrue(CluePlanner.plan(from: try jeopardy("jp-reveal-correct"), to: try jeopardy("jp-board"), spoken: "x").stop)
    }

    func testADailyDoubleIsReadOnceTheBetIsIn() throws {
        let say = try XCTUnwrap(CluePlanner.plan(from: try jeopardy("jp-dd-wager"), to: try jeopardy("jp-dd-answer"), spoken: nil).speak)
        XCTAssertNil(say.doneColumn, "no buzzers to open")
    }

    func testFinalJeopardyIsReadBeforeTheThinkMusic() throws {
        let say = try XCTUnwrap(CluePlanner.plan(from: try jeopardy("jp-final-wager"), to: try jeopardy("jp-final-answer"), spoken: nil).speak)
        XCTAssertTrue(say.thenFinalMusic)
    }

    func testNothingIsReadWhenSwitchedOffOrWithAHost() throws {
        var reading = try jeopardy("jp-reading")
        reading.readsAloud = false
        XCTAssertNil(CluePlanner.plan(from: try jeopardy("jp-board"), to: reading, spoken: nil).speak)
        XCTAssertEqual(try jeopardy("jp-host-reading").readsAloud, false)
    }

    func testASoundClueIsPlayedFirstEvenWithReadingAloudOff() throws {
        var reading = try jeopardy("jp-reading")
        reading.readsAloud = false
        reading.clue?.media = JeoMedia(kind: "audio", url: "https://example.com/moo.mp3", start: 2, end: 60, credit: "CC0")
        let say = try XCTUnwrap(CluePlanner.plan(from: try jeopardy("jp-board"), to: reading, spoken: nil).speak)
        XCTAssertEqual(say.media?.url, "https://example.com/moo.mp3")
        XCTAssertFalse(say.speaks, "only the sound plays; the voice stays quiet")
        XCTAssertEqual(say.doneColumn, reading.clue?.ci)
        XCTAssertEqual(say.media?.span.end, 32, "never more than 30 seconds")
        // A picture does not play, so with reading aloud off there is nothing to do.
        reading.clue?.media = JeoMedia(kind: "image", url: "https://example.com/flag.png")
        XCTAssertNil(CluePlanner.plan(from: try jeopardy("jp-board"), to: reading, spoken: nil).speak)
    }

    func testTheClipStopsOnceTheClueLeavesTheScreen() throws {
        XCTAssertFalse(CluePlanner.plan(from: try jeopardy("jp-board"), to: try jeopardy("jp-reading"), spoken: nil).stopClip)
        XCTAssertTrue(CluePlanner.plan(from: try jeopardy("jp-reading"), to: try jeopardy("jp-open"), spoken: "x").stopClip)
    }

    func testBlanksAreReadAsBlank() {
        XCTAssertEqual(CluePlanner.spoken("Fill in the ____ please"), "Fill in the blank please")
    }
}

final class FamilyScoreboardTests: XCTestCase {
    func testTheChampionsScreenSaysWhoHasWonOnThisTV() throws {
        let game = try XCTUnwrap(try Fixture.state("jp-gameover").jeopardy)
        XCTAssertEqual(game.hall?.line, "Family scoreboard after 1 game: Leo 1 win")
    }

    func testStreaksAndNoChampionYet() {
        let maya = JeoHallEntry(name: "Maya", color: "#f97316", wins: 3, games: 4, best: 9000, streak: 2)
        let leo = JeoHallEntry(name: "Leo", color: "#ef4444", wins: 1, games: 4, best: 4000, streak: 0)
        XCTAssertEqual(JeoHall(games: 4, players: [maya, leo]).line, "Family scoreboard after 4 games: Maya 3 wins (2 in a row) \u{00B7} Leo 1 win")
        XCTAssertEqual(JeoHall(games: 2, players: [JeoHallEntry(name: "Dad", color: "#fff", wins: 0, games: 2, best: 0, streak: 0)]).line,
                       "Family scoreboard after 2 games: no champion yet")
        XCTAssertNil(JeoHall(games: 0, players: []).line)
    }
}
