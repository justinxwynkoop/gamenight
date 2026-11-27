import SpriteKit
import SwiftUI

/// Fireworks and two confetti cannons for the biggest moments of a game night: a champion, a winning team, a trophy,
/// a SINGO. SpriteKit draws the particles on the GPU, so a few hundred pieces cost the Apple TV next to nothing, and
/// the burst sits behind (or over) any SwiftUI screen on a clear background.
///
/// Feedback scales with rarity: `.finale` (the end of a game) keeps launching fireworks for as long as the screen is
/// up; `.moment` (a trophy, a SINGO) is one cannon blast and two fireworks, then it is quiet again.
/// With Reduce Motion on (Settings, Accessibility) nothing is drawn; the screen around it already says who won.
struct CelebrationBurst: View {
    enum Kind { case finale, moment }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scene: CelebrationScene

    init(colors: [Color], kind: Kind = .finale) {
        let palette = (colors.isEmpty ? [Color.yellow, .pink, .cyan, .green, .white] : colors).map { UIColor($0) }
        _scene = State(initialValue: CelebrationScene(palette: palette, finale: kind == .finale))
    }

    var body: some View {
        Group {
            if !reduceMotion {
                SpriteView(scene: scene, preferredFramesPerSecond: 60, options: [.allowsTransparency])
            }
        }
        .allowsHitTesting(false)
        .ignoresSafeArea()
    }
}

/// The scene behind `CelebrationBurst`. Bottom-left origin, sized to the view (`.resizeFill`), so every position is a
/// fraction of the screen. Every emitter has a fixed number of particles and removes itself when they are gone, so
/// nothing piles up however long the winner screen stays on.
final class CelebrationScene: SKScene {
    private let palette: [UIColor]
    private let finale: Bool
    private var launched = false

    init(palette: [UIColor], finale: Bool) {
        self.palette = palette
        self.finale = finale
        super.init(size: CGSize(width: 1920, height: 1080))
        scaleMode = .resizeFill
        anchorPoint = .zero
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func didMove(to view: SKView) {
        view.allowsTransparency = true
        view.backgroundColor = .clear
        view.ignoresSiblingOrder = true
        // SwiftUI can hand the same scene to a new view (a redraw); only the first time starts the show.
        guard !launched else { return }
        launched = true

        run(.sequence([.wait(forDuration: 0.15), .run { [weak self] in self?.cannons() }]))
        let first = SKAction.sequence((0..<(finale ? 4 : 2)).map { i -> SKAction in
            SKAction.sequence([.wait(forDuration: 0.5 + Double(i) * 0.45), .run { [weak self] in self?.rocket() }])
        })
        guard finale else { run(first); return }
        // Then a firework every couple of seconds, and a second cannon blast now and then.
        let encore = SKAction.repeatForever(.sequence([
            .wait(forDuration: 1.9, withRange: 1.2),
            .run { [weak self] in self?.rocket() },
        ]))
        let cannonsAgain = SKAction.repeatForever(.sequence([
            .wait(forDuration: 9, withRange: 3),
            .run { [weak self] in self?.cannons() },
        ]))
        run(.sequence([first, .group([encore, cannonsAgain])]))
    }

    // MARK: Confetti cannons

    /// Paper shot up from both bottom corners towards the middle, falling back down under gravity.
    private func cannons() {
        let w = size.width
        cannon(at: CGPoint(x: w * 0.02, y: -20), angle: .pi * 0.36)
        cannon(at: CGPoint(x: w * 0.98, y: -20), angle: .pi * 0.64)
    }

    private func cannon(at point: CGPoint, angle: CGFloat) {
        let lift = max(size.height, 600)
        // One emitter per colour (an emitter tints all its particles one way); five colours is plenty.
        for color in palette.prefix(5) {
            let paper = SKEmitterNode()
            paper.particleTexture = CelebrationTextures.paper
            paper.particleBirthRate = 500
            paper.numParticlesToEmit = finale ? 46 : 30
            paper.particleLifetime = 4.2
            paper.particleLifetimeRange = 1.4
            paper.emissionAngle = angle
            paper.emissionAngleRange = .pi / 8
            paper.particleSpeed = lift * 1.25
            paper.particleSpeedRange = lift * 0.45
            paper.yAcceleration = -lift * 0.85
            paper.xAcceleration = 0
            paper.particlePositionRange = CGVector(dx: 40, dy: 10)
            paper.particleRotation = 0
            paper.particleRotationRange = .pi * 2
            paper.particleRotationSpeed = 5
            paper.particleScale = 1.1
            paper.particleScaleRange = 0.6
            paper.particleColor = color
            paper.particleColorBlendFactor = 1
            paper.particleAlphaSequence = SKKeyframeSequence(keyframeValues: [1.0, 1.0, 0.0], times: [0, 0.8, 1])
            paper.position = point
            paper.zPosition = 2
            addChild(paper)
            paper.run(.sequence([.wait(forDuration: 7), .removeFromParent()]))
        }
    }

    // MARK: Fireworks

    /// A rocket goes up with a short trail and bursts into a ring of sparks somewhere in the top of the screen.
    private func rocket() {
        let w = size.width, h = size.height
        let target = CGPoint(x: w * CGFloat.random(in: 0.12...0.88), y: h * CGFloat.random(in: 0.58...0.88))
        let start = CGPoint(x: target.x + CGFloat.random(in: -80...80), y: -10)
        let color = palette.randomElement() ?? .white

        let shell = SKNode()
        shell.position = start
        shell.zPosition = 1
        let trail = SKEmitterNode()
        trail.particleTexture = CelebrationTextures.spark
        trail.particleBirthRate = 90
        trail.particleLifetime = 0.45
        trail.particleSpeed = 30
        trail.emissionAngle = -.pi / 2
        trail.emissionAngleRange = 0.4
        trail.particleScale = 0.28
        trail.particleScaleSpeed = -0.5
        trail.particleColor = color.mixed(with: .white, 0.5)
        trail.particleColorBlendFactor = 1
        trail.particleAlphaSequence = SKKeyframeSequence(keyframeValues: [0.9, 0.0], times: [0, 1])
        trail.particleBlendMode = .add
        trail.targetNode = self
        shell.addChild(trail)
        addChild(shell)

        let rise = SKAction.move(to: target, duration: 0.7)
        rise.timingMode = .easeOut
        shell.run(.sequence([
            rise,
            .run { [weak self] in self?.burst(at: target, color: color) },
            .run { trail.particleBirthRate = 0 },
            .wait(forDuration: 0.6),
            .removeFromParent(),
        ]))
    }

    private func burst(at point: CGPoint, color: UIColor) {
        let reach = max(size.height, 600) * 0.4

        let flash = SKSpriteNode(texture: CelebrationTextures.spark)
        flash.position = point
        flash.zPosition = 1
        flash.blendMode = .add
        flash.color = color.mixed(with: .white, 0.6)
        flash.colorBlendFactor = 1
        flash.setScale(0.5)
        addChild(flash)
        flash.run(.sequence([.group([.scale(to: 5, duration: 0.25), .fadeOut(withDuration: 0.35)]), .removeFromParent()]))

        let sparks = SKEmitterNode()
        sparks.particleTexture = CelebrationTextures.spark
        sparks.particleBirthRate = 6000
        sparks.numParticlesToEmit = finale ? 140 : 110
        sparks.particleLifetime = 1.5
        sparks.particleLifetimeRange = 0.5
        sparks.emissionAngleRange = .pi * 2
        sparks.particleSpeed = reach
        sparks.particleSpeedRange = reach * 0.35
        sparks.yAcceleration = -reach * 0.55
        sparks.particleScale = 0.42
        sparks.particleScaleRange = 0.18
        sparks.particleScaleSpeed = -0.22
        sparks.particleColor = color
        sparks.particleColorBlendFactor = 1
        sparks.particleAlphaSequence = SKKeyframeSequence(keyframeValues: [1.0, 0.85, 0.0], times: [0, 0.55, 1])
        sparks.particleBlendMode = .add
        sparks.position = point
        sparks.zPosition = 1
        addChild(sparks)
        sparks.run(.sequence([.wait(forDuration: 2.4), .removeFromParent()]))
    }
}

/// Two tiny textures drawn once in code (no image files): a strip of paper and a soft round spark.
private enum CelebrationTextures {
    static let paper: SKTexture = {
        let image = UIGraphicsImageRenderer(size: CGSize(width: 16, height: 9)).image { _ in
            UIColor.white.setFill()
            UIBezierPath(roundedRect: CGRect(x: 0, y: 0, width: 16, height: 9), cornerRadius: 2).fill()
        }
        return SKTexture(image: image)
    }()

    static let spark: SKTexture = {
        let side: CGFloat = 32
        let image = UIGraphicsImageRenderer(size: CGSize(width: side, height: side)).image { context in
            let colors = [UIColor.white.cgColor, UIColor.white.withAlphaComponent(0.55).cgColor, UIColor.white.withAlphaComponent(0).cgColor]
            guard let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0, 0.35, 1]) else { return }
            let center = CGPoint(x: side / 2, y: side / 2)
            context.cgContext.drawRadialGradient(gradient, startCenter: center, startRadius: 0, endCenter: center, endRadius: side / 2, options: [])
        }
        return SKTexture(image: image)
    }()
}

private extension UIColor {
    /// This colour moved `amount` (0 to 1) of the way towards `other`.
    func mixed(with other: UIColor, _ amount: CGFloat) -> UIColor {
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
        var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        guard getRed(&r1, green: &g1, blue: &b1, alpha: &a1), other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2) else { return self }
        return UIColor(red: r1 + (r2 - r1) * amount, green: g1 + (g2 - g1) * amount, blue: b1 + (b2 - b1) * amount, alpha: a1 + (a2 - a1) * amount)
    }
}
