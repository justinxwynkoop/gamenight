import AVFoundation
import SwiftUI
import UIKit

/// A clue's video, shown big over the clue while it plays (ClipStage in SoundDirector.swift plays it), with its credit.
struct ClipOverlay: View {
    @ObservedObject var stage = ClipStage.shared

    var body: some View {
        if let player = stage.video {
            ZStack {
                Color.black.opacity(0.88)
                VStack(spacing: 18) {
                    PlayerLayerView(player: player)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 18))
                        .shadow(radius: 30)
                    if let credit = stage.credit {
                        Text(credit)
                            .font(JP.text(22))
                            .foregroundStyle(Color.white.opacity(0.7))
                            .lineLimit(1)
                    }
                }
                .padding(.horizontal, 160)
                .padding(.vertical, 80)
            }
            .transition(.opacity)
            .allowsHitTesting(false)
        }
    }
}

/// Draws an AVPlayer with no playback controls (the remote stays with the game).
private struct PlayerLayerView: UIViewRepresentable {
    let player: AVPlayer

    final class Host: UIView {
        override class var layerClass: AnyClass { AVPlayerLayer.self }
        var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
    }

    func makeUIView(context: Context) -> Host {
        let view = Host()
        view.playerLayer.videoGravity = .resizeAspect
        view.backgroundColor = .black
        view.playerLayer.player = player
        return view
    }

    func updateUIView(_ view: Host, context: Context) {
        if view.playerLayer.player !== player { view.playerLayer.player = player }
    }
}
