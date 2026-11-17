import Foundation

/// One character slot in the title hint.
public enum HintGlyph: Equatable, Sendable {
    /// A letter or digit still hidden: drawn as a blank.
    case hidden
    /// A letter or digit given away by the hint.
    case shown(Character)
    /// Punctuation like ' or & that is always shown.
    case symbol(Character)
}

/// Builds the title hint, a row of blanks like "H _ _   J _ _ _".
public enum TitleHint {
    /// The title without extras like "(feat. X)", "[Live]" or "- Remastered 2011",
    /// which would make the hint unfair.
    public static func cleaned(_ title: String) -> String {
        var result = title
        // Drop bracketed parts: (...) and [...]
        for (open, close) in [("(", ")"), ("[", "]")] {
            while let start = result.range(of: open),
                  let end = result.range(of: close, range: start.upperBound..<result.endIndex) {
                result.removeSubrange(start.lowerBound..<end.upperBound)
            }
        }
        // Drop " - Remastered", " - Live", etc.
        if let dash = result.range(of: " - ") {
            result = String(result[..<dash.lowerBound])
        }
        result = result
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
        return result.isEmpty ? title.trimmingCharacters(in: .whitespacesAndNewlines) : result
    }

    /// Words that contain at least one letter or digit, so a lone "&" or "-" doesn't count.
    public static func words(in title: String) -> [String] {
        cleaned(title)
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
            .filter { word in word.contains { $0.isLetter || $0.isNumber } }
    }

    /// First letter or digit of the title, uppercased.
    public static func firstLetter(of title: String) -> String? {
        guard let character = cleaned(title).first(where: { $0.isLetter || $0.isNumber }) else {
            return nil
        }
        return String(character).uppercased()
    }

    /// Share of letters the fill-in style shows by the end of the clip. The
    /// rest stay blank until the reveal.
    public static let maxFill = 0.7

    /// The title as words of slots. Letters and digits become blanks, except
    /// the ones `style` gives away; punctuation stays visible. `fill` (0 to 1)
    /// only matters for the fill-in style.
    public static func glyphs(for title: String, style: TitleHintStyle, fill: Double = 0) -> [[HintGlyph]] {
        let words = cleaned(title).split(whereSeparator: { $0.isWhitespace }).map(Array.init)
        let shown = shownPositions(in: words, style: style, fill: fill)
        return words.enumerated().map { w, word in
            word.enumerated().map { c, character -> HintGlyph in
                guard character.isLetter || character.isNumber else { return .symbol(character) }
                let position = Position(word: w, char: c)
                return shown.contains(position) ? .shown(Character(String(character).uppercased())) : .hidden
            }
        }
    }

    /// The hint as plain text, e.g. "H _ _   J _ _ _".
    public static func text(for title: String, style: TitleHintStyle, fill: Double = 0) -> String {
        glyphs(for: title, style: style, fill: fill)
            .map { word in
                word.map { glyph -> String in
                    switch glyph {
                    case .hidden: return "_"
                    case .shown(let c), .symbol(let c): return String(c)
                    }
                }
                .joined(separator: " ")
            }
            .joined(separator: "   ")
    }

    private struct Position: Hashable {
        let word: Int
        let char: Int
    }

    private static func shownPositions(in words: [[Character]], style: TitleHintStyle, fill: Double) -> Set<Position> {
        var firsts: [Position] = []
        var others: [Position] = []
        for (w, word) in words.enumerated() {
            var sawLetter = false
            for (c, character) in word.enumerated() where character.isLetter || character.isNumber {
                if sawLetter { others.append(Position(word: w, char: c)) } else { firsts.append(Position(word: w, char: c)) }
                sawLetter = true
            }
        }

        switch style {
        case .blanks:
            return []
        case .firstLetter:
            return Set(firsts.prefix(1))
        case .firstLetterOfEachWord:
            return Set(firsts)
        case .fillIn, .fillInLettersOnly:
            // First letters of each word go first, then the rest in a
            // shuffled order that's the same every time for this title.
            var generator = StableGenerator(seed: words.map { String($0) }.joined(separator: " "))
            let order = firsts + others.shuffled(using: &generator)
            let target = Int((min(max(fill, 0), 1) * maxFill * Double(order.count)).rounded(.down))
            return Set(order.prefix(target))
        }
    }
}

/// Small seeded random generator (SplitMix64) so the fill-in order doesn't
/// change from one screen refresh to the next.
private struct StableGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: String) {
        // FNV-1a hash of the text.
        var hash: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in seed.utf8 {
            hash ^= UInt64(byte)
            hash = hash &* 0x0000_0100_0000_01B3
        }
        state = hash
    }

    mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}
