import Foundation

/// Question sets copied into the app on your Mac (see Tools/install-sets.sh), beyond the ones that ship with it. They are
/// not in the git repository: sets built from public survey data stay out of it. A file is named `<game>__<id>.json`,
/// for instance `feud__protoqa-004.json`.
enum LocalSets {
    static func isValidID(_ id: String) -> Bool {
        guard let first = id.unicodeScalars.first, id.count <= 61 else { return false }
        let lowerOrDigit = { (c: Unicode.Scalar) in (c >= "a" && c <= "z") || (c >= "0" && c <= "9") }
        return lowerOrDigit(first) && id.unicodeScalars.allSatisfy { lowerOrDigit($0) || $0 == "-" }
    }

    /// "feud__protoqa-004" → ("feud", "protoqa-004"). Nil for anything else.
    static func parse(stem: String) -> (game: String, id: String)? {
        let parts = stem.components(separatedBy: "__")
        guard parts.count == 2, ["jeopardy", "feud"].contains(parts[0]), isValidID(parts[1]) else { return nil }
        return (parts[0], parts[1])
    }

    /// Every such file in the app bundle: `[game: [id: json text]]`.
    static func load(from bundle: Bundle = .main) -> [String: [String: String]] {
        var found: [String: [String: String]] = [:]
        for url in bundle.urls(forResourcesWithExtension: "json", subdirectory: nil) ?? [] {
            guard let parsed = parse(stem: url.deletingPathExtension().lastPathComponent),
                  let text = try? String(contentsOf: url, encoding: .utf8) else { continue }
            found[parsed.game, default: [:]][parsed.id] = text
        }
        return found
    }

    /// The sets that ship with the app (sets.json), then the local files on top.
    static func merged(_ shipped: [String: [String: String]], _ local: [String: [String: String]]) -> [String: [String: String]] {
        var result = shipped
        for (game, sets) in local { result[game, default: [:]].merge(sets) { _, new in new } }
        return result
    }
}
