import AVFoundation
import Foundation

/// The theme that loops on the main menu: `shared__lobby` from the app bundle (the CC0 "Happy Dance", or a family's own
/// file of that name). Each game's lobby plays the same theme through its own sound player, so this one stops when a
/// game opens and starts again when you come back.
@MainActor
final class MenuMusic {
    static let shared = MenuMusic()

    private var player: AVAudioPlayer?

    private init() {}

    var isPlaying: Bool { player?.isPlaying == true }

    func start() {
        if isPlaying { return }
        if player == nil {
            guard let url = Self.themeURL(), let made = try? AVAudioPlayer(contentsOf: url) else { return }
            made.numberOfLoops = -1
            made.prepareToPlay()
            player = made
        }
        // Configure the audio session off the main thread (Xcode warns that it can hang the screen otherwise).
        Task.detached(priority: .utility) {
            let session = AVAudioSession.sharedInstance()
            try? session.setCategory(.playback, mode: .default)
            try? session.setActive(true)
        }
        guard let player else { return }
        player.volume = 0
        player.play()
        player.setVolume(0.4, fadeDuration: 1.2)
    }

    func stop() {
        player?.stop()
        player?.currentTime = 0
    }

    private static func themeURL() -> URL? {
        for ext in BundledSounds.extensions {
            if let url = Bundle.main.url(forResource: "shared__lobby", withExtension: ext) { return url }
        }
        return nil
    }
}
