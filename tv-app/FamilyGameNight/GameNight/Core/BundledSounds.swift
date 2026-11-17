import Foundation

/// Your own sound files, copied into the app on your Mac (see Tools/install-sounds.sh). They are not in the git
/// repository: the audio is not ours to publish. A file is named `<game>__<name>.<ext>`: the game is `jeopardy`,
/// `feud`, or `shared` for a file every game uses, and the name is a sound such as `think` or `ding`.
enum BundledSounds {
    static let extensions = ["mp3", "m4a", "wav"]

    /// "feud__ding" → ("feud", "ding"); "shared__think" → (nil, "think"). Nil for anything else.
    static func parse(stem: String) -> (game: String?, name: String)? {
        let parts = stem.components(separatedBy: "__")
        guard parts.count == 2, !parts[1].isEmpty else { return nil }
        let game = parts[0]
        guard ["shared", "jeopardy", "feud"].contains(game) else { return nil }
        return (game == "shared" ? nil : game, parts[1])
    }

    /// The key `SoundDirector` stores a file under: "name", or "game/name" for one game's own file.
    static func key(game: String?, name: String) -> String { game.map { "\($0)/\(name)" } ?? name }

    /// Every usable file in the app bundle, by key. Only names the app knows are kept.
    static func load(from bundle: Bundle = .main) -> [String: Data] {
        var found: [String: Data] = [:]
        for ext in extensions {
            for url in bundle.urls(forResourcesWithExtension: ext, subdirectory: nil) ?? [] {
                let stem = url.deletingPathExtension().lastPathComponent
                guard let parsed = parse(stem: stem), SoundCue.customNames.contains(parsed.name),
                      let data = try? Data(contentsOf: url) else { continue }
                found[key(game: parsed.game, name: parsed.name)] = data
            }
        }
        return found
    }
}
