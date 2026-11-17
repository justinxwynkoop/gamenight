import XCTest
@testable import SingoCore

/// Fixed-seed generator so shuffles are repeatable.
struct SeededGenerator: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

final class RoundEngineTests: XCTestCase {
    func songs(_ count: Int) -> [SongInfo] {
        (1...count).map { SongInfo(id: "\($0)", title: "Song \($0)", artistName: "Artist \($0)", duration: 200) }
    }

    func engine(_ count: Int = 3, settings: RoundSettings = RoundSettings()) -> RoundEngine {
        var generator = SeededGenerator(state: 1)
        return RoundEngine(songs: songs(count), settings: settings, using: &generator)
    }

    /// Ticks in 0.5 s steps for `seconds`, collecting events.
    func run(_ engine: inout RoundEngine, for seconds: TimeInterval) -> [RoundEngine.Event] {
        var events: [RoundEngine.Event] = []
        var t = 0.0
        while t < seconds - 0.0001 {
            events += engine.tick(0.5)
            t += 0.5
        }
        return events
    }

    func testShuffleKeepsEverySongOnceAndDropsDuplicates() {
        var generator = SeededGenerator(state: 7)
        let list = songs(20) + [songs(20)[0]]
        let round = RoundEngine(songs: list, using: &generator)
        XCTAssertEqual(round.songs.count, 20)
        XCTAssertEqual(Set(round.songs.map(\.id)), Set(songs(20).map(\.id)))
    }

    func testStartPlaysFirstSongAtOffset() {
        let round = engine()
        XCTAssertEqual(round.start(), [.play(round.songs[0], startTime: 45)])
    }

    func testTitleHintIsOffByDefault() {
        XCTAssertFalse(RoundSettings().isEnabled(.title))
        var round = engine()
        _ = run(&round, for: 29)
        XCTAssertFalse(round.isShowing(.title))
    }

    func testDefaultHintSchedule() {
        // Defaults: title off, so genre+year, art and artist are spread
        // evenly over 30 s: 7.5, 15 and 22.5 s.
        var round = engine()
        _ = run(&round, for: 7)
        XCTAssertFalse(round.isShowing(.genre))
        _ = run(&round, for: 0.5)
        XCTAssertTrue(round.isShowing(.genre))
        XCTAssertTrue(round.isShowing(.year))
        XCTAssertFalse(round.isShowing(.art))
        _ = run(&round, for: 7.5) // 15 s
        XCTAssertTrue(round.isShowing(.art))
        XCTAssertEqual(round.artSharpness, 0, accuracy: 0.001)
        XCTAssertFalse(round.isShowing(.artist))
        _ = run(&round, for: 7.5) // 22.5 s
        XCTAssertTrue(round.isShowing(.artist))
        XCTAssertEqual(round.artSharpness, 0.5, accuracy: 0.001)
        XCTAssertEqual(round.phase, .playing)
    }

    func testHintsSpreadOutWhenSomeAreOff() {
        var settings = RoundSettings()
        settings.setEnabled(.year, false)
        settings.setEnabled(.art, false)
        // Genre and artist only: 10 s and 20 s.
        XCTAssertEqual(settings.time(of: .genre), 10, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .artist), 20, accuracy: 0.001)

        settings.setEnabled(.title, true)
        settings.titleHintStyle = .blanks
        // Title, genre, artist: 7.5, 15, 22.5 s.
        XCTAssertEqual(settings.time(of: .title), 7.5, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .artist), 22.5, accuracy: 0.001)

        settings.titleHintStyle = .fillIn
        // Fill-in title starts at 0 and doesn't take a slot.
        XCTAssertEqual(settings.time(of: .title), 0)
        XCTAssertEqual(settings.time(of: .artist), 20, accuracy: 0.001)
    }

    func testAllHintsOnAreSpreadEvenly() {
        var settings = RoundSettings()
        settings.setEnabled(.title, true)
        settings.titleHintStyle = .blanks
        XCTAssertEqual(settings.time(of: .title), 6, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .genre), 12, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .year), 12, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .art), 18, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .artist), 24, accuracy: 0.001)
    }

    func testRevealAtClipEndThenAutoAdvance() {
        var round = engine()
        let first = round.songs[0]
        let events = run(&round, for: 30)
        XCTAssertEqual(events, [.revealed(CalledSong(number: 1, song: first))])
        XCTAssertEqual(round.phase, .revealed)
        XCTAssertEqual(round.called.map(\.song), [first])

        XCTAssertTrue(run(&round, for: 7.5).isEmpty)  // answer stays up 8 s
        let next = run(&round, for: 0.5)
        XCTAssertEqual(next, [.play(round.songs[1], startTime: 45)])
        XCTAssertEqual(round.phase, .playing)
        XCTAssertEqual(round.elapsed, 0)
        XCTAssertFalse(round.isShowing(.genre))
    }

    func testManualAdvanceWaitsOnReveal() {
        var settings = RoundSettings()
        settings.autoAdvance = false
        var round = engine(settings: settings)
        _ = run(&round, for: 120)
        XCTAssertEqual(round.phase, .revealed)
        XCTAssertEqual(round.index, 0)
        let events = round.skip()
        XCTAssertEqual(events, [.play(round.songs[1], startTime: 45)])
    }

    func testPauseStopsTheClock() {
        var round = engine()
        _ = run(&round, for: 5)
        round.togglePause()
        _ = run(&round, for: 60)
        XCTAssertEqual(round.elapsed, 5)
        round.togglePause()
        _ = run(&round, for: 1)
        XCTAssertEqual(round.elapsed, 6)
    }

    func testSongIsCalledOnceItsMusicStarts() {
        var round = engine()
        XCTAssertTrue(round.called.isEmpty)
        round.markCurrentCalled()
        round.markCurrentCalled()  // only once
        XCTAssertEqual(round.called.map(\.song), [round.songs[0]])
        _ = run(&round, for: 5)
        _ = round.skip()
        // The skipped song stays called; the next isn't until its music starts.
        XCTAssertEqual(round.called.count, 1)
        round.markCurrentCalled()
        XCTAssertEqual(round.called.map(\.song), [round.songs[0], round.songs[1]])
        XCTAssertEqual(round.called.map(\.number), [1, 2])
        _ = round.replay()
        round.markCurrentCalled()
        XCTAssertEqual(round.called.count, 2)
    }

    func testSongThatNeverPlayedIsNotCalled() {
        var round = engine()
        _ = round.skip()          // first song never started
        round.markCurrentCalled()
        XCTAssertEqual(round.called.map(\.song), [round.songs[1]])
        XCTAssertEqual(round.called.first?.number, 1)
    }

    func testRevealCallsSongIfNotAlready() {
        var round = engine()
        round.markCurrentCalled()
        _ = run(&round, for: 30)
        XCTAssertEqual(round.called.count, 1)
    }

    func testAddTimeDelaysRevealAndKeepsHintTimes() {
        var round = engine()
        _ = run(&round, for: 22)
        round.addTime()
        XCTAssertEqual(round.revealTime, 45)
        _ = run(&round, for: 10) // 32 s
        XCTAssertEqual(round.phase, .playing)
        XCTAssertTrue(round.isShowing(.artist))
        _ = run(&round, for: 13) // 45 s
        XCTAssertEqual(round.phase, .revealed)
    }

    func testAddTimeAfterRevealHoldsAnswerLonger() {
        var round = engine()
        _ = run(&round, for: 30)
        round.addTime()
        _ = run(&round, for: 5)
        XCTAssertEqual(round.phase, .revealed)
        XCTAssertEqual(round.index, 0)
        _ = run(&round, for: 18)   // 30 + 8 + 15 = 53 s
        XCTAssertEqual(round.index, 1)
    }

    func testReplayRestartsClipButKeepsHints() {
        var round = engine()
        _ = run(&round, for: 16)
        let events = round.replay()
        XCTAssertEqual(events, [.play(round.songs[0], startTime: 45)])
        XCTAssertEqual(round.elapsed, 0)
        XCTAssertTrue(round.isShowing(.genre))
        XCTAssertEqual(round.remaining, 30)
    }

    func testRoundFinishesAfterLastSong() {
        var round = engine(2)
        let events = run(&round, for: 80)   // 2 songs × 38 s
        XCTAssertEqual(events.last, .finished)
        XCTAssertEqual(round.phase, .finished)
        XCTAssertNil(round.currentSong)
        XCTAssertEqual(round.called.count, 2)
        XCTAssertEqual(round.called.map(\.number), [1, 2])
    }

    func testEmptyPlaylistIsFinished() {
        let round = RoundEngine(songs: [])
        XCTAssertEqual(round.phase, .finished)
        XCTAssertEqual(round.start(), [.finished])
    }

    func testTurnedOffHintStaysOffEvenAtReveal() {
        var settings = RoundSettings()
        settings.setEnabled(.artist, false)
        var round = engine(settings: settings)
        _ = run(&round, for: 29)
        XCTAssertFalse(round.isShowing(.artist))
        XCTAssertTrue(round.isShowing(.art))
        _ = run(&round, for: 1)
        XCTAssertEqual(round.phase, .revealed)
        XCTAssertFalse(round.isShowing(.artist))
        XCTAssertFalse(round.isShowing(.title))  // title hint is off by default
        XCTAssertTrue(round.isShowing(.genre))
    }

    func testOldSavedSettingsStillLoad() throws {
        let json = #"{"clipLength": 45, "titleHintStyle": "both"}"#
        let settings = try JSONDecoder().decode(RoundSettings.self, from: Data(json.utf8))
        XCTAssertEqual(settings.clipLength, 45)
        XCTAssertEqual(settings.titleHintStyle, .firstLetter)
        XCTAssertEqual(settings.enabledHints, RoundSettings().enabledHints)
    }

    func testOldSavedAnswerHoldIsReplacedByNewDefault() throws {
        let json = #"{"revealHold": 5, "clipLength": 20}"#
        let settings = try JSONDecoder().decode(RoundSettings.self, from: Data(json.utf8))
        XCTAssertEqual(settings.revealHold, 8)
        XCTAssertEqual(settings.clipLength, 20)
    }

    func testSettingsRoundTrip() throws {
        var settings = RoundSettings()
        settings.setEnabled(.art, false)
        settings.startOffset = 15
        settings.background = .animated
        settings.revealHold = 15
        let data = try JSONEncoder().encode(settings)
        XCTAssertEqual(try JSONDecoder().decode(RoundSettings.self, from: data), settings)
    }

    func testHintScheduleScalesWithClipLength() {
        var settings = RoundSettings()
        settings.clipLength = 60
        XCTAssertEqual(settings.time(of: .genre), 15, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .art), 30, accuracy: 0.001)
        XCTAssertEqual(settings.time(of: .artist), 45, accuracy: 0.001)
    }

    func testShortSongsStartEarlier() {
        let settings = RoundSettings()
        XCTAssertEqual(settings.startTime(forSongDuration: 300), 45)
        XCTAssertEqual(settings.startTime(forSongDuration: 60), 22)  // 60 - 30 - 8
        XCTAssertEqual(settings.startTime(forSongDuration: 20), 0)
        XCTAssertEqual(settings.startTime(forSongDuration: nil), 45)
    }

    func testEngineFillsTitleOverTheClip() {
        var settings = RoundSettings()
        settings.setEnabled(.title, true)
        settings.titleHintStyle = .fillIn
        XCTAssertEqual(settings.time(of: .title), 0)  // fill-in starts with the song
        var round = engine(settings: settings)
        XCTAssertTrue(round.isShowing(.title))
        _ = run(&round, for: 15)
        XCTAssertEqual(settings.titleFill(at: round.hintClock), 0.5, accuracy: 0.001)
        round.addTime()   // more time must not take letters back
        XCTAssertEqual(settings.titleFill(at: round.hintClock), 0.5, accuracy: 0.001)
        settings.titleHintStyle = .blanks
        XCTAssertEqual(settings.time(of: .title), 6)
    }
}

final class TitleHintTests: XCTestCase {
    func testCleansExtras() {
        XCTAssertEqual(TitleHint.cleaned("Hey Jude - Remastered 2015"), "Hey Jude")
        XCTAssertEqual(TitleHint.cleaned("Old Town Road (feat. Billy Ray Cyrus) [Remix]"), "Old Town Road")
        XCTAssertEqual(TitleHint.cleaned("(Live)"), "(Live)")
    }

    func testWordCountIgnoresSymbols() {
        XCTAssertEqual(TitleHint.words(in: "Rock & Roll").count, 2)
        XCTAssertEqual(TitleHint.words(in: "Don't Stop Believin'").count, 3)
    }

    func testHintText() {
        XCTAssertEqual(TitleHint.text(for: "Hey Jude", style: .blanks), "_ _ _   _ _ _ _")
        XCTAssertEqual(TitleHint.text(for: "Hey Jude", style: .firstLetter), "H _ _   _ _ _ _")
        XCTAssertEqual(TitleHint.text(for: "hey jude", style: .firstLetterOfEachWord), "H _ _   J _ _ _")
        XCTAssertEqual(TitleHint.text(for: "99 Luftballons", style: .firstLetter), "9 _   _ _ _ _ _ _ _ _ _ _ _")
    }

    func testHintKeepsPunctuationAndDropsExtras() {
        XCTAssertEqual(TitleHint.text(for: "Don't Stop - Remastered", style: .blanks), "_ _ _ ' _   _ _ _ _")
        XCTAssertEqual(TitleHint.text(for: "Rock & Roll (Live)", style: .firstLetterOfEachWord), "R _ _ _   &   R _ _ _")
    }

    func testHintGlyphs() {
        XCTAssertEqual(TitleHint.glyphs(for: "Go!", style: .firstLetter), [[.shown("G"), .hidden, .symbol("!")]])
    }

    func testFillInStartsBlankAndFillsMostLetters() {
        let title = "Hey Jude"   // 7 letters
        XCTAssertEqual(TitleHint.text(for: title, style: .fillIn, fill: 0), "_ _ _   _ _ _ _")
        // First letters of each word come first.
        XCTAssertEqual(TitleHint.text(for: title, style: .fillIn, fill: 0.4), "H _ _   _ _ _ _")
        let full = TitleHint.glyphs(for: title, style: .fillIn, fill: 1).flatMap { $0 }
        let shown = full.filter { if case .shown = $0 { return true } else { return false } }.count
        XCTAssertEqual(shown, 4)  // 70% of 7, rounded down: never the whole title
        XCTAssertTrue(TitleHint.text(for: title, style: .fillIn, fill: 1).hasPrefix("H"))
    }

    func testLettersOnlyFillsLikeFillIn() {
        XCTAssertEqual(TitleHint.text(for: "Hey Jude", style: .fillInLettersOnly, fill: 0.6),
                       TitleHint.text(for: "Hey Jude", style: .fillIn, fill: 0.6))
        XCTAssertFalse(TitleHintStyle.fillInLettersOnly.showsBlanks)
        XCTAssertTrue(TitleHintStyle.fillInLettersOnly.fillsIn)
    }

    func testFillInIsStableAndOnlyGrows() {
        let title = "Bohemian Rhapsody"
        var previous = 0
        for step in 0...10 {
            let fill = Double(step) / 10
            let a = TitleHint.text(for: title, style: .fillIn, fill: fill)
            XCTAssertEqual(a, TitleHint.text(for: title, style: .fillIn, fill: fill))
            let count = a.filter { $0 != "_" && $0 != " " }.count
            XCTAssertGreaterThanOrEqual(count, previous)
            previous = count
        }
    }


    func testDetailsRespectToggles() {
        let song = SongInfo(id: "1", title: "x", artistName: "y", genreNames: ["Pop"], releaseYear: 1984)
        XCTAssertEqual(song.details(genre: true, year: false), "Pop")
        XCTAssertEqual(song.details(genre: false, year: true), "1984")
        XCTAssertNil(song.details(genre: false, year: false))
    }

    func testGenreAndYear() {
        let song = SongInfo(id: "1", title: "x", artistName: "y", genreNames: ["Music", "Pop"], releaseYear: 1984)
        XCTAssertEqual(song.genreAndYear, "Pop · 1984")
        XCTAssertNil(SongInfo(id: "2", title: "x", artistName: "y", genreNames: ["Music"]).genreAndYear)
    }
}
