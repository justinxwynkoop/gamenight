import Foundation

/// The four hints, in the order they normally appear.
public enum Hint: String, CaseIterable, Codable, Sendable {
    case genre
    case year
    case title
    case art
    case artist
}

public enum TitleHintStyle: String, CaseIterable, Codable, Sendable {
    /// "_ _ _   _ _ _ _": word count and word lengths only.
    case blanks
    /// "H _ _   _ _ _ _": plus the first letter of the title.
    case firstLetter
    /// "H _ _   J _ _ _": plus the first letter of every word.
    case firstLetterOfEachWord
    /// Starts as blanks and fills in letters as the song plays.
    case fillIn
    /// Like fillIn, but with no blank lines: letters just appear in place.
    case fillInLettersOnly

    /// Fill-in styles reveal more letters as the song plays.
    public var fillsIn: Bool { self == .fillIn || self == .fillInLettersOnly }

    /// Whether hidden letters are drawn as blank lines.
    public var showsBlanks: Bool { self != .fillInLettersOnly }

    public var label: String {
        switch self {
        case .blanks: return "Blanks"
        case .firstLetter: return "First letter"
        case .firstLetterOfEachWord: return "First letter of each word"
        case .fillIn: return "Fills in as it plays"
        case .fillInLettersOnly: return "Fills in, no blanks"
        }
    }
}

/// What's behind the game screen.
public enum BackgroundStyle: String, CaseIterable, Codable, Sendable {
    case black
    /// A soft glow in the playlist artwork's main color.
    case playlistColor
    /// Slowly drifting colored light.
    case animated
    /// Glowing colored bubbles floating up the screen.
    case bubbles
    /// Glowing colored balls bouncing off the edges of the screen.
    case bouncingBalls

    public var label: String {
        switch self {
        case .black: return "Black"
        case .playlistColor: return "Playlist color"
        case .animated: return "Drifting light"
        case .bubbles: return "Floating bubbles"
        case .bouncingBalls: return "Bouncing balls"
        }
    }
}

/// Every timing in a round. Defaults: 30 s clip starting 45 s into the song,
/// hints spread over the clip, reveal at 30 s, next song at 38 s.
public struct RoundSettings: Codable, Equatable, Sendable {
    /// Seconds of music before the reveal.
    public var clipLength: TimeInterval = 30
    /// Where in the song the clip starts, to skip long intros.
    public var startOffset: TimeInterval = 45
    /// Seconds the answer stays up, with the music still playing, before the
    /// next song starts.
    public var revealHold: TimeInterval = 8
    /// How much the "add time" button adds.
    public var addTimeStep: TimeInterval = 15
    public var titleHintStyle: TitleHintStyle = .firstLetter
    /// When false, the round waits on the reveal screen until the host moves on.
    public var autoAdvance: Bool = true
    /// Hints that appear during the clip. Turned-off hints stay hidden until
    /// the reveal. The title hint is off unless the host turns it on.
    public var enabledHints: Set<Hint> = [.genre, .year, .art, .artist]
    public var background: BackgroundStyle = .black


    public init() {}

    public func isEnabled(_ hint: Hint) -> Bool { enabledHints.contains(hint) }

    public mutating func setEnabled(_ hint: Hint, _ enabled: Bool) {
        if enabled { enabledHints.insert(hint) } else { enabledHints.remove(hint) }
    }

    // Decode field by field so settings saved by an older version still load,
    // with defaults for anything new.
    private enum CodingKeys: String, CodingKey {
        // Saved under a new name so older saves (which stored 5 seconds
        // without a way to change it) pick up the new 8-second default.
        case revealHold = "answerSeconds"
        case clipLength, startOffset, addTimeStep, titleHintStyle,
             autoAdvance, enabledHints, background
    }

    public init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        clipLength = (try? c.decodeIfPresent(TimeInterval.self, forKey: .clipLength)) ?? clipLength
        startOffset = (try? c.decodeIfPresent(TimeInterval.self, forKey: .startOffset)) ?? startOffset
        revealHold = (try? c.decodeIfPresent(TimeInterval.self, forKey: .revealHold)) ?? revealHold
        addTimeStep = (try? c.decodeIfPresent(TimeInterval.self, forKey: .addTimeStep)) ?? addTimeStep
        titleHintStyle = (try? c.decodeIfPresent(TitleHintStyle.self, forKey: .titleHintStyle)) ?? titleHintStyle
        autoAdvance = (try? c.decodeIfPresent(Bool.self, forKey: .autoAdvance)) ?? autoAdvance
        enabledHints = (try? c.decodeIfPresent(Set<Hint>.self, forKey: .enabledHints)) ?? enabledHints
        background = (try? c.decodeIfPresent(BackgroundStyle.self, forKey: .background)) ?? background
    }

    /// The hints that are on, in the order they appear. Genre and year share
    /// a slot. A fill-in title isn't here because it starts with the song.
    public var hintSlots: [[Hint]] {
        var slots: [[Hint]] = []
        if isEnabled(.title), !titleHintStyle.fillsIn { slots.append([.title]) }
        let details = [Hint.genre, .year].filter { isEnabled($0) }
        if !details.isEmpty { slots.append(details) }
        if isEnabled(.art) { slots.append([.art]) }
        if isEnabled(.artist) { slots.append([.artist]) }
        return slots
    }

    /// Seconds into the clip when `hint` appears. The hints that are on are
    /// spread evenly over the clip (e.g. three hints in a 30 s clip appear at
    /// 7.5, 15 and 22.5 s), so turning one off doesn't leave a long gap. A
    /// fill-in title starts with the song so it has the whole clip to fill.
    /// Hints that are off return the clip length.
    public func time(of hint: Hint) -> TimeInterval {
        if hint == .title, titleHintStyle.fillsIn { return isEnabled(.title) ? 0 : clipLength }
        let slots = hintSlots
        guard let index = slots.firstIndex(where: { $0.contains(hint) }) else { return clipLength }
        return clipLength * Double(index + 1) / Double(slots.count + 1)
    }

    /// How far the fill-in title hint has filled, from 0 when the title hint
    /// appears to 1 at the end of the clip.
    public func titleFill(at seconds: TimeInterval) -> Double {
        let start = time(of: .title)
        guard clipLength > start else { return 1 }
        return min(max((seconds - start) / (clipLength - start), 0), 1)
    }

    /// Where playback should start for a song of the given length. Moves the
    /// start earlier for short songs so the clip and reveal still fit.
    public func startTime(forSongDuration duration: TimeInterval?) -> TimeInterval {
        let offset = max(0, startOffset)
        guard let duration, duration > 0 else { return offset }
        let latest = max(0, duration - clipLength - revealHold)
        return min(offset, latest)
    }
}
